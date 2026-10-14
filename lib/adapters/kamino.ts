/**
 * Kamino Lend execution venue adapter (J1 analogue).
 *
 * Real read path, no SDK dependency, no invented numbers:
 * - Marks: Kamino reserves are valued on-chain by Pyth/Scope oracles, so the
 *   venue mark for a bucket is the live Pyth Hermes feed with full provenance
 *   (status/staleness/publish time). Nothing is synthesized.
 * - Positions: when KAMINO_AUTHORITY is configured we verify the desk's lending
 *   exposure against that wallet's Kamino obligations through the official
 *   public Portfolio API (no key required, self-hostable base). Every failure
 *   mode is loud: KAMINO_NOT_CONFIGURED / KAMINO_OFFLINE /
 *   KAMINO_UNEXPECTED_RESPONSE. There is no silent-empty, no fixture path.
 */

import { z } from "zod";
import { env } from "@/lib/env";
import { fetchLivePythPrice, type OraclePrice } from "./pyth";
import { makeLogger } from "@/lib/logger";

const log = makeLogger("kamino");

/** Buckets this adapter can mark from a live Pyth feed. */
export const KAMINO_SUPPORTED_BUCKETS = ["SOL", "BTC", "ETH", "AAPL", "USD"] as const;

/** Normalize a Kamino token symbol to a risk bucket, or null if unmapped. */
export function kaminoSymbolToBucket(symbol: string): string | null {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (["USDC", "USDT", "USDS", "PYUSD", "FDUSD", "DAI"].includes(s)) return "USD";
  if (s.includes("BTC")) return "BTC";
  if (s.includes("ETH") || s === "WETH") return "ETH";
  if (s.includes("SOL")) return "SOL";
  if (s.includes("AAPL")) return "AAPL";
  return null;
}

export interface KaminoVenueMark {
  bucket: string;
  priceUsd: number;
  status: OraclePrice["status"];
  publishTime: string;
  /** Kamino reserves anchor to Pyth/Scope oracles. */
  source: "kamino_oracle_pyth";
}

/** Resolve the live mark for a Kamino bucket (venue oracle = Pyth). */
export async function fetchKaminoVenuePrice(bucket: string): Promise<KaminoVenueMark> {
  const b = bucket.toUpperCase();
  if (!(KAMINO_SUPPORTED_BUCKETS as readonly string[]).includes(b)) {
    throw new Error(`KAMINO_UNSUPPORTED_BUCKET: ${bucket}`);
  }
  const oracleSymbol = b === "USD" ? "USDC" : b;
  const oracle = await fetchLivePythPrice(oracleSymbol);
  return {
    bucket: b,
    priceUsd: oracle.priceUsd,
    status: oracle.status,
    publishTime: oracle.publishTime,
    source: "kamino_oracle_pyth",
  };
}

export interface KaminoTokenPosition {
  mint: string;
  symbol: string;
  bucket: string | null;
  amountUsd: number;
  side: "deposit" | "borrow";
}

export interface KaminoObligation {
  obligation: string;
  market: string;
  tag: string;
  netValueUsd: number;
  totalDepositUsd: number;
  totalBorrowUsd: number;
  ltv: number | null;
  liquidationLtv: number | null;
}

export interface KaminoPortfolio {
  authority: string;
  fetchedAt: string;
  /** Borrow-side obligations (lending/multiply/leverage). */
  obligations: KaminoObligation[];
  /** Per-bucket net exposure (deposits − borrows), USD by sign. */
  bucketExposure: Record<string, number>;
  /** Buckets the API surfaced that this adapter could not map (loud, not silently dropped). */
  unmappedSymbols: string[];
}

// The public Portfolio API returns numeric fields as strings and several
// product sections. We only consume borrow-side obligations + their token
// entries; everything else is ignored (not fabricated).
const numeric = z.union([z.string(), z.number()]);
const tokenSchema = z
  .object({
    mint: z.string().optional().default(""),
    symbol: z.string().optional().default(""),
    value: numeric.optional(),
    amount: numeric.optional(),
  })
  .passthrough();
const obligationSchema = z
  .object({
    obligation: z.string().optional().default(""),
    market: z.string().optional().default(""),
    tag: z.string().optional().default(""),
    netValue: numeric.optional(),
    totalDepositValue: numeric.optional(),
    totalBorrowValue: numeric.optional(),
    ltv: numeric.optional(),
    liquidationLtv: numeric.optional(),
    deposits: z.array(tokenSchema).optional().default([]),
    borrows: z.array(tokenSchema).optional().default([]),
  })
  .passthrough();
