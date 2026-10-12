/**
 * Computation registry — record of every committed confidential computation.
 * Backs the J2 verify endpoint: the record stores ONLY hashes, never plaintext
 * legs, so `verify` never even needs to read either book.
 *
 * Storage: an in-process write-through cache. When a SQLite store is selected
 * (SESSION_STORE_MODE=sqlite or IDEMPOTENCY_BACKEND=sqlite) records are also
 * persisted to a `computations` table, so /verify survives a process restart
 * and works across instances sharing the SQLite file. With the default
 * in-memory mode the registry is per-instance (same trade-off as the rate
 * limiter) — the response is honest about that when a lookup misses.
 */

import { makeLogger } from "./logger";
import { openSqlite, sqliteSelected } from "./sqlite";

const log = makeLogger("computation-registry");

export interface ComputationRecord {
  computationId: string;
  chain: "solana" | "monad";
  backendKind: string;
  commitmentHash: string;
  /** partyId -> sha256 of that party's canonical legs */
  partyLegHashes: Record<string, string>;
  /** bucket (uppercase) -> USD mark applied at compute time (public market data). */
  marksByBucket?: Record<string, number>;
  /** Aggregate scalar both parties were shown — not a book, never a leg. */
  combinedNettedUsd: number;
  grossNotionalUsd: number;
  perPartySiloedUsd: Record<string, number>;
  createdAt: number;
}

const globalForRegistry = globalThis as unknown as {
  __obligorComputations?: Map<string, ComputationRecord>;
};
const registry: Map<string, ComputationRecord> =
  (globalForRegistry.__obligorComputations ??= new Map());

const MAX_IN_MEMORY = 5_000;

let tableReady = false;
function persist(record: ComputationRecord): void {
  if (!sqliteSelected()) return;
  try {
    const db = openSqlite();
    if (!tableReady) {
      db.exec(
        "CREATE TABLE IF NOT EXISTS computations (computation_id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL);",
      );
      tableReady = true;
    }
    db.prepare(
      "INSERT OR REPLACE INTO computations (computation_id, payload, created_at) VALUES (?, ?, ?);",
    ).run(record.computationId, JSON.stringify(record), record.createdAt);
  } catch (err) {
    // Persistence is best-effort: never fail a computed result because the
    // durable mirror is unavailable — the in-memory record stays authoritative.
    log.warn("registry persist failed", {
      computationId: record.computationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function load(computationId: string): ComputationRecord | null {
  if (!sqliteSelected()) return null;
  try {
    const db = openSqlite();
    if (!tableReady) {
      db.exec(
        "CREATE TABLE IF NOT EXISTS computations (computation_id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL);",
      );
      tableReady = true;
    }
    const row = db
      .prepare("SELECT payload FROM computations WHERE computation_id = ?;")
      .get(computationId);
    if (!row || typeof row.payload !== "string") return null;
    return JSON.parse(row.payload) as ComputationRecord;
  } catch (err) {
    log.warn("registry load failed", {
      computationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function registerComputation(record: ComputationRecord): ComputationRecord {
  registry.set(record.computationId, record);
  if (registry.size > MAX_IN_MEMORY) {
    const oldest = registry.keys().next().value;
    if (oldest !== undefined) registry.delete(oldest);
  }
  persist(record);
  log.debug("computation committed", {
    computationId: record.computationId,
    chain: record.chain,
    backendKind: record.backendKind,
  });
  return record;
}

export function getComputation(computationId: string): ComputationRecord | null {
  const cached = registry.get(computationId);
  if (cached) return cached;
  const fromDb = load(computationId);
  if (fromDb) registry.set(computationId, fromDb);
  return fromDb;
}

/** Live privacy-invariant check: confirm the registry holds no plaintext legs. */
export function registryStoresLegs(): boolean {
  for (const record of registry.values()) {
    const r = record as unknown as Record<string, unknown>;
    if ("legs" in r || "legsA" in r || "legsB" in r || Array.isArray(r.partyLegs)) {
      return true;
    }
  }
  return false;
}
