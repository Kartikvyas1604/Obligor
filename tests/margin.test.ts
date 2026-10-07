/**
 * Golden tests for the margin engine — the single source of truth mirrored
 * by every confidential backend. If these drift, the backends lie.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { siloedIm, twoPartyNetted, twoPartySiloed, usd } from "../lib/margin";
import type { PositionBook, PositionLeg } from "../lib/margin";

const leg = (
  party: "A" | "B",
  instrument: string,
  bucket: string,
  side: PositionLeg["side"],
  notionalUsd: number,
  haircut: number,
): PositionLeg => ({
  party,
  venue: "manual",
  instrument,
  bucket,
  side,
  qty: 1,
  notionalUsd,
  signedExposureUsd: side === "short" || side === "borrow" ? -notionalUsd : notionalUsd,
  haircut,
  markUsd: 1,
  source: "manual",
});

const book = (party: "A" | "B", legs: PositionLeg[]): PositionBook => ({
  party,
  label: `Desk ${party}`,
  wallet: "a".repeat(44),
  chain: "solana",
  legs,
  warnings: [],
});

describe("siloedIm", () => {
  it("sums haircut * |notional| per leg", () => {
    const im = siloedIm([leg("A", "SOL", "SOL", "lend", 100_000, 0.1), leg("A", "SOLP", "SOL", "short", 50_000, 0.15)]);
    assert.equal(im, 10_000 + 7_500);
  });

  it("is zero on an empty book", () => {
    assert.equal(siloedIm([]), 0);
  });
});

describe("twoPartySiloed", () => {
  it("sums both parties' siloed IMs", () => {
    const r = twoPartySiloed(
      book("A", [leg("A", "SOL", "SOL", "lend", 100_000, 0.1)]),
      book("B", [leg("B", "SOLP", "SOL", "short", 100_000, 0.15)]),
    );
    assert.equal(r.siloedA, 10_000);
    assert.equal(r.siloedB, 15_000);
    assert.equal(r.siloedCombined, 25_000);
  });
});

describe("twoPartyNetted", () => {
  it("offsetting exposures in the same bucket collapse before haircut", () => {
    const r = twoPartyNetted(
      book("A", [leg("A", "SOL lend", "SOL", "lend", 100_000, 0.1)]),
      book("B", [leg("B", "SOL-PERP", "SOL", "short", 100_000, 0.15)]),
    );
    // Net SOL exposure = 0 → IM 0 → all savings.
    assert.equal(r.nettedCombinedUsd, 0);
    assert.equal(r.savingsUsd, 25_000);
  });

  it("partial offset keeps max haircut of the bucket", () => {
    const r = twoPartyNetted(
      book("A", [leg("A", "SOLP long", "SOL", "long", 120_000, 0.15)]),
      book("B", [leg("B", "SOLP short", "SOL", "short", 100_000, 0.15)]),
    );
    // Net exposure 20k * 0.15 = 3k; siloed = (120k + 100k) * 0.15 = 33k
    assert.ok(Math.abs(r.nettedCombinedUsd - 3_000) < 1e-6);
    assert.ok(Math.abs(r.siloedCombinedUsd - 33_000) < 1e-6);
  });

  it("independent buckets do not offset across risk factors", () => {
    const r = twoPartyNetted(
      book("A", [leg("A", "SOL", "SOL", "long", 100_000, 0.15)]),
      book("B", [leg("B", "ETH", "ETH", "short", 100_000, 0.15)]),
    );
    assert.equal(r.nettedCombinedUsd, 30_000); // no cross-bucket credit
    assert.equal(r.savingsUsd, 0);
  });

  it("never reports negative savings", () => {
    const r = twoPartyNetted(
      book("A", [leg("A", "AAPL", "AAPL", "long", 100_000, 0.25)]),
      book("B", [leg("B", "AAPL", "AAPL", "short", 100_000, 0.25)]),
    );
    assert.ok(r.savingsUsd >= 0);
  });

  it("buckets carry the max haircut seen in that bucket", () => {
    const r = twoPartyNetted(
      book("A", [leg("A", "SOL spot", "SOL", "lend", 50_000, 0.1)]),
      book("B", [leg("B", "SOL perp", "SOL", "short", 45_000, 0.15)]),
    );
    // Net exposure 5k → haircut max(0.1, 0.15) = 0.15 → 750
    assert.ok(Math.abs(r.nettedCombinedUsd - 750) < Math.pow(10, -6));
  });

  it("handles both books empty", () => {
    const r = twoPartyNetted(book("A", []), book("B", []));
    assert.equal(r.nettedCombinedUsd, 0);
    assert.equal(r.siloedCombinedUsd, 0);
    assert.equal(r.grossNotionalUsd, 0);
  });

  it("is stable under leg reordering (commutative union)", () => {
    const a = book("A", [leg("A", "S1", "SOL", "long", 10_000, 0.15), leg("A", "B1", "BTC", "short", 20_000, 0.15)]);
    const b = book("B", [leg("B", "S2", "SOL", "short", 12_000, 0.15)]);
    const r1 = twoPartyNetted(a, b);
    const r2 = twoPartyNetted(
      book("A", [leg("A", "B1", "BTC", "short", 20_000, 0.15), leg("A", "S1", "SOL", "long", 10_000, 0.15)]),
      b,
    );
    assert.equal(r1.nettedCombinedUsd, r2.nettedCombinedUsd);
    assert.equal(r1.savingsUsd, r2.savingsUsd);
  });

  it("formats USD with two decimals", () => {
    assert.equal(usd(1234.5), "$1,234.50");
  });
});
