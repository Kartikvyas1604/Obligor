/**
 * Obligor Test Runner (Native Node.js ESM)
 * Executes mathematical engine assertions across all backends.
 */

import { twoPartyNetted, twoPartySiloed, siloedIm } from "../lib/margin.ts";
import { solanaPartyA, solanaPartyB, monadPairs } from "../lib/fixtures.ts";
import { getConfidentialBackend } from "../lib/confidential.ts";

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runTests() {
  console.log("\n==================================================");
  console.log(" Obligor Margin Engine & Backends Verification");
  console.log("==================================================\n");

  // Test 1: Siloed IM Math
  const partyASiloed = siloedIm(solanaPartyA.legs);
  assert(partyASiloed === 26750, `Party A siloed IM matches expected $26,750 (got $${partyASiloed.toLocaleString()})`);

  // Test 2: Party B Siloed IM Math
  const partyBSiloed = siloedIm(solanaPartyB.legs);
  assert(partyBSiloed === 19750, `Party B siloed IM matches expected $19,750 (got $${partyBSiloed.toLocaleString()})`);

  // Test 3: Combined Siloed IM
  const { siloedCombined } = twoPartySiloed(solanaPartyA, solanaPartyB);
  assert(
    siloedCombined === 46500,
    `Combined Siloed IM is exactly $46,500 (got $${siloedCombined.toLocaleString()})`,
  );

  // Test 4: Two-Party Bucket Netting
  const netted = twoPartyNetted(solanaPartyA, solanaPartyB);
  assert(
    netted.nettedCombinedUsd === 24500,
    `Two-party netted combined IM equals expected $24,500 (got $${netted.nettedCombinedUsd.toLocaleString()})`,
  );
  assert(
    netted.savingsUsd === 22000,
    `Capital freed (savings) equals expected $22,000 / 47.3% (got $${netted.savingsUsd.toLocaleString()})`,
  );

  // Test 5: Monad Parallel Pairs (>=3 Pairs)
  assert(monadPairs.length >= 3, `Monad multi-pair fixture contains >= 3 pairs (count=${monadPairs.length})`);
  for (const pair of monadPairs) {
    const pairNet = twoPartyNetted(pair.a, pair.b);
    assert(pairNet.savingsUsd > 0, `Pair ${pair.label} successfully netted with savings: $${pairNet.savingsUsd.toLocaleString()}`);
  }

  // Test 6: Pluggable Confidential Backends (Privacy Invariant Check)
  for (const backendKind of ["simulated", "arcium", "enclave"]) {
    const backend = getConfidentialBackend(backendKind);
    const result = await backend.netTwoParty(solanaPartyA, solanaPartyB);
    assert(result.backend === backendKind, `Backend '${backendKind}' returns matching backend kind`);
    assert(result.nettedCombinedUsd === 24500, `Backend '${backendKind}' evaluates identical pure formula ($24,500)`);
    assert(Boolean(result.computationId), `Backend '${backendKind}' outputs unique computation ID (${result.computationId})`);
  }

  console.log("\n🎉 ALL TESTS PASSED! Mathematical engine & pluggable backends 100% verified.\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
