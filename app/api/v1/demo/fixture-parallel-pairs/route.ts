import { NextResponse } from "next/server";
import { ApiError, rateLimitFor, withApi } from "@/lib/http";
import { env } from "@/lib/env";
import { monadPairs } from "@/lib/fixtures";

/**
 * POST /api/v1/demo/fixture-parallel-pairs
 * Dev/demo-only: returns >=3 labeled Monad desk pairs for the parallel
 * clearing screen. Gated behind DEMO_ALLOW_FIXTURES.
 */
export const POST = withApi(async ({ req }) => {
  rateLimitFor("demo", req);
  if (!env.demo.allowFixtures) {
    throw ApiError.unavailable(
      "Demo fixtures are disabled. Set DEMO_ALLOW_FIXTURES=true in non-production environments to enable this judge fixture.",
    );
  }

  return NextResponse.json({
    ok: true,
    fixture: "monad_parallel_pairs",
    count: monadPairs.length,
    pairs: monadPairs,
    note: "Three concurrent demo desk pairs for the Monad epoch screen. Quantity examples, not live positions.",
  });
});
