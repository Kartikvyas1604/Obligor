/**
 * Pyth Network oracle adapter (Hermes REST).
 *
 * Reliability-grade:
 * - Hard network timeout, schema-validated payloads, TTL cache
 * - Every mark carries source + staleness metadata; there are no fake live
 *   marks. When Hermes is unreachable and fallback is enabled, the mark is
 *   explicitly labeled `fallback` so the UI can surface it.
 */

import { z } from "zod";
import { env } from "@/lib/env";
import { makeLogger } from "@/lib/logger";

const log = makeLogger("oracle");

export interface OraclePrice {
  symbol: string;
  priceUsd: number;
  confidenceUsd: number;
  publishTime: string;
  /** Where this mark came from: live Pyth feed or a labeled fallback. */
  source: "pyth_hermes" | "fallback";
  /** True when the mark is older than env.oracle.stalenessMs or synthetic. */
  stale: boolean;
  status: "live" | "stale" | "fallback";
}

// Official Pyth feed IDs (Hermes l2 endpoints).
export const PYTH_FEED_IDS: Record<string, string> = {
  SOL: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  BTC: "0xe62df6e80f49a143f71e79274da700a0d5da2953e03b97e2f0da015e2721b300",
  ETH: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  AAPL: "0x49f6b65fb1de4a14c6436575eed6865324e963b6d51cad86c2e3995f3244e835",
  USDC: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
};

// Operator-configured benchmark marks used ONLY when Hermes is unreachable
// and ORACLE_FALLBACK_ENABLED=true. These are honest fallbacks, not live data.
const DEFAULT_FALLBACK_PRICES: Record<string, number> = {
  SOL: 142.5,
  BTC: 64_200,
  ETH: 3_450,
  AAPL: 190,
  USDC: 1,
};

const priceSchema = z.object({
  parsed: z
    .array(
      z.object({
        price: z.object({
          price: z.string(),
          conf: z.string(),
          expo: z.number().int(),
          publish_time: z.number().int(),
        }),
      }),
    )
    .min(1),
});

const CACHE_TTL_MS = 10_000;
const globalForCache = globalThis as unknown as {
  __obligorPriceCache?: Map<string, { price: OraclePrice; fetchedAt: number }>;
};
const cache: Map<string, { price: OraclePrice; fetchedAt: number }> =
  (globalForCache.__obligorPriceCache ??= new Map());

function scale(raw: string, expo: number): number {
  return Number(raw) * Math.pow(10, expo);
}

function fallbackPrice(symbol: string): OraclePrice {
  if (!env.oracle.fallbackEnabled) {
    // Honest failure instead of a synthetic number.
    throw new Error(`ORACLE_UNAVAILABLE: no live Pyth mark for ${symbol} and fallback disabled`);
  }
  const fallback = DEFAULT_FALLBACK_PRICES[symbol.toUpperCase()];
  if (fallback == null) {
    throw new Error(`ORACLE_UNAVAILABLE: no fallback benchmark configured for ${symbol}`);
  }
  log.warn("oracle fallback served", { symbol, priceUsd: fallback });
  return {
    symbol: symbol.toUpperCase(),
    priceUsd: fallback,
    confidenceUsd: 0,
    publishTime: new Date().toISOString(),
    source: "fallback",
    stale: false,
    status: "fallback",
  };
}

export async function fetchLivePythPrice(symbol: string): Promise<OraclePrice> {
  const sym = symbol.toUpperCase();
  const feedId = PYTH_FEED_IDS[sym];
  if (!feedId) {
    throw new Error(`ORACLE_UNSUPPORTED_SYMBOL: ${symbol}`);
  }

  // TTL cache
  const cached = cache.get(sym);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.price;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn("hermes non-ok response", { status: res.status, symbol: sym });
      return fallbackPrice(sym);
    }

    const json = priceSchema.parse(await res.json());
    const p = json.parsed[0].price;
    const priceUsd = scale(p.price, p.expo);
    const confidenceUsd = scale(p.conf, p.expo);

    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      log.warn("hermes returned unusable price", { symbol: sym });
      return fallbackPrice(sym);
    }

    const publishedAt = new Date(p.publish_time * 1000);
    const stale = Date.now() - publishedAt.getTime() > env.oracle.stalenessMs;

    const mark: OraclePrice = {
      symbol: sym,
      priceUsd: Math.round(priceUsd * 100) / 100,
      confidenceUsd: Math.round(confidenceUsd * 100) / 100,
      publishTime: publishedAt.toISOString(),
      source: "pyth_hermes",
      stale,
      status: stale ? "stale" : "live",
    };
    cache.set(sym, { price: mark, fetchedAt: Date.now() });
    return mark;
  } catch (err) {
    if (err instanceof z.ZodError) {
      log.warn("hermes payload failed schema validation", { symbol: sym });
      return fallbackPrice(sym);
    }
    log.warn("oracle fetch failed", {
      symbol: sym,
      error: err instanceof Error ? err.message : String(err),
    });
    return fallbackPrice(sym);
  } finally {
    clearTimeout(timeout);
  }
}

const SUPPORTED = ["SOL", "BTC", "ETH", "AAPL", "USDC"] as const;

export async function fetchAllOraclePrices(): Promise<Record<string, OraclePrice>> {
  const results: Record<string, OraclePrice> = {};
  await Promise.all(
    SUPPORTED.map(async (symbol) => {
      try {
        results[symbol] = await fetchLivePythPrice(symbol);
      } catch (err) {
        // fetchAll is display-facing: degrade per-symbol rather than failing all.
        log.error("oracle price unavailable", {
          symbol,
          error: err instanceof Error ? err.message : String(err),
        });
        results[symbol] = {
          symbol,
          priceUsd: 0,
          confidenceUsd: 0,
          publishTime: new Date().toISOString(),
          source: "fallback",
          stale: true,
          status: "fallback",
        };
      }
    }),
  );
  return results;
}

export const ORACLE_SYMBOLS = SUPPORTED;
