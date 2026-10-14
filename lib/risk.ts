/**
 * Institutional risk analytics for a desk book.
 *
 * Deterministic, transparent metrics computed directly from priced legs — no
 * probabilistic "VaR" claims. Stress tests are explicit mark shocks and haircut
 * multipliers applied to the book, so every number can be reproduced by hand.
 * Nothing here is advice.
 */

import type { PositionLeg } from "./margin";

export type RiskBucketClass = "crypto" | "equity" | "other";

const CRYPTO_BUCKETS = new Set(["SOL", "ETH", "BTC", "MON", "AVAX", "ARB", "OP", "MATIC", "DOGE"]);
const EQUITY_BUCKETS = new Set(["AAPL", "TSLA", "NVDA", "MSFT", "SPY", "QQQ", "AMZN", "GOOGL"]);

export function bucketClass(bucket: string): RiskBucketClass {
  const b = bucket.trim().toUpperCase();
  if (CRYPTO_BUCKETS.has(b)) return "crypto";
  if (EQUITY_BUCKETS.has(b)) return "equity";
  return "other";
}

export interface BucketExposure {
  bucket: string;
  bucketClass: RiskBucketClass;
  netExposureUsd: number;
  grossNotionalUsd: number;
  imUsd: number;
  /** Share of gross notional, 0..1. */
  share: number;
}

export interface VenueExposure {
  venue: string;
  grossNotionalUsd: number;
  share: number;
}

export interface RiskReport {
  grossNotionalUsd: number;
  netExposureUsd: number;
  longExposureUsd: number;
  shortExposureUsd: number;
  /** Net / gross, in [-1, 1]. 0 is perfectly two-way, ±1 is fully directional. */
  directionalBias: number;
  imUsd: number;
  /** IM / gross notional — the blended margin rate, 0..1. */
  weightedHaircut: number;
  /** Gross notional per dollar of margin. */
  grossToMargin: number;
  legCount: number;
  bucketCount: number;
  venueCount: number;
  /** Herfindahl index over bucket notional shares, 0..1 (higher = concentrated). */
  concentrationHhi: number;
  /** 1 / HHI — the effective number of equally-weighted buckets. */
  effectiveBuckets: number;
  topBucket: BucketExposure | null;
  buckets: BucketExposure[];
  venues: VenueExposure[];
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Analyze a desk's own book. Returns null for an empty book. */
export function analyzeRisk(legs: PositionLeg[]): RiskReport | null {
  if (legs.length === 0) return null;

  const grossNotional = legs.reduce((s, l) => s + l.notionalUsd, 0);
  const netExposure = legs.reduce((s, l) => s + l.signedExposureUsd, 0);
  const im = legs.reduce((s, l) => s + l.haircut * l.notionalUsd, 0);

  let longExposure = 0;
  let shortExposure = 0;
  for (const l of legs) {
    if (l.signedExposureUsd >= 0) longExposure += l.signedExposureUsd;
    else shortExposure += -l.signedExposureUsd;
  }

  const bucketMap = new Map<string, { net: number; gross: number; im: number; cls: RiskBucketClass }>();
  const venueMap = new Map<string, number>();
  for (const l of legs) {
    const b = bucketMap.get(l.bucket) ?? { net: 0, gross: 0, im: 0, cls: bucketClass(l.bucket) };
    b.net += l.signedExposureUsd;
    b.gross += l.notionalUsd;
    b.im += l.haircut * l.notionalUsd;
    bucketMap.set(l.bucket, b);
    venueMap.set(l.venue, (venueMap.get(l.venue) ?? 0) + l.notionalUsd);
  }

  const buckets: BucketExposure[] = [...bucketMap.entries()]
    .map(([bucket, b]) => ({
      bucket,
      bucketClass: b.cls,
      netExposureUsd: round(b.net),
      grossNotionalUsd: round(b.gross),
      imUsd: round(b.im),
      share: grossNotional > 0 ? b.gross / grossNotional : 0,
    }))
    .sort((x, y) => y.grossNotionalUsd - x.grossNotionalUsd);

  const hhi = buckets.reduce((s, b) => s + b.share * b.share, 0);

  const venues: VenueExposure[] = [...venueMap.entries()]
    .map(([venue, gross]) => ({
      venue,
      grossNotionalUsd: round(gross),
      share: grossNotional > 0 ? gross / grossNotional : 0,
    }))
    .sort((x, y) => y.grossNotionalUsd - x.grossNotionalUsd);

  return {
    grossNotionalUsd: round(grossNotional),
    netExposureUsd: round(netExposure),
    longExposureUsd: round(longExposure),
    shortExposureUsd: round(shortExposure),
    directionalBias: grossNotional > 0 ? round(netExposure / grossNotional, 4) : 0,
    imUsd: round(im),
    weightedHaircut: grossNotional > 0 ? round(im / grossNotional, 4) : 0,
    grossToMargin: im > 0 ? round(grossNotional / im, 2) : 0,
    legCount: legs.length,
    bucketCount: buckets.length,
    venueCount: venues.length,
    concentrationHhi: round(hhi, 4),
    effectiveBuckets: hhi > 0 ? round(1 / hhi, 2) : 0,
    topBucket: buckets[0] ?? null,
    buckets,
    venues,
  };
}

export interface StressScenario {
  id: string;
  name: string;
  description: string;
  /** Multiplicative mark shock per bucket class (e.g. -0.25 = −25%). */
  classShocks?: Partial<Record<RiskBucketClass, number>>;
  /** Multiplies every haircut; models a margin spiral / haircut widening. */
  haircutMultiplier?: number;
}

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: "risk_off",
    name: "Risk-off",
    description: "Crypto −25%, equities −15%, everything else −10%.",
    classShocks: { crypto: -0.25, equity: -0.15, other: -0.1 },
  },
  {
    id: "severe",
    name: "Severe",
    description: "Uniform −40% across all buckets.",
    classShocks: { crypto: -0.4, equity: -0.4, other: -0.4 },
  },
  {
    id: "margin_spiral",
    name: "Margin spiral",
    description: "Marks unchanged; every haircut widens 1.5×.",
    haircutMultiplier: 1.5,
  },
];

export interface StressOutcome {
  id: string;
  name: string;
  description: string;
  /** Mark-to-market P&L from the shock (negative = loss). */
  pnlUsd: number;
  stressedImUsd: number;
  imDeltaUsd: number;
  stressedNetExposureUsd: number;
}

/** Apply one scenario to a book. Deterministic — same input, same output. */
export function stressTest(legs: PositionLeg[], scenario: StressScenario): StressOutcome {
  const shockFor = (bucket: string) => scenario.classShocks?.[bucketClass(bucket)] ?? 0;
  const haircutFactor = scenario.haircutMultiplier ?? 1;

  let pnl = 0;
  let baseIm = 0;
  let stressedIm = 0;
  let stressedNet = 0;
  for (const l of legs) {
    const shock = shockFor(l.bucket);
    pnl += l.signedExposureUsd * shock;
    const stressedNotional = l.notionalUsd * (1 + shock);
    baseIm += l.haircut * l.notionalUsd;
    stressedIm += l.haircut * haircutFactor * stressedNotional;
    stressedNet += l.signedExposureUsd * (1 + shock);
  }

  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    pnlUsd: round(pnl),
    stressedImUsd: round(stressedIm),
    imDeltaUsd: round(stressedIm - baseIm),
    stressedNetExposureUsd: round(stressedNet),
  };
}

export function stressPortfolio(legs: PositionLeg[]): StressOutcome[] {
  return STRESS_SCENARIOS.map((s) => stressTest(legs, s));
}