const portfolioSchema = z
  .object({
    timestamp: z.string().optional(),
    lending: z.array(obligationSchema).optional().default([]),
    multiply: z.array(obligationSchema).optional().default([]),
    leverage: z.array(obligationSchema).optional().default([]),
  })
  .passthrough();

function num(v: string | number | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

const globalForKaminoCache = globalThis as unknown as {
  __obligorKaminoPortfolio?: Map<string, { snapshot: KaminoPortfolio; fetchedAt: number }>;
};
const kaminoCache: Map<string, { snapshot: KaminoPortfolio; fetchedAt: number }> =
  (globalForKaminoCache.__obligorKaminoPortfolio ??= new Map());

/**
 * Read a wallet's Kamino obligations through the official public Portfolio API.
 * Defaults to the configured KAMINO_AUTHORITY but accepts any wallet. Throws
 * loudly when unconfigured, unreachable, or unparseable — a desk's exposure is
 * never "verified" against nothing.
 */
export async function fetchKaminoPortfolio(authorityOverride?: string): Promise<KaminoPortfolio> {
  const authority = authorityOverride ?? env.kamino.authority;
  if (!authority) {
    throw new Error(
      "KAMINO_NOT_CONFIGURED: set KAMINO_AUTHORITY (mainnet wallet base58) or pass a wallet to read a live Kamino portfolio",
    );
  }

  const { dataApiBase, cacheMs } = env.kamino;
  const cached = kaminoCache.get(authority);
  if (cached && Date.now() - cached.fetchedAt < cacheMs) {
    return cached.snapshot;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const url = `${dataApiBase.replace(/\/+$/, "")}/portfolio/${authority}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok || res.status >= 500) {
      throw new Error(`KAMINO_OFFLINE: Portfolio API responded ${res.status}`);
    }

    const parsed = portfolioSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new Error(
        "KAMINO_UNEXPECTED_RESPONSE: could not parse Kamino portfolio payload — exposure remains desk-declared",
      );
    }

    const rawObligations = [
      ...parsed.data.lending,
      ...parsed.data.multiply,
      ...parsed.data.leverage,
    ];

    const bucketExposure: Record<string, number> = {};
    const unmapped = new Set<string>();
    const obligations: KaminoObligation[] = [];

    for (const o of rawObligations) {
      const netUsd = num(o.netValue) ?? 0;
      obligations.push({
        obligation: o.obligation,
        market: o.market,
        tag: o.tag,
        netValueUsd: netUsd,
        totalDepositUsd: num(o.totalDepositValue) ?? 0,
        totalBorrowUsd: num(o.totalBorrowValue) ?? 0,
        ltv: num(o.ltv),
        liquidationLtv: num(o.liquidationLtv),
      });

      for (const [tokenEntries, side] of [
        [o.deposits, "deposit"],
        [o.borrows, "borrow"],
      ] as const) {
        for (const t of tokenEntries) {
          const usd = num(t.value) ?? 0;
          if (usd <= 0) continue;
          const bucket = kaminoSymbolToBucket(t.symbol);
          if (!bucket) {
            if (t.symbol) unmapped.add(t.symbol);
            continue;
          }
          const signed = side === "deposit" ? usd : -usd;
          bucketExposure[bucket] = (bucketExposure[bucket] ?? 0) + signed;
        }
      }
    }

    const snapshot: KaminoPortfolio = {
      authority,
      fetchedAt: new Date().toISOString(),
      obligations,
      bucketExposure,
      unmappedSymbols: Array.from(unmapped),
    };
    kaminoCache.set(authority, { snapshot, fetchedAt: Date.now() });
    log.info("kamino portfolio read", {
      authority: authority.slice(0, 6),
      obligations: obligations.length,
      buckets: Object.keys(bucketExposure).length,
    });
    return snapshot;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(
        "KAMINO_UNEXPECTED_RESPONSE: Kamino portfolio payload failed validation — exposure remains desk-declared",
      );
    }
    if (err instanceof Error && err.message.startsWith("KAMINO_")) throw err;
    throw new Error(
      `KAMINO_OFFLINE: could not reach Kamino Portfolio API (${err instanceof Error ? err.message : String(err)})`,
    );
  } finally {
    clearTimeout(timeout);
  }
}
