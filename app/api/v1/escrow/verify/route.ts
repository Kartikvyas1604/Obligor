import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import { EscrowOnchainError, readEscrowAccount } from "@/lib/escrow-onchain";

const bodySchema = z.object({
  escrowAccount: z.string().trim().min(32).max(64),
});

/**
 * POST /api/v1/escrow/verify
 * Read a live escrow account straight off the RPC and decode it. This is the
 * independent check that a "deposit" the UI claims actually exists on-chain —
 * the response contains the real parties, amounts, mint and status.
 */
export const POST = withApi(async ({ req }) => {
  const headers = rateLimitFor("default", req);
  const body = parseBody(bodySchema, await readJsonBody(req));
  try {
    const snapshot = await readEscrowAccount(body.escrowAccount);
    return NextResponse.json({ ok: true, escrow: snapshot }, { headers });
  } catch (err) {
    if (err instanceof EscrowOnchainError) {
      throw new ApiError(404, "ESCROW_NOT_FOUND", err.message);
    }
    throw err;
  }
});
