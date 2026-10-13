/**
 * Development default: with no real transport wired and NODE_ENV not
 * production, confidential backends run the exact formula as an
 * honestly-labeled plaintext simulation. trustModel is never upgraded by config.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PositionBook, PositionLeg } from "../lib/margin";
import {
  ArciumBackend,
  EnclaveBackend,
  SimulatedBackend,
  getConfidentialBackend,
} from "../lib/confidential";

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

test("dev simulation is permitted and honestly labeled", async () => {
  for (const backend of [new ArciumBackend(), new EnclaveBackend(), new SimulatedBackend()]) {
    const r = await backend.netTwoParty(bookA, bookB);
    assert.equal(r.trustModel, "simulated_plaintext_compute");
    assert.ok(r.simulationNote, "a simulation must carry an honesty note");
    assert.equal(r.nettedCombinedUsd, 0);
    assert.equal(r.siloedCombinedUsd, 25_000);
  }
});

test("getConfidentialBackend resolves each kind and never over-claims trust", () => {
  assert.equal(getConfidentialBackend("arcium").trustModel, "simulated_plaintext_compute");
  assert.equal(getConfidentialBackend("enclave").trustModel, "simulated_plaintext_compute");
  assert.equal(getConfidentialBackend("simulated").trustModel, "simulated_plaintext_compute");
});
