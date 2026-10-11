import { NextResponse } from "next/server";
import { ApiError, rateLimitFor, withApi } from "@/lib/http";
import { env } from "@/lib/env";
import { solanaThreeParty } from "@/lib/fixtures";

/**
 * POST /api/v1/demo/fixture-three-party
 * Dev/demo-only: three desks (A, B, C) whose exposures net to a small
 * residual across risk buckets. Gated behind DEMO_ALLOW_FIXTURES.
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
    fixture: "three_party_judge_offsetting",
    partyCount: solanaThreeParty.length,
    parties: solanaThreeParty.map((book) => ({
      party: book.party,
      label: book.label,
      wallet: book.wallet,
      warnings: book.warnings,
      legs: book.legs,
    })),
    note: "Demo fixture books. Quantities are examples — positions are never invented on production paths.",
  });
});