/**
 * Desk-book risk analytics: deterministic metrics and explicit stress shocks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PositionLeg } from "../lib/margin";
import { analyzeRisk, bucketClass, stressPortfolio, stressTest, STRESS_SCENARIOS } from "../lib/risk";

function leg(over: Partial<PositionLeg>): PositionLeg {
  return {
    party: "A",
    venue: "manual",
    instrument: "SOL-PERP",
    bucket: "SOL",
    side: "long",
    qty: 1,
    notionalUsd: 1000,
    signedExposureUsd: 1000,
    haircut: 0.2,
    markUsd: 1,
    source: "manual",
    ...over,
  };
}

test("bucketClass separates crypto, equity and other", () => {
  assert.equal(bucketClass("SOL"), "crypto");
  assert.equal(bucketClass("aapl"), "equity");
  assert.equal(bucketClass("WTI"), "other");
});

test("analyzeRisk returns null for an empty book", () => {
  assert.equal(analyzeRisk([]), null);
});

test("analyzeRisk computes exposure, margin, bias and concentration", () => {
  const report = analyzeRisk([
    leg({ bucket: "SOL", notionalUsd: 1000, signedExposureUsd: 1000, haircut: 0.2 }),
    leg({ bucket: "SOL", notionalUsd: 1000, signedExposureUsd: -600, haircut: 0.3 }),
  ])!;
  assert.equal(report.grossNotionalUsd, 2000);
  assert.equal(report.netExposureUsd, 400);
  assert.equal(report.longExposureUsd, 1000);
  assert.equal(report.shortExposureUsd, 600);
  assert.equal(report.directionalBias, 0.2);
  assert.equal(report.imUsd, 500);
  assert.equal(report.weightedHaircut, 0.25);
  assert.equal(report.bucketCount, 1);
  assert.equal(report.concentrationHhi, 1);
  assert.equal(report.effectiveBuckets, 1);
  assert.equal(report.topBucket?.bucket, "SOL");
});

test("analyzeRisk spreads concentration across buckets", () => {
  const report = analyzeRisk([
    leg({ bucket: "SOL", notionalUsd: 750 }),
    leg({ bucket: "ETH", notionalUsd: 250 }),
  ])!;
  // shares 0.75 and 0.25 → HHI = 0.5625 + 0.0625 = 0.625
  assert.equal(report.concentrationHhi, 0.625);
  assert.equal(report.effectiveBuckets, 1.6);
});

test("risk-off shock scales bucket marks and P&L by class", () => {
  const legs = [
    leg({ bucket: "SOL", notionalUsd: 1000, signedExposureUsd: 1000, haircut: 0.2 }),
    leg({ bucket: "SOL", notionalUsd: 1000, signedExposureUsd: -600, haircut: 0.3 }),
  ];
  const scenario = STRESS_SCENARIOS.find((s) => s.id === "risk_off")!;
  const outcome = stressTest(legs, scenario);
  // pnl = 1000*(-0.25) + (-600)*(-0.25) = -100
  assert.equal(outcome.pnlUsd, -100);
  // stressed notional 750 each → IM = 0.2*750 + 0.3*750 = 375; base 500 → delta -125
  assert.equal(outcome.stressedImUsd, 375);
  assert.equal(outcome.imDeltaUsd, -125);
  assert.equal(outcome.stressedNetExposureUsd, 300);
});

test("margin-spiral shock widens haircuts with no P&L", () => {
  const legs = [
    leg({ bucket: "ETH", notionalUsd: 1000, signedExposureUsd: 1000, haircut: 0.2 }),
  ];
  const scenario = STRESS_SCENARIOS.find((s) => s.id === "margin_spiral")!;
  const outcome = stressTest(legs, scenario);
  assert.equal(outcome.pnlUsd, 0);
  assert.equal(outcome.stressedImUsd, 300);
  assert.equal(outcome.imDeltaUsd, 100);
});

test("stressPortfolio returns one outcome per scenario", () => {
  const outcomes = stressPortfolio([leg({})]);
  assert.equal(outcomes.length, STRESS_SCENARIOS.length);
});
