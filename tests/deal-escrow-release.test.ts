/**
 * Deal-room escrow release tests. The release split MUST be computed
 * server-side from each desk's locked siloed margin and the verified netting
 * result — never invented on the client.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dealEscrowRelease, type DealSession } from "../lib/deal-session";
import type { ConfidentialNetMarginResult } from "../lib/confidential";

function makeSession(opts: {
  depositedA: number;
  depositedB: number;
  netted: number;
}): DealSession {
  return {
    sessionId: "0xrelease",
    chain: "solana",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "escrow_locked",
    backend: "arcium",
    partyA: {
      partyId: "A",
      wallet: "w".repeat(44),
      label: "Desk A",
      legs: [],
      isReady: true,
      isSealed: true,
      depositedAmountUsd: opts.depositedA,
    },
    partyB: {
      partyId: "B",
      wallet: "x".repeat(44),
      label: "Desk B",
      legs: [],
      isReady: true,
      isSealed: true,
      depositedAmountUsd: opts.depositedB,
    },
    result: {
      computationId: "0xcomp",
      nettedCombinedUsd: opts.netted,
      siloedAUsd: opts.depositedA,
      siloedBUsd: opts.depositedB,
      savingsUsd: opts.depositedA + opts.depositedB - opts.netted,
      siloedCombinedUsd: opts.depositedA + opts.depositedB,
      grossNotionalUsd: 0,
      netExposureUsd: 0,
      buckets: [],
      backend: "arcium",
      trustModel: "simulated_plaintext_compute",
      timestamp: new Date().toISOString(),
    } satisfies ConfidentialNetMarginResult,
    siloedCombinedUsd: opts.depositedA + opts.depositedB,
    escrowTxHash: null,
    attestationQuote: null,
  };
}

describe("dealEscrowRelease", () => {
  it("splits freed capital proportionally to each desk's locked margin", () => {
    const session = makeSession({ depositedA: 80, depositedB: 70, netted: 40 });
    const rel = dealEscrowRelease(session);
    assert.ok(rel);
    // freed = 150 - 40 = 110; A share = 110 * 80/150 = 58.666… -> 58.67
    assert.equal(rel.freedCapitalUsd, 110);
    assert.equal(rel.releasedToPartyAUsd, 58.67);
    assert.equal(rel.releasedToPartyBUsd, 51.33);
  });

  it("released amounts always sum to the freed capital", () => {
    const session = makeSession({ depositedA: 123.45, depositedB: 67.89, netted: 100.01 });
    const rel = dealEscrowRelease(session);
    assert.ok(rel);
    assert.equal(
      Math.round((rel.releasedToPartyAUsd + rel.releasedToPartyBUsd) * 100) / 100,
      rel.freedCapitalUsd,
    );
  });

  it("never releases negative capital when netted exceeds locked", () => {
    const session = makeSession({ depositedA: 10, depositedB: 10, netted: 25 });
    const rel = dealEscrowRelease(session);
    assert.ok(rel);
    assert.equal(rel.freedCapitalUsd, 0);
    assert.equal(rel.releasedToPartyAUsd, 0);
    assert.equal(rel.releasedToPartyBUsd, 0);
  });

  it("returns null before a verified result or counterparty exists", () => {
    const noResult = makeSession({ depositedA: 80, depositedB: 70, netted: 40 });
    noResult.result = null;
    assert.equal(dealEscrowRelease(noResult), null);

    const noPartyB = makeSession({ depositedA: 80, depositedB: 70, netted: 40 });
    noPartyB.partyB = null;
    assert.equal(dealEscrowRelease(noPartyB), null);
  });

  it("returns null when nothing was locked", () => {
    const session = makeSession({ depositedA: 0, depositedB: 0, netted: 0 });
    assert.equal(dealEscrowRelease(session), null);
  });
});
