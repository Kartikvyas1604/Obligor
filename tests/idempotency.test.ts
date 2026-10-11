import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IdempotencyConflictError,
  fingerprintBody,
  generateIdempotencyKey,
  recordIdempotent,
  replayIdempotent,
} from "../lib/idempotency";

/** Fresh key so tests never clash across runs of the shared global store. */
function freshKey(): string {
  return `test-${generateIdempotencyKey()}`;
}

test("same key + same body replays the original result", () => {
  const key = freshKey();
  const body = { escrowId: "esc-1", amountAUsd: 100 };
  const fingerprint = fingerprintBody(body);

  assert.equal(replayIdempotent(key, fingerprint), null);

  const result = { ok: true, escrowId: "esc-1", totalLockedUsd: 100 };
  recordIdempotent(key, fingerprint, result);

  const prior = replayIdempotent<{ totalLockedUsd: number }>(key, fingerprint);
  assert.ok(prior);
  assert.equal(prior.totalLockedUsd, 100);
});

test("same key + different body throws a conflict (no silent overwrite)", () => {
  const key = freshKey();
  const first = { escrowId: "esc-1", amountAUsd: 100 };
  recordIdempotent(key, fingerprintBody(first), { ok: true });

  const tampered = { escrowId: "esc-1", amountAUsd: 999 };
  assert.throws(() => replayIdempotent(key, fingerprintBody(tampered)), IdempotencyConflictError);
});

test("key order in the body does not affect the fingerprint", () => {
  const a = fingerprintBody({ escrowId: "x", chain: "solana", totalLockedUsd: 50 });
  const b = fingerprintBody({ totalLockedUsd: 50, escrowId: "x", chain: "solana" });
  assert.equal(a, b);
});

test("unknown key returns null before anything is recorded", () => {
  const key = freshKey();
  assert.equal(replayIdempotent(key, fingerprintBody({ escrowId: "nothing" })), null);
});

test("conflict error carries status 409 and a stable code", () => {
  const key = freshKey();
  const err = new IdempotencyConflictError(key);
  assert.equal(err.status, 409);
  assert.equal(err.code, "IDEMPOTENCY_CONFLICT");
});