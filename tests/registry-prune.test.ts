/**
 * Registry durability: committed-computation records are pruned from the
 * durable SQLite mirror once older than the retention window, so /verify
 * storage stays bounded. Env must be set before lib/env loads, so the modules
 * are imported dynamically inside the test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

const dbPath = `/tmp/obligor-registry-test-${process.pid}.db`;

function record(id: string, createdAt: number) {
  return {
    computationId: id,
    chain: "solana" as const,
    backendKind: "simulated",
    commitmentHash: "sha256:0",
    partyLegHashes: {},
    combinedNettedUsd: 0,
    grossNotionalUsd: 0,
    perPartySiloedUsd: {},
    createdAt,
  };
}

test("registry prunes records older than the retention window", async () => {
  process.env.SESSION_STORE_MODE = "sqlite";
  process.env.SQLITE_PATH = dbPath;
  process.env.REGISTRY_RETENTION_MS = "1000";

  const { registerComputation } = await import("../lib/computation-registry");
  const { openSqlite } = await import("../lib/sqlite");
  const db = openSqlite(dbPath);
  const count = () =>
    Number((db.prepare("SELECT COUNT(*) AS n FROM computations;").get() as { n: number }).n);
  const now = Date.now();

  // First persist triggers the sweep (lastPruneMs starts at 0); an old record
  // is written then immediately pruned because it predates the 1s retention.
  registerComputation(record("old", now - 60_000));
  assert.equal(count(), 0, "expired record is pruned from the durable mirror");

  // A recent record survives (prune is throttled and won't run again).
  registerComputation(record("fresh", now));
  assert.equal(count(), 1, "fresh record is retained");
});

test.after(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${dbPath}${suffix}`, { force: true });
    } catch {
      // best effort
    }
  }
});
