import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import { priceAndNormalizeLegs } from "@/lib/positions";
import { chainSchema } from "@/lib/env";

const bodySchema = z.object({
  party: z.enum(["A", "B"]),
  wallet: z.string().trim().min(32).max(64),
  chain: chainSchema.default("solana"),
  label: z.string().trim().max(40).optional(),
  legs: z.array(z.unknown()).max(64).optional(),
});

/**
 * POST /api/v1/positions
 * Validate + oracle-price a desk's leg list and return the normalized book.
 * No server-side default books: the caller supplies the legs they want priced.
 */
export const POST = withApi(async ({ req }) => {
  rateLimitFor("default", req);
  const body = parseBody(bodySchema, await readJsonBody(req));

  if (!body.legs || body.legs.length === 0) {
    throw ApiError.badRequest("Provide at least one leg to price — Obligor does not invent positions");
  }

  const priced = await priceAndNormalizeLegs(body.party, body.legs, { source: "manual" });

  return NextResponse.json({
    ok: true,
    book: {
      party: body.party,
      wallet: body.wallet,
      chain: body.chain,
      label: body.label ?? `Desk ${body.party}`,
      legs: priced.legs,
      warnings: priced.warnings,
    },
    priceSources: priced.priceSources,
    fetchedAt: new Date().toISOString(),
  });
});
