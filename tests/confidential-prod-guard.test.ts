/**
 * Production removes the plaintext-simulation default. This file runs in its
 * own process (node:test isolates files), so it can set NODE_ENV=production and
 * the confidential env BEFORE lib/env reads them.
 *
 * Scenario: production, real transports explicitly OFF, no
 * CONFIDENTIAL_ALLOW_SIMULATION opt-in → every confidential backend fails
 * closed instead of quietly computing in plaintext.
 */
(process.env as { NODE_ENV?: string }).NODE_ENV = "production";
process.env.CONFIDENTIAL_REAL_TRANSPORTS = "false";
delete process.env.CONFIDENTIAL_ALLOW_SIMULATION;

import { test } from "node:test";
import assert from "node:assert/strict";
import type { PositionBook, PositionLeg } from "../lib/margin";

const leg = (
  party: "A" | "B",
  instrument: string,
  bucket: string,
  side: PositionLeg["side"],
  notionalUsd: number,
  haircut: number,
): PositionLeg => ({
  party,
  venue: "manual",
  instrument,
  bucket,
  side,
  qty: 1,
  notionalUsd,
  signedExposureUsd: side === "short" || side === "borrow" ? -notionalUsd : notionalUsd,
  haircut,
  markUsd: 1,
  source: "manual",
});

const book = (party: "A" | "B", legs: PositionLeg[]): PositionBook => ({
  party,
  label: `Desk ${party}`,
  wallet: "a".repeat(44),
  chain: "solana",
  legs,
  warnings: [],
});

const bookA = book("A", [leg("A", "SOL lend", "SOL", "lend", 100_000, 0.1)]);
const bookB = book("B", [leg("B", "SOL-PERP", "SOL", "short", 100_000, 0.15)]);

test("production forbids silent plaintext simulation for every backend", async () => {
  const { ArciumBackend, EnclaveBackend, SimulatedBackend } = await import("../lib/confidential");

  await assert.rejects(() => new ArciumBackend().netTwoParty(bookA, bookB), /CONFIDENTIAL_SIMULATION_FORBIDDEN/);
  await assert.rejects(() => new EnclaveBackend().netTwoParty(bookA, bookB), /CONFIDENTIAL_SIMULATION_FORBIDDEN/);
  await assert.rejects(() => new SimulatedBackend().netTwoParty(bookA, bookB), /CONFIDENTIAL_SIMULATION_FORBIDDEN/);
});

test("production forbids N-party plaintext netting", async () => {
  const { ensureNPartyPlaintextAllowed } = await import("../lib/confidential");
  assert.throws(() => ensureNPartyPlaintextAllowed(), /CONFIDENTIAL_SIMULATION_FORBIDDEN/);
});
