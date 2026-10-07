import { NextResponse } from "next/server";
import { ApiError, rateLimitFor, withApi } from "@/lib/http";
import { env } from "@/lib/env";
import { solanaPartyA, solanaPartyB } from "@/lib/fixtures";

/**
 * POST /api/v1/demo/fixture-two-party
 * Dev/demo-only: returns the labeled fixture books for the judge flow.
 * Gated behind DEMO_ALLOW_FIXTURES — disabled by default in production.
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
    fixture: "two_party_judge_offsetting",
    partyA: solanaPartyA,
    partyB: solanaPartyB,
    note: "Demo fixture books. Quantities are examples — positions are never invented on production paths.",
  });
});

