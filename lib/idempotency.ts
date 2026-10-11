/**
 * Idempotency for state-changing write-intent routes (escrow deposit/settle).
 *
 * A client that retries a request with the same `Idempotency-Key` gets the
 * ORIGINAL result back instead of the route re-recording a duplicate. A
 * retry that smuggles a different body under an already-used key is rejected
 * with a 409 conflict so two desks can never disagree about an escrowIntent.
 *
 * In-memory per instance, with a TTL — same scope as the rate limiter. The
 * multi-instance caveat is documented in README (put a shared edge limiter /
 * store in front when scaling out).
 */

import { createHash, randomUUID } from "node:crypto";

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

interface MapEntry {
  record: IdempotentRecord;
}

const TTL_MS = 24 * 60 * 60 * 1000;

const globalForIdempotency = globalThis as unknown as {
  __obligorIdempotency?: Map<string, MapEntry>;
};
const store: Map<string, MapEntry> =
  (globalForIdempotency.__obligorIdempotency ??= new Map());

/** Stable fingerprint of the normalized request body for replay-reuse checks. */
export function fingerprintBody(body: Record<string, unknown>): string {
  const canonical = JSON.stringify(body, Object.keys(body).sort());
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

export function purgeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.record.expiresAt <= now) store.delete(key);
  }
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
  purgeExpired();
  const entry = store.get(key);
  if (!entry) return null;

  if (entry.record.requestFingerprint !== requestFingerprint) {
    throw new IdempotencyConflictError(key);
  }
  return entry.record.response as T;
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
  store.set(key, { record });
  return record;
}

/** Generates a fresh idempotency key when the client did not supply one. */
export function generateIdempotencyKey(): string {
  return `idem_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}