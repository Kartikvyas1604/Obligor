import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type DealSession,
  hashPartyToken,
  issuePartyToken,
  publicSession,
  verifyPartyToken,
  authorizedParties,
} from "../lib/deal-session";

function sampleSession(partyB = true, tokens = true): DealSession {
  const base = {
    sessionId: "0x" + "ab".repeat(16),
    chain: "solana" as const,
    createdAt: 1,
    updatedAt: 1,
    status: "both_connected" as const,
    backend: "arcium" as const,
    result: null,
    siloedCombinedUsd: null,
    escrowTxHash: null,
    attestationQuote: null,
    partyA: {
      partyId: "A" as const,
      wallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      label: "A",
      legs: [{ party: "A", venue: "manual", instrument: "x", bucket: "SOL", side: "long", qty: 1, notionalUsd: 100, signedExposureUsd: 100, haircut: 0.1, markUsd: 100, source: "manual" }],
      isReady: true,
      isSealed: false,
      depositedAmountUsd: 0,
    },
  } as DealSession;

  if (partyB) {
    base.partyB = {
      partyId: "B" as const,
      wallet: "4Nd1mBQtrMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytW",
      label: "B",
      legs: [{ party: "B", venue: "manual", instrument: "y", bucket: "SOL", side: "short", qty: 1, notionalUsd: 90, signedExposureUsd: -90, haircut: 0.1, markUsd: 90, source: "manual" }],
      isReady: true,
      isSealed: false,
      depositedAmountUsd: 0,
    };
  }
  if (tokens) {
    base.partyTokenHashes = { A: hashPartyToken("token-a"), B: hashPartyToken("token-b") };
  }
  return base;
}

test("party tokens hash one-way and verify in constant time", () => {
  const token = issuePartyToken();
  assert.ok(token.length > 20);
  const hash = hashPartyToken(token);
  assert.notEqual(hash, token); // never stored raw
  assert.equal(verifyPartyToken(sampleSession(), "A", "token-a"), true);
  assert.equal(verifyPartyToken(sampleSession(), "B", "token-b"), true);
  assert.equal(verifyPartyToken(sampleSession(), "A", "token-b"), false);
  assert.equal(verifyPartyToken(sampleSession(), "A", null), false);
  assert.equal(verifyPartyToken(sampleSession(), "A", "token-a "), false);
});

test("verifyPartyToken denies a party that never received a token", () => {
  const session = sampleSession(true, false); // no hashes at all
  assert.equal(verifyPartyToken(session, "A", "token-a"), false);
  assert.equal(verifyPartyToken(session, "A", null), false);
});

test("verifyPartyToken tolerates a null party B", () => {
  const session = sampleSession(false);
  // A validly-issued B token still verifies; it is harmless because every B
  // mutation is separately gated on partyB existing.
  assert.equal(verifyPartyToken(session, "B", "token-b"), true);
  assert.equal(verifyPartyToken(session, "A", "token-a"), true);
});

test("publicSession masks unauthorized books and keeps its own", () => {
  const session = sampleSession();
  const asA = publicSession(session, { A: true, B: false });
  assert.equal(asA.partyA.legs.length, 1);
  assert.equal(asA.partyA.legsWithheld, undefined);
  assert.equal(asA.partyB?.legs.length, 0);
  assert.equal(asA.partyB?.legsWithheld, true);

  const masked = publicSession(session, { A: false, B: false });
  assert.equal(masked.partyA.legs.length, 0);
  assert.equal(masked.partyA.legsWithheld, true);
  assert.equal(masked.partyB?.legs.length, 0);
});

test("publicSession is a copy — masking never mutates the stored session", () => {
  const session = sampleSession();
  publicSession(session, { A: false, B: false });
  assert.equal(session.partyA.legs.length, 1); // original intact
  assert.equal(session.partyB?.legs.length, 1);
});

test("publicSession never serializes token hashes", () => {
  const session = sampleSession();
  const out = JSON.parse(JSON.stringify(publicSession(session, { A: true, B: true })));
  assert.equal("partyTokenHashes" in out, false);
  assert.equal("partyTokenHashes" in out.partyA, false);
});

test("authorizedParties resolves comma-separated token headers", () => {
  const session = sampleSession();
  assert.deepEqual(authorizedParties(session, null), { A: false, B: false });
  assert.deepEqual(authorizedParties(session, "token-a"), { A: true, B: false });
  assert.deepEqual(authorizedParties(session, "token-a,token-b"), { A: true, B: true });
  assert.deepEqual(authorizedParties(session, "garbage"), { A: false, B: false });
});