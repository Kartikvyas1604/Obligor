/**
 * Party identity for the confidential two-party flow (sessions, capability
 * tokens). Fixed to A|B — those rooms are strictly bilateral.
 */
export type PartyId = "A" | "B";

/**
 * Identity in netting books. N-party netting extends identity to a third
 * desk; two-party books only ever use A/B.
 */
export type NettingPartyId = "A" | "B" | "C";
export type ChainId = "solana" | "monad";
export type Side = "long" | "short" | "lend" | "borrow";
export type Venue = "drift" | "kamino" | "mock_equity" | "monad_fixture" | "manual";
export type Source = "manual" | "demo" | "live" | "stale" | "fallback";
export type BackendKind = "arcium" | "enclave" | "simulated";

export interface PositionLeg {
  party: NettingPartyId;
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
  party: NettingPartyId;
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
  /** N-party extension: per-party siloed margin. Two-party fills `A` / `B`. */
  perPartySiloedUsd?: Record<string, number>;
  /** N-party extension: how many books were netted (2 = two-party). */
  partyCount?: number;
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

/**
 * N-party netting (two-party is the N=2 case — one formula, no fork).
 *
 * Union all legs across N books, bucket by risk factor, net the signed
 * exposure within each bucket, and apply the max haircut among the legs in
 * that bucket. The same economics as the two-party sketch; the two-party
 * result is identical to calling this with exactly two books.
 */
export function nPartyNetted(books: PositionBook[]): NetMarginResult {
  // Keys must be unique: the request allows up to 4 books but party labels are
  // only A|B|C, so a duplicate label would otherwise overwrite another desk's
  // siloed margin. Disambiguate repeats with a numeric suffix.
  const seen = new Map<string, number>();
  const keys = books.map((book, i) => {
    const base = book.party || `P${i + 1}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}${n + 1}`;
  });
  const perPartySiloedUsd: Record<string, number> = {};
  for (let i = 0; i < books.length; i++) {
    perPartySiloedUsd[keys[i]] = siloedIm(books[i].legs);
  }
  const siloedCombined = Object.values(perPartySiloedUsd).reduce((s, v) => s + v, 0);

  const all = books.flatMap((book) => book.legs);

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
    siloedAUsd: ROUND(perPartySiloedUsd[keys[0]] ?? 0),
    siloedBUsd: ROUND(perPartySiloedUsd[keys[1]] ?? 0),
    siloedCombinedUsd: ROUND(siloedCombined),
    nettedCombinedUsd: ROUND(nettedCombined),
    savingsUsd: ROUND(savings),
    grossNotionalUsd: ROUND(grossNotional),
    netExposureUsd: ROUND(all.reduce((s, l) => s + l.signedExposureUsd, 0)),
    buckets: bucketResults.sort((x, y) => y.imUsd - x.imUsd),
    perPartySiloedUsd,
    partyCount: books.length,
  };
}

export function twoPartyNetted(bookA: PositionBook, bookB: PositionBook): NetMarginResult {
  return nPartyNetted([bookA, bookB]);
}

export const usd = (n: number, decimals = 2) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
