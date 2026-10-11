import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { openSqlite } from "../lib/sqlite";
import { SqliteStore } from "../lib/session-store";
import type { DealSession } from "../lib/deal-session";

const dbPath = `/tmp/obligor-store-test-${process.pid}.db`;
const db = openSqlite(dbPath);
const store = new SqliteStore(db, 1000); // 1s TTL for the eviction test

function session(id: string, updatedAt: number): DealSession {
  return { sessionId: id, updatedAt } as unknown as DealSession;
}

test("sqlite store: set / get / all / delete round-trip", () => {
  store.set(session("s-1", Date.now()));
  store.set(session("s-2", Date.now()));

  const got = store.get("s-1");
  assert.ok(got);
  assert.equal(got.sessionId, "s-1");

  const all = store.all().map((s) => s.sessionId).sort();
  assert.deepEqual(all, ["s-1", "s-2"]);

  store.delete("s-1");
  assert.equal(store.get("s-1"), null);
  assert.deepEqual(store.all().map((s) => s.sessionId), ["s-2"]);
});

test("sqlite store: TTL evicts expired rows", () => {
  store.set(session("old", Date.now() - 5000)); // older than 1s TTL
  assert.equal(store.get("old"), null);
});

test("sqlite store: set is an upsert (no duplicate rows)", () => {
  store.set(session("s-3", Date.now()));
  store.set(session("s-3", Date.now()));
  assert.equal(store.all().filter((s) => s.sessionId === "s-3").length, 1);
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
