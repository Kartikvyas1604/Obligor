import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import { createDealSession } from "@/lib/deal-session";
import { priceAndNormalizeLegs } from "@/lib/positions";
import { backendKindSchema, walletSchema } from "@/lib/contracts";

const createSchema = z.object({
  walletA: walletSchema,
  labelA: z.string().trim().max(40).default("Desk A (Initiator)"),
  legsA: z.array(z.record(z.unknown())).max(32).optional(),
  backend: backendKindSchema.optional(),
});

/** Create a deal room. Legs are optional at creation and can be added after. */
export const POST = withApi(async ({ req }) => {
  rateLimitFor("default", req);
  const body = parseBody(createSchema, await readJsonBody(req));

  let legs;
  let warnings: string[] = [];
  if (body.legsA && body.legsA.length > 0) {
    const priced = await priceAndNormalizeLegs("A", body.legsA, { source: "manual" });
    legs = priced.legs;
    warnings = priced.warnings;
  }

  const session = createDealSession(body.walletA, body.labelA, legs ?? [], body.backend ?? "arcium");

  return NextResponse.json(
    {
      ok: true,
      session,
      warnings,
    },
    { status: 201 },
  );
});
