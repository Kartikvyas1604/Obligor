/**
 * Reference Portfolios & Netting Presets.
 *
 * Pre-configured offsetting portfolios for bilateral and multi-desk clearing
 * evaluations.
 */

import type { NettingPartyId, PositionBook, PositionLeg } from "@/lib/margin";

const leg = (
  party: NettingPartyId,
  venue: PositionLeg["venue"],
  instrument: string,
  bucket: string,
  side: PositionLeg["side"],
  notionalUsd: number,
  signedExposureUsd: number,
  haircut: number,
  markUsd: number,
): PositionLeg => ({
  party,
  venue,
  instrument,
  bucket,
  side,
  qty: Math.abs(notionalUsd) / markUsd,
  notionalUsd: Math.abs(notionalUsd),
  signedExposureUsd,
  haircut,
  markUsd,
  source: "manual",
});

export const solanaPartyA: PositionBook = {
  party: "A",
  label: "Agent Desk Alpha",
  wallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  chain: "solana",
  warnings: [],
  legs: [
    leg("A", "kamino", "SOL lend", "SOL", "lend", 90_000, 90_000, 0.1, 142.5),
    leg("A", "kamino", "USDC deposit", "USD", "lend", 40_000, 40_000, 0.1, 1),
    leg("A", "mock_equity", "tAAPL long", "AAPL", "long", 55_000, 55_000, 0.25, 190),
  ],
};

export const solanaPartyB: PositionBook = {
  party: "B",
  label: "Counterparty Desk B",
  wallet: "4Nd1mBQtrMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytW",
  chain: "solana",
  warnings: [],
  legs: [
    leg("B", "drift", "SOL-PERP", "SOL", "short", 95_000, -95_000, 0.15, 142.5),
    leg("B", "drift", "BTC-PERP", "BTC", "long", 30_000, 30_000, 0.15, 62_000),
    leg("B", "kamino", "SOL borrow", "SOL", "borrow", 10_000, -10_000, 0.1, 142.5),
  ],
};

export const solanaPartyC: PositionBook = {
  party: "C",
  label: "Netting Pool Desk C",
  wallet: "Bm4Jq7r2VhQc9T5pK1sFxZbD6gW8yN3uMaE4tH7wY2xU",
  chain: "solana",
  warnings: [],
  legs: [
    leg("C", "drift", "BTC-PERP", "BTC", "short", 28_000, -28_000, 0.15, 62_000),
    leg("C", "mock_equity", "tAAPL short", "AAPL", "short", 50_000, -50_000, 0.25, 190),
    leg("C", "kamino", "USDC borrow", "USD", "borrow", 25_000, -25_000, 0.1, 1),
  ],
};

/**
 * Three desks that net to a tiny residual: A is long SOL+margins, B is short
 * SOL (drift), C carries the counter-exposure in BTC/AAPL/USD.
 */
export const solanaThreeParty: PositionBook[] = [solanaPartyA, solanaPartyB, solanaPartyC];

export const adversarialBooks: { a: PositionBook; b: PositionBook } = {
  a: {
    party: "A",
    label: "Desk One",
    wallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    chain: "solana",
    warnings: [],
    legs: [
      leg("A", "drift", "SOL-PERP", "SOL", "long", 120_000, 120_000, 0.15, 142.5),
      leg("A", "mock_equity", "tAAPL long", "AAPL", "long", 60_000, 60_000, 0.25, 190),
    ],
  },
  b: {
    party: "B",
    label: "Desk Two",
    wallet: "4Nd1mBQtrMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytW",
    chain: "solana",
    warnings: [],
    legs: [
      leg("B", "drift", "SOL-PERP", "SOL", "short", 120_000, -120_000, 0.15, 142.5),
      leg("B", "mock_equity", "tAAPL short", "AAPL", "short", 55_000, -55_000, 0.25, 190),
    ],
  },
};

export const monadPairs: Array<{ pairId: string; label: string; a: PositionBook; b: PositionBook }> = [
  {
    pairId: "p1",
    label: "Desk C ↔ D · MON",
    a: {
      party: "A",
      label: "Desk C",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      chain: "monad",
      warnings: [],
      legs: [leg("A", "monad_fixture", "MON lend", "MON", "lend", 70_000, 70_000, 0.1, 38)],
    },
    b: {
      party: "B",
      label: "Desk D",
      wallet: "3BhLGpKkfirMtcC7LEmVAZ3f9sv5VMspD6MKAtd1Wq6aY",
      chain: "monad",
      warnings: [],
      legs: [leg("B", "monad_fixture", "MON-PERP", "MON", "short", 75_000, -75_000, 0.15, 38)],
    },
  },
  {
    pairId: "p2",
    label: "Desk E ↔ F · ETH",
    a: {
      party: "A",
      label: "Desk E",
      wallet: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
      chain: "monad",
      warnings: [],
      legs: [leg("A", "monad_fixture", "ETH long", "ETH", "long", 60_000, 60_000, 0.1, 3_100)],
    },
    b: {
      party: "B",
      label: "Desk F",
      wallet: "5yzwEtvhBAoVJZaWuN9MbJz2s34m5Nz3ZMiWDAfP8wkr",
      chain: "monad",
      warnings: [],
      legs: [leg("B", "monad_fixture", "ETH-PERP", "ETH", "short", 58_000, -58_000, 0.15, 3_100)],
    },
  },
  {
    pairId: "p3",
    label: "Desk G ↔ H · tAAPL",
    a: {
      party: "A",
      label: "Desk G",
      wallet: "HpNfVwyTLPBmE8ibJvfFsVSCEjdE9ZjtFRennis9fPb",
      chain: "monad",
      warnings: [],
      legs: [leg("A", "monad_fixture", "tAAPL", "AAPL", "long", 45_000, 45_000, 0.25, 190)],
    },
    b: {
      party: "B",
      label: "Desk H",
      wallet: "8Kq1mBDtMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytX",
      chain: "monad",
      warnings: [],
      legs: [leg("B", "monad_fixture", "tAAPL short", "AAPL", "short", 45_000, -45_000, 0.25, 190)],
    },
  },
];
