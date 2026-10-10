/**
 * Position ingestion pipeline.
 *
 * Authoritative path for turning desk-supplied leg inputs into normalized,
 * oracle-priced PositionLegs. It never trusts client-side sign exposure,
 * notional, or vendor shortcuts, and it labels every mark with provenance.
 *
 * Pipeline: zod validation → limits → oracle re-pricing per bucket
 * (desk-mark fallback labeled honestly) → side normalization → returns
 * normalized legs plus non-fatal warnings for the UI.
 */

import { z } from "zod";
import { type PositionBook, type PositionLeg, type Side } from "./margin";
import { env } from "./env";
import { fetchLivePythPrice, type OraclePrice } from "./adapters/pyth";
import { BUCKET_ORACLE_SYMBOL } from "./adapters/venues";
import { makeLogger } from "./logger";
import { ApiError } from "./http";

const log = makeLogger("positions");

const SIDE_SCHEMA = z.enum(["long", "short", "lend", "borrow"]);
const NEGATIVE_SIDES: ReadonlySet<Side> = new Set(["short", "borrow"]);

const rawLegSchema = z.object({
  party: z.enum(["A", "B"]).optional(),
  venue: z.enum(["drift", "kamino", "mock_equity", "monad_fixture", "manual"]).default("manual"),
  instrument: z.string().trim().min(1).max(40),
  bucket: z.string().trim().min(1).max(8),
  side: SIDE_SCHEMA,
  qty: z.number().positive().max(1_000_000),
  markUsd: z.number().positive().max(10_000_000),
  haircut: z.number().min(0).max(1).optional(),
});
export const rawLegsSchema = z.array(rawLegSchema).max(env.positions.maxLegsPerBook);

export type RawLegInput = z.infer<typeof rawLegSchema>;

export interface PricedBook {
  legs: PositionLeg[];
  warnings: string[];
  priceSources: Record<string, OraclePrice>;
}

function defaultHaircut(bucket: string, side: Side): number {
  if (bucket === "AAPL") return env.positions.haircutEquity;
  if (side === "short" || side === "long") return env.positions.haircutPerp;
  if (side === "borrow") return env.positions.haircutPerp * 0.8;
  return env.positions.haircutSpot;
}

export type PositionSource = PositionLeg["source"];

export interface PriceOptions {
  source: PositionSource;
}

/** Utility for the UI/netting-calculator: build an oracle-priced leg from a notional target. */
export async function buildOraclePricedLeg(
  party: "A" | "B",
  opts: {
    venue: PositionLeg["venue"];
    instrument: string;
    bucket: string;
    side: Side;
    notionalUsd: number;
    source?: PositionSource;
  },
): Promise<PositionLeg> {
  const oracleSymbol = BUCKET_ORACLE_SYMBOL[opts.bucket.toUpperCase()] ?? null;
  let markUsd = 0;
  let source: PositionSource = opts.source ?? "manual";

  if (oracleSymbol) {
    try {
      const oracle = await fetchLivePythPrice(oracleSymbol);
      markUsd = oracle.priceUsd;
      source = oracle.status === "live" ? "live" : (oracle.status as PositionSource);
    } catch {
      markUsd = 0;
    }
  }
  if (!markUsd) {
    throw new Error(`ORACLE_UNAVAILABLE: cannot price ${opts.bucket} right now`);
  }

  const qty = opts.notionalUsd / markUsd;
  const notionalUsd = Math.round(qty * markUsd * 100) / 100;
  const signed = opts.side === "short" || opts.side === "borrow" ? -notionalUsd : notionalUsd;

  return {
    party,
    venue: opts.venue,
    instrument: opts.instrument,
    bucket: opts.bucket.toUpperCase(),
    side: opts.side,
    qty,
    notionalUsd,
    signedExposureUsd: signed,
    haircut: defaultHaircut(opts.bucket.toUpperCase(), opts.side),
    markUsd,
    source,
  };
}

/**
 * Validate, re-price, and normalize desk-supplied legs. `warnings` are
 * non-fatal observations for the UI; thrown errors are fatal (mapped to 422
 * by the API layer).
 */
