import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import { priceAndNormalizeLegs } from "@/lib/positions";
import { chainSchema } from "@/lib/env";
import { walletSchema } from "@/lib/contracts";
import { fetchDriftSubAccount } from "@/lib/adapters/drift";

const bodySchema = z.object({
  party: z.enum(["A", "B"]),
  wallet: z.string().trim().min(32).max(64),
  chain: chainSchema.default("solana"),
  label: z.string().trim().max(40).optional(),
  legs: z.array(z.unknown()).max(64).optional(),
});

/**
 * GET /api/v1/positions?wallet=<address>&chain=solana
 * Read a desk's LIVE perp exposure straight from the venue (Drift Data API),
 * sized at the venue's own oracle mark. Read-only and secret-free: it never
 * returns anything the wallet owner hasn't already published on-chain. POST is
 * used to oracle-price a caller-supplied leg list; GET never invents positions.
 */
export const GET = withApi(async ({ req }) => {
  rateLimitFor("default", req);
  const url = new URL(req.url);
  const walletParam = url.searchParams.get("wallet");
  const chain = url.searchParams.get("chain") ?? "solana";

  if (!walletParam) {
    throw ApiError.badRequest(
      "Provide ?wallet=<address>. GET reads live venue exposure; POST /v1/positions oracle-prices a caller-supplied leg list.",
    );
  }
  const parsedWallet = walletSchema.safeParse(walletParam);
  if (!parsedWallet.success) {
    throw ApiError.badRequest("wallet must be a Solana base58 pubkey or an EVM 0x address", {
      wallet: walletParam,
    });
  }
  if (chain !== "solana") {
    throw ApiError.badRequest(
      "Live position reads are Solana/Drift-only; Monad legs are priced via POST /v1/positions",
      { chain },
    );
  }

  try {
    const snapshot = await fetchDriftSubAccount(parsedWallet.data);
    return NextResponse.json({
      ok: true,
      wallet: snapshot.authority,
      chain,
      venue: "drift",
      source: "drift_data_api",
      subAccountId: snapshot.subAccountId,
      fetchedAt: snapshot.fetchedAt,
      perpExposures: snapshot.perpExposures,
      note:
        "Live perp exposure read from the Drift Data API, sized at the venue oracle mark (Pyth). markStatus labels live vs. fallback pricing.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("DRIFT_SUBACCOUNT_NOT_CONFIGURED")) {
      throw ApiError.badRequest(
        "Drift subaccount reads are not configured — nothing to read for this wallet.",
      );
    }
    if (message.startsWith("DRIFT_OFFLINE")) {
      throw ApiError.unavailable(`Drift Data API unreachable: ${message}`);
    }
    throw ApiError.unavailable(`Could not read Drift exposure: ${message}`);
  }
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
