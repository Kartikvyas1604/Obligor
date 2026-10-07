export type PartyId = "A" | "B";
export type ChainId = "solana" | "monad";
export type Side = "long" | "short" | "lend" | "borrow";
export type Venue = "drift" | "kamino" | "mock_equity" | "monad_fixture" | "manual";
export type Source = "manual" | "demo" | "live" | "fallback";
export type BackendKind = "arcium" | "enclave" | "simulated";

export interface PositionLeg {
  party: PartyId;
  venue: Venue;
  instrument: string;
  bucket: string;
  side: Side;
  qty: number;
  notionalUsd: number;
  signedExposureUsd: number;
  haircut: number;
  markUsd: number;
  source: Source;
}

export interface PositionBook {
  party: PartyId;
  label: string;
  wallet: string;
  chain: ChainId;
  legs: PositionLeg[];
  warnings: string[];
}

export interface NetMarginResult {
  siloedAUsd: number;
  siloedBUsd: number;
  siloedCombinedUsd: number;
  nettedCombinedUsd: number;
  savingsUsd: number;
  grossNotionalUsd: number;
  netExposureUsd: number;
  buckets: BucketResult[];
}

export interface BucketResult {
  bucket: string;
  exposureUsd: number;
  haircut: number;
  imUsd: number;
}

const ROUND = (n: number) => Math.round(n * 100) / 100;

export function siloedIm(legs: PositionLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.haircut * Math.abs(leg.notionalUsd), 0);
}

export function twoPartySiloed(bookA: PositionBook, bookB: PositionBook) {
  const siloedA = siloedIm(bookA.legs);
  const siloedB = siloedIm(bookB.legs);
  return {
    siloedA,
    siloedB,
    siloedCombined: siloedA + siloedB,
  };
}

export function twoPartyNetted(bookA: PositionBook, bookB: PositionBook): NetMarginResult {
  const { siloedA, siloedB, siloedCombined } = twoPartySiloed(bookA, bookB);
  const all = [...bookA.legs, ...bookB.legs];

  const buckets = new Map<string, { exposure: number; haircut: number; notional: number }>();
  for (const leg of all) {
    const b = buckets.get(leg.bucket) ?? { exposure: 0, haircut: leg.haircut, notional: 0 };
    b.exposure += leg.signedExposureUsd;
    b.haircut = Math.max(b.haircut, leg.haircut);
    b.notional += leg.notionalUsd;
    buckets.set(leg.bucket, b);
  }

  const bucketResults: BucketResult[] = [];
  let nettedCombined = 0;
  let grossNotional = 0;
  for (const [bucket, b] of buckets) {
    const im = b.haircut * Math.abs(b.exposure);
    nettedCombined += im;
    grossNotional += b.notional;
    bucketResults.push({
      bucket,
      exposureUsd: b.exposure,
      haircut: b.haircut,
      imUsd: im,
    });
  }

  const savings = Math.max(0, siloedCombined - nettedCombined);

  return {
    siloedAUsd: ROUND(siloedA),
    siloedBUsd: ROUND(siloedB),
    siloedCombinedUsd: ROUND(siloedCombined),
    nettedCombinedUsd: ROUND(nettedCombined),
    savingsUsd: ROUND(savings),
    grossNotionalUsd: ROUND(grossNotional),
    netExposureUsd: ROUND(all.reduce((s, l) => s + l.signedExposureUsd, 0)),
    buckets: bucketResults.sort((x, y) => y.imUsd - x.imUsd),
  };
}

export const usd = (n: number, decimals = 2) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
