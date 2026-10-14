/**
 * Privacy invariant for the /verify flow: a party re-submitting only THEIR OWN
 * legs must get a verification result that never reveals the counterparty's
 * book — no legs, no counterparty hash, no per-leg values. The registry stores
 * only hashes; this test drives the real route handler end-to-end.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../app/api/v1/net-margin/verify/route";
import { registerComputation } from "../lib/computation-registry";
import { priceAndNormalizeLegs } from "../lib/positions";
import { hashLegs } from "../lib/commitment";

const COMPUTATION_ID = "comp_" + "a".repeat(12);
const COMMITMENT = "sha256:" + "b".repeat(64);
const MARKS = { SOL: 100 };

// Party A's book, in the shape the API accepts (no `party` field).
const legsA = [
  { venue: "manual", instrument: "SOL-PERP", bucket: "SOL", side: "long", qty: 10, markUsd: 100 },
  { venue: "manual", instrument: "SOL-SPOT", bucket: "SOL", side: "long", qty: 5, markUsd: 100 },
];
// Party B's book — must never appear in A's verify response.
const legsB = [
  { venue: "manual", instrument: "SECRET-B-ONLY", bucket: "SOL", side: "short", qty: 7, markUsd: 100 },
];

async function registerBoth(): Promise<void> {
  const pricedA = await priceAndNormalizeLegs("A", legsA, { source: "manual", marksOverride: MARKS });
  const pricedB = await priceAndNormalizeLegs("B", legsB, { source: "manual", marksOverride: MARKS });
  registerComputation({
    computationId: COMPUTATION_ID,
    chain: "solana",
    backendKind: "simulated",
    commitmentHash: COMMITMENT,
    partyLegHashes: { A: hashLegs(pricedA.legs), B: hashLegs(pricedB.legs) },
    marksByBucket: MARKS,
    combinedNettedUsd: 400,
    grossNotionalUsd: 2200,
    perPartySiloedUsd: { A: 200, B: 200 },
    createdAt: Date.now(),
  });
}

function verifyReq(legs: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/net-margin/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      computationId: COMPUTATION_ID,
      commitmentHash: COMMITMENT,
      party: "A",
      legs,
    }),
  });
}

test("verify succeeds for the caller's own legs", async () => {
  await registerBoth();
  const res = await POST(verifyReq(legsA), { params: Promise.resolve({}) });
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.verified, true);
  assert.equal(body.hashMatch, true);
  assert.equal(body.party, "A");
});

test("verify response never leaks the counterparty's book", async () => {
  await registerBoth();
  const res = await POST(verifyReq(legsA), { params: Promise.resolve({}) });
  const raw = await res.text();
  const body = JSON.parse(raw) as Record<string, unknown>;

  // No legs array, no counterparty hash, no per-party values anywhere.
  assert.equal("legs" in body, false, "no legs array");
  assert.equal("legsA" in body, false);
  assert.equal("legsB" in body, false);
  assert.equal("partyLegHashes" in body, false);
  assert.equal("perPartySiloedUsd" in body, false);

  // The counterparty's stored hash and instrument string must not appear.
  const { getComputation } = await import("../lib/computation-registry");
  const rec = getComputation(COMPUTATION_ID);
  assert.ok(rec);
  assert.equal(raw.includes(rec!.partyLegHashes.B), false, "never returns B's hash");
  assert.equal(raw.includes("SECRET-B-ONLY"), false, "never returns B's instrument");

  // Only the caller's own siloed contribution is echoed.
  assert.equal(typeof body.siloedContributionUsd, "number");
  assert.equal(body.combinedNettedUsd, 400);
});

test("a mismatched re-submission fails closed without leaking", async () => {
  await registerBoth();
  const tampered = [{ ...legsA[0], qty: 999 }];
  const res = await POST(verifyReq(tampered), { params: Promise.resolve({}) });
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.verified, false);
  assert.equal(body.hashMatch, false);
  assert.equal(body.storedHashPrefix !== null, true);
});
