/**
 * Drift Protocol execution venue adapter (J1).
 *
 * Real read path, no SDK dependency, no invented numbers:
 * - Marks: Drift perp markets anchor on-chain to Pyth oracles, so the venue
 *   mark for SOL-PERP/BTC-PERP/ETH-PERP is the live Pyth Hermes feed with
 *   full provenance (status/staleness/publish time). Nothing is synthesized.
 * - Subaccount: when DRIFT_AUTHORITY is configured we verify the desk's perp
 *   exposure against that mainnet Drift user's positions through the official
 *   Drift Data API (self-hostable base). Every failure mode is loud:
 *   DRIFT_SUBACCOUNT_NOT_CONFIGURED / DRIFT_OFFLINE / DRIFT_UNEXPECTED_RESPONSE.
 *   There is no silent-empty, no fixture-substitution path in here.
 */

import { z } from "zod";
import { env } from "@/lib/env";
import { fetchLivePythPrice, type OraclePrice } from "./pyth";
import { makeLogger } from "@/lib/logger";

const log = makeLogger("drift");

export const DRIFT_PERP_INSTRUMENTS = ["SOL-PERP", "BTC-PERP", "ETH-PERP"] as const;
// Drift perp market index → instrument (perp market 0 = SOL-PERP, 1 = BTC-PERP, ...).
const INDEX_TO_INSTRUMENT: Record<number, string> = {
  0: "SOL-PERP",
  1: "BTC-PERP",
  2: "ETH-PERP",
};
const INSTRUMENT_TO_BUCKET: Record<string, string> = {
  "SOL-PERP": "SOL",
  "BTC-PERP": "BTC",
  "ETH-PERP": "ETH",
};
const INSTRUMENT_TO_INDEX: Record<string, number> = {
  "SOL-PERP": 0,
  "BTC-PERP": 1,
  "ETH-PERP": 2,
};

/** Bucket → the Drift perp instrument that carries that risk factor. */
export const PERP_INSTRUMENT_FOR_BUCKET: Record<string, string> = {
  SOL: "SOL-PERP",
  BTC: "BTC-PERP",
  ETH: "ETH-PERP",
};

export interface DriftVenueMark {
  instrument: string;
  marketIndex: number;
  bucket: string;
  priceUsd: number;
  status: OraclePrice["status"];
  publishTime: string;
  /** The venue's own oracle source: Drift perps anchor to Pyth feeds. */
  source: "drift_oracle_pyth";
}

/** Resolve the live mark for a Drift perp instrument (venue oracle = Pyth). */
export async function fetchDriftVenuePrice(instrument: string): Promise<DriftVenueMark> {
  const normalized = instrument.toUpperCase();
  const bucket = INSTRUMENT_TO_BUCKET[normalized];
  if (!bucket) {
    throw new Error(
      `DRIFT_UNSUPPORTED_INSTRUMENT: ${instrument} (supported: ${DRIFT_PERP_INSTRUMENTS.join(", ")})`,
    );
  }
  const oracle = await fetchLivePythPrice(bucket);
  return {
    instrument: normalized,
    marketIndex: INSTRUMENT_TO_INDEX[normalized],
    bucket,
    priceUsd: oracle.priceUsd,
    status: oracle.status,
    publishTime: oracle.publishTime,
    source: "drift_oracle_pyth",
  };
}

export interface DriftPerpExposure {
  marketIndex: number;
  symbol: string;
  bucket: string;
  side: "long" | "short";
  /** Absolute notional in USD at the venue's live mark. */
  usd: number;
  /** Provenance of the mark used to size the notional (live vs. labeled fallback). */
  markStatus: OraclePrice["status"];
}

export interface DriftSubAccount {
  authority: string;
  subAccountId: number;
  fetchedAt: string;
  perpExposures: DriftPerpExposure[];
}