export async function priceAndNormalizeLegs(
  party: "A" | "B",
  rawLegs: unknown,
  options: PriceOptions,
): Promise<PricedBook> {
  const parsed = rawLegsSchema.safeParse(rawLegs);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      issues[0] ? `${issues[0].path}: ${issues[0].message}` : "Invalid desk-supplied legs",
      issues,
    );
  }
  const input = parsed.data;

  const warnings: string[] = [];
  const legs: PositionLeg[] = [];
  const priceSources: Record<string, OraclePrice> = {};

  // Fetch oracle marks once per bucket; share the round-trip across legs.
  const marksByBucket = new Map<string, { markUsd: number; oracle: OraclePrice | null }>();
  for (const leg of input) {
    const bucket = leg.bucket.toUpperCase();
    if (marksByBucket.has(bucket)) continue;

    const oracleSymbol = BUCKET_ORACLE_SYMBOL[bucket] ?? null;
    if (!oracleSymbol) {
      marksByBucket.set(bucket, { markUsd: leg.markUsd, oracle: null });
      warnings.push(`No live oracle feed for bucket ${bucket} — using desk-supplied mark (${leg.markUsd} USD)`);
      continue;
    }

    try {
      const oracle = await fetchLivePythPrice(oracleSymbol);
      marksByBucket.set(bucket, { markUsd: oracle.priceUsd, oracle });
      priceSources[oracleSymbol] = oracle;
      if (oracle.status !== "live") {
        warnings.push(`Oracle mark for ${bucket} is ${oracle.status} (published ${oracle.publishTime})`);
      }
      const deviation = Math.abs(leg.markUsd - oracle.priceUsd) / oracle.priceUsd;
      if (deviation > 0.2) {
        warnings.push(
          `Supplied mark ${leg.markUsd} for ${bucket} deviates ${(deviation * 100).toFixed(0)}% from live oracle ${oracle.priceUsd} — oracle mark applied`,
        );
      }
    } catch (err) {
      log.warn("oracle unavailable during pricing", {
        bucket,
        error: err instanceof Error ? err.message : String(err),
      });
      marksByBucket.set(bucket, { markUsd: leg.markUsd, oracle: null });
      warnings.push(
        `Oracle unavailable for ${bucket} — desk-supplied mark applied (${leg.markUsd} USD)`,
      );
    }
  }

  const seen = new Set<string>();
  for (const leg of input) {
    const bucket = leg.bucket.toUpperCase();
    if (seen.has(leg.instrument + bucket)) {
      warnings.push(`Duplicate instrument ${leg.instrument} in bucket ${bucket} — both kept`);
    }
    seen.add(leg.instrument + bucket);

    const priced = marksByBucket.get(bucket)!;
    const markUsd = priced.markUsd;
    const notionalUsd = Math.round(leg.qty * markUsd * 100) / 100;

    if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        `${leg.instrument} produced a non-positive notional (${notionalUsd} USD)`,
      );
    }
    if (notionalUsd > env.positions.maxNotionalPerLegUsd) {
      throw new ApiError(
        422,
        "LIMIT_EXCEEDED",
        `${leg.instrument} notional ${notionalUsd} exceeds the ${env.positions.maxNotionalPerLegUsd} USD cap`,
      );
    }

    const signed = NEGATIVE_SIDES.has(leg.side) ? -notionalUsd : notionalUsd;
    const haircut = leg.haircut ?? defaultHaircut(bucket, leg.side);

    legs.push({
      party,
      venue: leg.venue,
      instrument: leg.instrument,
      bucket,
      side: leg.side,
      qty: leg.qty,
      notionalUsd,
      signedExposureUsd: signed,
      haircut,
      markUsd,
      source: options.source,
    });
  }

  return { legs, warnings, priceSources };
}

/** Build a labeled empty book for a wallet (in-session placeholder). */
export function emptyBook(
  party: "A" | "B",
  wallet: string,
  chain: PositionBook["chain"],
  label?: string,
): PositionBook {
  return {
    party,
    label: label || `Desk ${party}`,
    wallet,
    chain,
    legs: [],
    warnings: [],
  };
}
