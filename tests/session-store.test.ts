/**
 * Session store durability tests — atomic persistence, TTL eviction,
 * corrupt-file recovery, clean-write invariants.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "../lib/session-store";
import type { DealSession } from "../lib/deal-session";

const TTL_MS = 500;

function makeSession(id: string, updatedAt = Date.now()): DealSession {
  return {
    sessionId: id,
    chain: "solana",
    createdAt: updatedAt - 1000,
    updatedAt,
    status: "waiting_for_party_b",
    backend: "arcium",
    partyA: {
      partyId: "A",
      wallet: "w".repeat(44),
      label: "Desk A",
      legs: [],
      isReady: true,
      isSealed: false,
      depositedAmountUsd: 0,
    },
    partyB: null,
    result: null,
    siloedCombinedUsd: null,
    escrowTxHash: null,
    attestationQuote: null,
  };
}

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "obligor-store-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("FileStore", () => {
  it("persists sessions to disk atomically and reloads them", () => {
    const store = new FileStore(dataDir);
    store.set(makeSession("s1"));
    store.set(makeSession("s2"));
    assert.equal(existsSync(join(dataDir, "sessions.json")), true);

    const fresh = new FileStore(dataDir); // simulates a process restart
    assert.equal(fresh.get("s1")?.sessionId, "s1");
    assert.equal(fresh.get("s2")?.sessionId, "s2");
  });

  it("evicts sessions past the TTL on access", () => {
    const store = new FileStore(dataDir, TTL_MS);
    store.set(makeSession("old", Date.now() - 10_000));
    store.set(makeSession("fresh"));
    assert.equal(store.get("old"), null);
    assert.equal(store.get("fresh")?.sessionId, "fresh");
  });

  it("survives a corrupt store file without crashing", () => {
    writeFileSync(join(dataDir, "sessions.json"), "{not json", "utf8");
    const fresh = new FileStore(dataDir);
    fresh.set(makeSession("again"));
    assert.equal(fresh.get("again")?.sessionId, "again");
    // The corrupt original is quarantined; the live file is valid JSON again.
    assert.equal(readFileSync(join(dataDir, "sessions.json"), "utf8").startsWith("{"), true);
  });

  it("write leaves no temp files behind", () => {
    const store = new FileStore(dataDir);
    store.set(makeSession("s1"));
    const files = readdirSync(dataDir) as string[];
    assert.equal(files.includes("sessions.json"), true);
    assert.equal(files.some((f) => f.includes(".tmp-")), false);
  });

  it("delete removes the session from disk", () => {
    const store = new FileStore(dataDir);
    store.set(makeSession("gone"));
    store.delete("gone");
    const fresh = new FileStore(dataDir);
    assert.equal(fresh.get("gone"), null);
  });
});

describe("file payload shape", () => {
  it("stores sessions as a JSON object map", () => {
    const store = new FileStore(dataDir);
    store.set(makeSession("map-check"));
    const raw = JSON.parse(readFileSync(join(dataDir, "sessions.json"), "utf8")) as Record<
      string,
      { sessionId: string }
    >;
    assert.equal(typeof raw, "object");
    assert.equal(raw["map-check"].sessionId, "map-check");
  });
});
