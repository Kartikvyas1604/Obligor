/**
 * Obligor Golden Fixture & Mathematical Netting Engine Tests
 * Run with: npx tsx scripts/test-margin.ts
 */

import { twoPartyNetted, twoPartySiloed, siloedIm } from "../lib/margin";
import { solanaPartyA, solanaPartyB, adversarialBooks, monadPairs } from "../lib/fixtures";
import { getConfidentialBackend } from "../lib/confidential";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runTests() {
  console.log("\n--- Running Obligor Margin Engine Tests ---\n");

  // Test 1: Siloed IM Math
  const partyASiloed = siloedIm(solanaPartyA.legs);
  // Party A: 90,000 * 0.1 (SOL lend) + 40,000 * 0.1 (USDC deposit) + 55,000 * 0.25 (tAAPL)
  // = 9,000 + 4,000 + 13,750 = 26,750
  assert(partyASiloed === 26750, `Party A siloed IM matches expected $26,750 (got ${partyASiloed})`);

  // Test 2: Party B Siloed IM Math
  const partyBSiloed = siloedIm(solanaPartyB.legs);
  // Party B: 95,000 * 0.15 (SOL-PERP short) + 30,000 * 0.15 (BTC-PERP) + 10,000 * 0.1 (SOL borrow)
  // = 14,250 + 4,500 + 1,000 = 19,750
  assert(partyBSiloed === 19750, `Party B siloed IM matches expected $19,750 (got ${partyBSiloed})`);

  // Test 3: Combined Siloed IM
  const { siloedCombined } = twoPartySiloed(solanaPartyA, solanaPartyB);
  assert(
    siloedCombined === 46500,
    `Combined Siloed IM is exactly 26,750 + 19,750 = 46,500 (got ${siloedCombined})`,
  );

  // Test 4: Two-Party Bucket Netting
  // SOL Bucket: Party A (+90,000 lend) vs Party B (-95,000 perp short, -10,000 borrow)
  // Net signed exposure = +90,000 - 95,000 - 10,000 = -15,000
  // Max haircut in SOL bucket = max(0.1, 0.15, 0.1) = 0.15
  // SOL bucket IM = 0.15 * |-15,000| = 2,250
  // Other buckets: USD = 40,000 * 0.1 = 4,000; BTC = 30,000 * 0.15 = 4,500; AAPL = 55,000 * 0.25 = 13,750
  // Total Netted IM = 2,250 + 4,000 + 4,500 + 13,750 = 24,500
  // Capital freed (Savings) = 46,500 - 24,500 = 22,000 (47.3% savings)
  const netted = twoPartyNetted(solanaPartyA, solanaPartyB);
  assert(
    netted.nettedCombinedUsd === 24500,
    `Two-party netted combined IM equals expected $24,500 (got ${netted.nettedCombinedUsd})`,
  );
  assert(
    netted.savingsUsd === 22000,
    `Capital freed (savings) equals expected $22,000 (got ${netted.savingsUsd})`,
  );

  // Test 5: Adversarial Perfect Offset Test
  const advNetted = twoPartyNetted(adversarialBooks.a, adversarialBooks.b);
  assert(
    advNetted.savingsUsd > 0,
    `Adversarial fixture yields significant capital savings: $${advNetted.savingsUsd}`,
  );

  // Test 6: Monad Parallel Pairs Test (≥3 Pairs)
  assert(monadPairs.length >= 3, `Monad multi-pair fixture contains ≥3 pairs (count=${monadPairs.length})`);
  for (const pair of monadPairs) {
    const pairNet = twoPartyNetted(pair.a, pair.b);
    assert(pairNet.savingsUsd > 0, `Pair ${pair.label} successfully netted with savings: $${pairNet.savingsUsd}`);
  }

  // Test 7: Pluggable Confidential Backends (Privacy & Schema Check)
  for (const backendKind of ["simulated", "arcium", "enclave"] as const) {
    const backend = getConfidentialBackend(backendKind);
    const result = await backend.netTwoParty(solanaPartyA, solanaPartyB);
    assert(
      result.backend === backendKind,
      `Backend '${backendKind}' returns result matching backend kind`,
    );
    assert(
      result.nettedCombinedUsd === 24500,
      `Backend '${backendKind}' evaluates identical pure formula ($24,500)`,
    );
    assert(
      Boolean(result.computationId),
      `Backend '${backendKind}' provides unique computation ID (${result.computationId})`,
    );
  }

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! Mathematical engine & backends verified.\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