// Envelope for the official Drift Data API. Accepts the user payload either
// at the top level or nested under `data`; anything else is treated as a
// shape it cannot verify (loud error, never fabricated numbers).
const amount = z.union([z.string(), z.number()]);
const perpSlotSchema = z.object({
  marketIndex: z.number().int().nonnegative(),
  // baseAssetAmount is the on-chain perp quantity (positive long, negative
  // short). It MUST be present — we never assume a default position size.
  baseAssetAmount: amount,
});
const payloadSchema = z.union([
  z.object({ perpPositions: z.array(perpSlotSchema) }),
  z.object({ data: z.object({ perpPositions: z.array(perpSlotSchema) }) }),
]);

const globalForDriftCache = globalThis as unknown as {
  __obligorDriftSubAccount?: Map<string, { snapshot: DriftSubAccount; fetchedAt: number }>;
};
const driftCache: Map<string, { snapshot: DriftSubAccount; fetchedAt: number }> = (globalForDriftCache.__obligorDriftSubAccount ??=
  new Map());

/**
 * Read a Drift mainnet user's perp positions through the Drift Data API.
 * Defaults to the configured DRIFT_AUTHORITY, but accepts a specific mainnet
 * wallet so callers can read any desk's live exposure. Throws loudly when
 * unconfigured, unreachable, or unparseable — a desk's exposure is never
 * "verified" against nothing.
 */
export async function fetchDriftSubAccount(authorityOverride?: string): Promise<DriftSubAccount> {
  const authority = authorityOverride ?? env.drift.authority;
  if (!authority) {
    throw new Error(
      "DRIFT_SUBACCOUNT_NOT_CONFIGURED: set DRIFT_AUTHORITY (mainnet wallet base58) or pass a wallet to read a live Drift subaccount",
    );
  }

  const { subAccountId, dataApiBase } = env.drift;
  const cacheKey = `${authority}:${subAccountId}`;
  const cached = driftCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < env.drift.subAccountCacheMs) {
    return cached.snapshot;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const url = `${dataApiBase.replace(/\/+$/, "")}/users/${authority}?subAccountId=${subAccountId}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok || res.status >= 500) {
      throw new Error(`DRIFT_OFFLINE: Data API responded ${res.status}`);
    }

    const parsed = payloadSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new Error(
        "DRIFT_UNEXPECTED_RESPONSE: could not parse Drift subaccount payload — exposure remains desk-declared",
      );
    }
    const slots = "data" in parsed.data ? parsed.data.data.perpPositions : parsed.data.perpPositions;

    const perpExposures: DriftPerpExposure[] = [];
    for (const slot of slots) {
      const symbol = INDEX_TO_INSTRUMENT[slot.marketIndex];
      if (!symbol) {
        log.warn("drift market index not mapped, omitted", { marketIndex: slot.marketIndex });
        continue;
      }
      const baseAssetAmount = Number(slot.baseAssetAmount);
      if (!Number.isFinite(baseAssetAmount) || baseAssetAmount === 0) {
        log.warn("drift slot has no base asset amount, omitted", { marketIndex: slot.marketIndex });
        continue;
      }
      const mark = await fetchDriftVenuePrice(symbol);
      const usd = Math.round(Math.abs(baseAssetAmount) * mark.priceUsd * 100) / 100;
      if (!Number.isFinite(usd) || usd <= 0) continue;
      perpExposures.push({
        marketIndex: slot.marketIndex,
        symbol,
        bucket: INSTRUMENT_TO_BUCKET[symbol],
        side: baseAssetAmount > 0 ? "long" : "short",
        usd,
        markStatus: mark.status,
      });
    }

    const snapshot: DriftSubAccount = {
      authority,
      subAccountId,
      fetchedAt: new Date().toISOString(),
      perpExposures,
    };
    driftCache.set(cacheKey, {
      snapshot,
      fetchedAt: Date.now(),
    });
    log.info("drift subaccount read", { authority: authority.slice(0, 8), exposures: perpExposures.length });
    return snapshot;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(
        "DRIFT_UNEXPECTED_RESPONSE: Drift subaccount payload failed validation — exposure remains desk-declared",
      );
    }
    if (err instanceof Error && err.message.startsWith("DRIFT_")) throw err;
    throw new Error(
      `DRIFT_OFFLINE: could not reach Drift Data API (${err instanceof Error ? err.message : String(err)})`,
    );
  } finally {
    clearTimeout(timeout);
  }
}