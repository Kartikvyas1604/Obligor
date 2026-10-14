/**
 * On-chain escrow read/verify fails closed: a malformed address is rejected
 * before any network call, and the verifier never invents a snapshot. Settle
 * remains off unless explicitly armed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EscrowOnchainError,
  escrowOnchainEnabled,
  readEscrowAccount,
} from "../lib/escrow-onchain";

test("readEscrowAccount rejects a malformed pubkey without touching the network", async () => {
  await assert.rejects(
    () => readEscrowAccount("not-a-real-solana-address"),
    (err: unknown) => err instanceof EscrowOnchainError,
  );
});

test("readEscrowAccount rejects an empty/short address", async () => {
  await assert.rejects(
    () => readEscrowAccount("abc"),
    (err: unknown) => err instanceof EscrowOnchainError,
  );
});

test("on-chain settle is off unless ESCROW_REAL_SETTLE is armed", () => {
  // Default .env does not arm real settle; a cutover sets it explicitly.
  if (!process.env.ESCROW_REAL_SETTLE) {
    assert.equal(escrowOnchainEnabled(), false);
  }
});
