/**
 * Demo fixtures — explicitly labeled demo data, gated server-side.
 *
 * These books exist ONLY for judge/demo flows. Non-demo endpoints never
 * serve them, and every leg is tagged source:"demo" so provenance shows in
 * the UI. Demo endpoints requiring DEMO_ALLOW_FIXTURES before serving.
 */

import type { PositionBook, PositionLeg } from "@/lib/margin";

const leg = (
  party: "A" | "B",
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
  source: "demo",
});

export const solanaPartyA: PositionBook = {
  party: "A",
  label: "Agent Desk Alpha (demo)",
  wallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  chain: "solana",
  warnings: ["Demo fixture book — quantities are examples, not live positions"],
  legs: [
    leg("A", "kamino", "SOL lend", "SOL", "lend", 90_000, 90_000, 0.1, 142.5),
    leg("A", "kamino", "USDC deposit", "USD", "lend", 40_000, 40_000, 0.1, 1),
    leg("A", "mock_equity", "tAAPL long", "AAPL", "long", 55_000, 55_000, 0.25, 190),
  ],
};

export const solanaPartyB: PositionBook = {
  party: "B",
  label: "Counterparty Desk B (demo)",
  wallet: "4Nd1mBQtrMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytW",
  chain: "solana",
  warnings: ["Demo fixture book — quantities are examples, not live positions"],
  legs: [
    leg("B", "drift", "SOL-PERP", "SOL", "short", 95_000, -95_000, 0.15, 142.5),
    leg("B", "drift", "BTC-PERP", "BTC", "long", 30_000, 30_000, 0.15, 62_000),
    leg("B", "kamino", "SOL borrow", "SOL", "borrow", 10_000, -10_000, 0.1, 142.5),
  ],
};

export const adversarialBooks: { a: PositionBook; b: PositionBook } = {
  a: {
    party: "A",
    label: "Desk One (demo)",
    wallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    chain: "solana",
    warnings: ["Demo fixture book — plaintext counterfactual only"],
    legs: [
      leg("A", "drift", "SOL-PERP", "SOL", "long", 120_000, 120_000, 0.15, 142.5),
      leg("A", "mock_equity", "tAAPL long", "AAPL", "long", 60_000, 60_000, 0.25, 190),
    ],
  },
  b: {
    party: "B",
    label: "Desk Two (demo)",
    wallet: "4Nd1mBQtrMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytW",
    chain: "solana",
    warnings: ["Demo fixture book — plaintext counterfactual only"],
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
      label: "Desk C (demo)",
      wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      chain: "monad",
      warnings: ["Demo fixture book"],
      legs: [leg("A", "monad_fixture", "MON lend", "MON", "lend", 70_000, 70_000, 0.1, 38)],
    },
    b: {
      party: "B",
      label: "Desk D (demo)",
      wallet: "3BhLGpKkfirMtcC7LEmVAZ3f9sv5VMspD6MKAtd1Wq6aY",
      chain: "monad",
      warnings: ["Demo fixture book"],
      legs: [leg("B", "monad_fixture", "MON-PERP", "MON", "short", 75_000, -75_000, 0.15, 38)],
    },
  },
  {
    pairId: "p2",
    label: "Desk E ↔ F · ETH",
    a: {
      party: "A",
      label: "Desk E (demo)",
      wallet: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
      chain: "monad",
      warnings: ["Demo fixture book"],
      legs: [leg("A", "monad_fixture", "ETH long", "ETH", "long", 60_000, 60_000, 0.1, 3_100)],
    },
    b: {
      party: "B",
      label: "Desk F (demo)",
      wallet: "5yzwEtvhBAoVJZaWuN9MbJz2s34m5Nz3ZMiWDAfP8wkr",
      chain: "monad",
      warnings: ["Demo fixture book"],
      legs: [leg("B", "monad_fixture", "ETH-PERP", "ETH", "short", 58_000, -58_000, 0.15, 3_100)],
    },
  },
  {
    pairId: "p3",
    label: "Desk G ↔ H · tAAPL",
    a: {
      party: "A",
      label: "Desk G (demo)",
      wallet: "HpNfVwyTLPBmE8ibJvfFsVSCEjdE9ZjtFRennis9fPb",
      chain: "monad",
      warnings: ["Demo fixture book"],
      legs: [leg("A", "monad_fixture", "tAAPL", "AAPL", "long", 45_000, 45_000, 0.25, 190)],
    },
    b: {
      party: "B",
      label: "Desk H (demo)",
      wallet: "8Kq1mBDtMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytX",
      chain: "monad",
      warnings: ["Demo fixture book"],
      legs: [leg("B", "monad_fixture", "tAAPL short", "AAPL", "short", 45_000, -45_000, 0.25, 190)],
    },
  },
];
