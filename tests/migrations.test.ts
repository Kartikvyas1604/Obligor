/**
 * Schema migration is idempotent and provisions every runtime table/index, so a
 * deploy can run it explicitly before the server starts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { MIGRATIONS, migrate } from "../lib/migrations";
import { openSqlite } from "../lib/sqlite";

const dbPath = `/tmp/obligor-migrate-test-${process.pid}.db`;
const db = openSqlite(dbPath);

function tables(): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name;")
    .all();
  return rows.map((r) => String(r.name));
}

test("migrate provisions sessions, idempotency and computations", () => {
  const applied = migrate(db);
  assert.equal(applied, MIGRATIONS.length);
  const names = tables();
  for (const t of ["sessions", "idempotency", "computations"]) {
    assert.ok(names.includes(t), `expected table ${t}`);
  }
  for (const idx of [
    "idx_sessions_updated",
    "idx_idempotency_expires",
    "computations_created_at",
  ]) {
    assert.ok(names.includes(idx), `expected index ${idx}`);
  }
});

test("migrate is idempotent (safe to re-run)", () => {
  assert.doesNotThrow(() => migrate(db));
  assert.doesNotThrow(() => migrate(db));
  // No duplicate tables created (sqlite_master would still list one each).
  assert.equal(tables().filter((n) => n === "sessions").length, 1);
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
