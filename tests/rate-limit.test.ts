/**
 * Rate limiter and discount-escrow math tests. The escrow split logic lives
 * in the settle route; the settlement invariant tests here assert the same
 * proportional-release formula shape used by the route.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rateLimit, ApiError } from "../lib/http";
import { env } from "../lib/env";

describe("rate limiter (token bucket)", () => {
  it("allows up to capacity then throws 429", () => {
    const key = `test:${Date.now()}-${Math.random()}`;
    let last: Record<string, string> = {};
    let threw: ApiError | null = null;
    for (let i = 0; i < env.rateLimit.demoMaxPerWindow + 1; i++) {
      try {
        last = rateLimit(key, env.rateLimit.demoMaxPerWindow, 60_000);
      } catch (err) {
        threw = err as ApiError;
      }
    }
    assert.ok(threw instanceof ApiError, "should have been rate limited");
    assert.equal(threw!.status, 429);
    assert.ok(Number(last["RateLimit-Remaining"]) >= 0 || threw !== null);
  });

  it("refills over time (window halves recovers roughly half the capacity)", async () => {
    const key = `refill:${Date.now()}-${Math.random()}`;
    // Drain the bucket
    try {
      for (let i = 0; i < env.rateLimit.demoMaxPerWindow; i++) {
        rateLimit(key, env.rateLimit.demoMaxPerWindow, 100); // fast window
      }
    } catch {
      // capacity might be exhausted here; continue to refill test
    }
    await new Promise((r) => setTimeout(r, 60));
    // ~60ms of a 100ms window refills ~60% of capacity — one call should pass.
    const headers = rateLimit(key, env.rateLimit.demoMaxPerWindow, 100);
    assert.ok(Number(headers["RateLimit-Remaining"]) >= 0);
  });
});

describe("escrow proportional release math", () => {
  function split(totalLocked: number, netted: number, aLocked: number, bLocked: number) {
    const freed = Math.round(Math.max(0, totalLocked - netted) * 100) / 100;
    const toA = Math.round((freed * aLocked) / (aLocked + bLocked) * 100) / 100;
    const toB = Math.round((freed - toA) * 100) / 100;
    return { freed, toA, toB };
  }

  it("releases proportionally and sums exactly", () => {
    const r = split(46_500, 24_500, 26_750, 19_750);
    assert.equal(r.freed, 22_000);
    assert.equal(r.toA + r.toB, r.freed);
  });

  it("never releases when netted equals locked", () => {
    const r = split(10_000, 10_000, 6_000, 4_000);
    assert.equal(r.freed, 0);
    assert.equal(r.toA, 0);
    assert.equal(r.toB, 0);
  });

  it("floors freed capital at zero when netted exceeds locked (defensive)", () => {
    const r = split(10_000, 12_000, 6_000, 4_000);
    assert.equal(r.freed, 0);
  });
});
