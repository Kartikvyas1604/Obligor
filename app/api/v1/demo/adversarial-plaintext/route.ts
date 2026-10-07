import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import { env } from "@/lib/env";
import { adversarialBooks } from "@/lib/fixtures";
import { twoPartyNetted, twoPartySiloed } from "@/lib/margin";

const bodySchema = z.object({
  iUnderstandThisLeaksBothBooks: z.literal(true),
});

/**
 * POST /api/v1/demo/adversarial-plaintext
 * Demo-only counterfactual: deliberately returns BOTH books in plaintext to
 * demonstrate why single-operator clearing is toxic. Requires explicit
 * acknowledgment, is rate-limited, and is gated behind DEMO_ALLOW_FIXTURES.
 * Never used by the confidential path.
 */
export const POST = withApi(async ({ req }) => {
  rateLimitFor("demo", req);
  if (!env.demo.allowFixtures) {
    throw ApiError.unavailable(
      "The adversarial plaintext demo is disabled in this environment (DEMO_ALLOW_FIXTURES=false). The confidential path never exposes either book.",
    );
  }

  parseBody(bodySchema, await readJsonBody(req));

  const siloed = twoPartySiloed(adversarialBooks.a, adversarialBooks.b);
  const netted = twoPartyNetted(adversarialBooks.a, adversarialBooks.b);

  return NextResponse.json({
    ok: true,
    danger: "DANGEROUS / plaintext operator view",
    demonstrationPurpose:
      "Shows why single-operator centralized clearing creates a fatal privacy liability: the operator sees both books and can front-run either desk.",
    partyA: adversarialBooks.a,
    partyB: adversarialBooks.b,
    siloed,
    netted,
    operatorThreatVector:
      "The operator learns Desk A's full book and Desk B's full book in plaintext. They can liquidate, front-run, or copy-trade before releasing margin.",
    timestamp: new Date().toISOString(),
  });
});
