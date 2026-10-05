/**
 * Obligor Standalone Mathematical Engine Verification Suite
 */

function siloedIm(legs) {
  return legs.reduce((sum, leg) => sum + leg.haircut * Math.abs(leg.notionalUsd), 0);
}

function twoPartySiloed(bookA, bookB) {
  const siloedA = siloedIm(bookA.legs);
  const siloedB = siloedIm(bookB.legs);
  return { siloedA, siloedB, siloedCombined: siloedA + siloedB };
}

function twoPartyNetted(bookA, bookB) {
  const { siloedA, siloedB, siloedCombined } = twoPartySiloed(bookA, bookB);
  const all = [...bookA.legs, ...bookB.legs];

  const buckets = new Map();
  for (const leg of all) {
    const b = buckets.get(leg.bucket) || { exposure: 0, haircut: leg.haircut, notional: 0 };
    b.exposure += leg.signedExposureUsd;
    b.haircut = Math.max(b.haircut, leg.haircut);
    b.notional += leg.notionalUsd;
    buckets.set(leg.bucket, b);
  }

  const bucketResults = [];
  let nettedCombined = 0;
  let grossNotional = 0;
  for (const [bucket, b] of buckets) {
    const im = b.haircut * Math.abs(b.exposure);
    nettedCombined += im;
    grossNotional += b.notional;
    bucketResults.push({ bucket, exposureUsd: b.exposure, haircut: b.haircut, imUsd: im });
  }

  const savings = Math.max(0, siloedCombined - nettedCombined);
  const ROUND = (n) => Math.round(n * 100) / 100;

  return {
    siloedAUsd: ROUND(siloedA),
    siloedBUsd: ROUND(siloedB),
    siloedCombinedUsd: ROUND(siloedCombined),
    nettedCombinedUsd: ROUND(nettedCombined),
    savingsUsd: ROUND(savings),
    grossNotionalUsd: ROUND(grossNotional),
    netExposureUsd: ROUND(all.reduce((s, l) => s + l.signedExposureUsd, 0)),
    buckets: bucketResults.sort((x, y) => y.imUsd - x.imUsd),
  };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

function runSuite() {
  console.log("\n==================================================");
  console.log(" Obligor Mathematical Netting Engine Tests");
  console.log("==================================================\n");

  const leg = (party, venue, instrument, bucket, side, notionalUsd, signedExposureUsd, haircut, markUsd) => ({
    party, venue, instrument, bucket, side, qty: Math.abs(notionalUsd) / markUsd,
    notionalUsd: Math.abs(notionalUsd), signedExposureUsd, haircut, markUsd
  });

  const partyA = {
    party: "A", wallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", chain: "solana",
    legs: [
      leg("A", "kamino", "SOL lend", "SOL", "lend", 90000, 90000, 0.1, 142.5),
      leg("A", "kamino", "USDC deposit", "USD", "lend", 40000, 40000, 0.1, 1.0),
      leg("A", "mock_equity", "tAAPL long", "AAPL", "long", 55000, 55000, 0.25, 190.0),
    ]
  };

  const partyB = {
    party: "B", wallet: "4Nd1mBQtrMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytW", chain: "solana",
    legs: [
      leg("B", "drift", "SOL-PERP", "SOL", "short", 95000, -95000, 0.15, 142.5),
      leg("B", "drift", "BTC-PERP", "BTC", "long", 30000, 30000, 0.15, 64200.0),
      leg("B", "kamino", "SOL borrow", "SOL", "borrow", 10000, -10000, 0.1, 142.5),
    ]
  };

  // Test 1: Siloed Math
  const siloedA = siloedIm(partyA.legs);
  assert(siloedA === 26750, `Party A Siloed IM matches $26,750 (got $${siloedA.toLocaleString()})`);

  const siloedB = siloedIm(partyB.legs);
  assert(siloedB === 19750, `Party B Siloed IM matches $19,750 (got $${siloedB.toLocaleString()})`);

  // Test 2: Combined Siloed Math
  const { siloedCombined } = twoPartySiloed(partyA, partyB);
  assert(siloedCombined === 46500, `Combined Siloed IM is $46,500 (got $${siloedCombined.toLocaleString()})`);

  // Test 3: Two-Party Netting Math
  const netted = twoPartyNetted(partyA, partyB);
  assert(netted.nettedCombinedUsd === 24500, `Netted Combined Margin equals $24,500 (got $${netted.nettedCombinedUsd.toLocaleString()})`);
  assert(netted.savingsUsd === 22000, `Capital freed equals $22,000 / 47.3% (got $${netted.savingsUsd.toLocaleString()})`);

  console.log("\n🎉 ALL MATHEMATICAL ENGINE TESTS PASSED (100% Verified)!\n");
}

runSuite();
