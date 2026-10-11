/**
 * Idempotency for state-changing write-intent routes (escrow deposit/settle).
 *
 * A client that retries a request with the same `Idempotency-Key` gets the
 * ORIGINAL result back instead of the route re-recording a duplicate. A
 * retry that smuggles a different body under an already-used key is rejected
 * with a 409 conflict so two desks can never disagree about an escrowIntent.
 *
 * Two backends behind one interface:
 *  - memory (default): per-process Map, lost on restart, TTL-evicted.
 *  - sqlite (`IDEMPOTENCY_BACKEND=sqlite`, implied by `SESSION_STORE_MODE=sqlite`):
 *    shared across processes on the same volume so replay/conflict decisions
 *    are consistent across instances — see `lib/sqlite.ts`.
 */

import { createHash, randomUUID } from "node:crypto";
import { effectiveIdempotencyBackend, openSqlite } from "./sqlite";

export interface IdempotentRecord {
  key: string;
  requestFingerprint: string;
  recordedAt: number;
  expiresAt: number;
  response: unknown;
}

export class IdempotencyConflictError extends Error {
  readonly status = 409;
  readonly code = "IDEMPOTENCY_CONFLICT";
  constructor(key: string) {
    super(
      `Idempotency-Key "${key}" was already used with a different payload. Retries must repeat the original request exactly.`,
    );
  }
}

const TTL_MS = 24 * 60 * 60 * 1000;

interface Backend {
  get(key: string): IdempotentRecord | null;
  put(record: IdempotentRecord): void;
  purge(): void;
}

// ---- memory backend ----
const globalForIdempotency = globalThis as unknown as {
  __obligorIdempotency?: Map<string, IdempotentRecord>;
};
const memStore: Map<string, IdempotentRecord> =
  (globalForIdempotency.__obligorIdempotency ??= new Map());

const memoryBackend: Backend = {
  get(key) {
    const rec = memStore.get(key);
    if (!rec) return null;
    if (rec.expiresAt <= Date.now()) {
      memStore.delete(key);
      return null;
    }
    return rec;
  },
  put(record) {
    memStore.set(record.key, record);
  },
  purge() {
    const now = Date.now();
    for (const [key, rec] of memStore) if (rec.expiresAt <= now) memStore.delete(key);
  },
};

// ---- sqlite backend ----
let sqliteBackend: Backend | null = null;
function getSqliteBackend(): Backend {
  if (sqliteBackend) return sqliteBackend;
  const db = openSqlite();
  db.exec(
    `CREATE TABLE IF NOT EXISTS idempotency (
       key TEXT PRIMARY KEY,
       fingerprint TEXT NOT NULL,
       recorded_at INTEGER NOT NULL,
       expires_at INTEGER NOT NULL,
       response TEXT NOT NULL
     );`,
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency(expires_at);");
  sqliteBackend = {
    get(key) {
      db.prepare("DELETE FROM idempotency WHERE expires_at <= ?").run(Date.now());
      const row = db
        .prepare("SELECT key, fingerprint, recorded_at, expires_at, response FROM idempotency WHERE key = ?")
        .get(key) as
        | { key: string; fingerprint: string; recorded_at: number; expires_at: number; response: string }
        | undefined;
      if (!row) return null;
      return {
        key: row.key,
        requestFingerprint: row.fingerprint,
        recordedAt: row.recorded_at,
        expiresAt: row.expires_at,
        response: JSON.parse(row.response),
      };
    },
    put(record) {
      db.prepare(
        `INSERT INTO idempotency (key, fingerprint, recorded_at, expires_at, response)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           fingerprint = excluded.fingerprint,
           recorded_at = excluded.recorded_at,
           expires_at  = excluded.expires_at,
           response    = excluded.response`,
      ).run(
        record.key,
        record.requestFingerprint,
        record.recordedAt,
        record.expiresAt,
        JSON.stringify(record.response),
      );
    },
    purge() {
      db.prepare("DELETE FROM idempotency WHERE expires_at <= ?").run(Date.now());
    },
  };
  return sqliteBackend;
}

function backend(): Backend {
  return effectiveIdempotencyBackend() === "sqlite" ? getSqliteBackend() : memoryBackend;
}

/** Stable fingerprint of the normalized request body for replay-reuse checks. */
export function fingerprintBody(body: Record<string, unknown>): string {
  const canonical = JSON.stringify(body, Object.keys(body).sort());
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

export function purgeExpired(): void {
  backend().purge();
}

/**
 * Looks up a prior result for an Idempotency-Key.
 * Returns the original response if the request matches, throws
 * IdempotencyConflictError if the same key was used with a different payload,
 * or null if this key is fresh.
 */
export function replayIdempotent<T extends object>(
  key: string,
  requestFingerprint: string,
): T | null {
  const rec = backend().get(key);
  if (!rec) return null;
  if (rec.requestFingerprint !== requestFingerprint) {
    throw new IdempotencyConflictError(key);
  }
  return rec.response as T;
}

/** Records a result under an Idempotency-Key, returning the stored record. */
export function recordIdempotent<T extends object>(
  key: string,
  requestFingerprint: string,
  response: T,
): IdempotentRecord {
  const now = Date.now();
  const record: IdempotentRecord = {
    key,
    requestFingerprint,
    recordedAt: now,
    expiresAt: now + TTL_MS,
    response,
  };
  backend().put(record);
  return record;
}

/** Generates a fresh idempotency key when the client did not supply one. */
export function generateIdempotencyKey(): string {
  return `idem_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}
