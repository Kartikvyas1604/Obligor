import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Select the sqlite idempotency backend BEFORE the env singleton is imported.
// process.env assignments run before the dynamic import below, and node:test
// runs each file in its own process, so this does not leak into other tests.
const dbPath = `/tmp/obligor-idem-${process.pid}.db`;
process.env.IDEMPOTENCY_BACKEND = "sqlite";
process.env.SQLITE_PATH = dbPath;
process.env.DATA_DIR = `/tmp/obligor-idem-${process.pid}`;

test("sqlite idempotency backend: replay returns original, conflict throws", async () => {
  const mod = await import("../lib/idempotency");
  const { fingerprintBody, recordIdempotent, replayIdempotent } = mod;

  const key = `sqlite-${Date.now()}`;
  const body = { escrowId: "esc-sqlite", amountAUsd: 42 };
  const fingerprint = fingerprintBody(body);

  assert.equal(replayIdempotent(key, fingerprint), null);
  recordIdempotent(key, fingerprint, { ok: true, escrowId: "esc-sqlite" });

  const prior = replayIdempotent<{ escrowId: string }>(key, fingerprint);
  assert.ok(prior);
  assert.equal(prior.escrowId, "esc-sqlite");

  assert.throws(
    () => replayIdempotent(key, fingerprintBody({ escrowId: "esc-sqlite", amountAUsd: 99 })),
    mod.IdempotencyConflictError,
  );
});

test.after(() => {
  try {
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
  } catch {
    // best effort
  }
});
