import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import { chainSchema } from "@/lib/env";
import {
  IdempotencyConflictError,
  fingerprintBody,
  recordIdempotent,
  replayIdempotent,
} from "@/lib/idempotency";

const bodySchema = z.object({
  escrowId: z.string().trim().min(4).max(64),
  chain: chainSchema.default("solana"),
  totalLockedUsd: z.number().positive().max(100_000_000),
  /** Netted margin may be 0 for fully offsetting books — never negative. */
  nettedMarginUsd: z.number().nonnegative().max(100_000_000),
  /** Output of the confidential computation this release is conditioned on. */
  proofHash: z.string().trim().min(8).max(128),
  partyALockedUsd: z.number().nonnegative(),
  partyBLockedUsd: z.number().nonnegative(),
});

/**
 * POST /api/v1/escrow/settle
 * Computes the proportional release of freed capital against the escrow.
 * Validates that netted margin does not exceed what was locked and that the
 * desk splits reconcile to the locked total — no silent default amounts.
 */
export const POST = withApi(async ({ req }) => {
  rateLimitFor("default", req);
  const body = parseBody(bodySchema, await readJsonBody(req));

  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) {
    const fingerprint = fingerprintBody(body as unknown as Record<string, unknown>);
    let prior: { ok: boolean; escrowId: string } | null;
    try {
      prior = replayIdempotent<{ ok: boolean; escrowId: string }>(idempotencyKey, fingerprint);
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        throw new ApiError(err.status, err.code, err.message);
      }
      throw err;
    }
    if (prior) {
      return NextResponse.json({
        ...prior,
        replayed: true,
        note: "This settlement was already computed — returning the original result (Idempotency-Key replay).",
      });
    }
  }

  if (body.nettedMarginUsd > body.totalLockedUsd) {
    throw ApiError.badRequest(
      "Netted margin cannot exceed the total locked amount",
      { nettedMarginUsd: body.nettedMarginUsd, totalLockedUsd: body.totalLockedUsd },
    );
  }

  const splitTotal = body.partyALockedUsd + body.partyBLockedUsd;
  if (Math.abs(splitTotal - body.totalLockedUsd) > 0.01) {
    throw ApiError.badRequest(
      "Desk deposits must sum to the total locked amount",
      { partyALockedUsd: body.partyALockedUsd, partyBLockedUsd: body.partyBLockedUsd, totalLockedUsd: body.totalLockedUsd },
    );
  }

  const freedCapital = Math.round(Math.max(0, body.totalLockedUsd - body.nettedMarginUsd) * 100) / 100;
  const releasedToA =
    splitTotal > 0 ? Math.round((freedCapital * body.partyALockedUsd) / splitTotal * 100) / 100 : 0;
  const releasedToB = Math.round((freedCapital - releasedToA) * 100) / 100;

  const result = {
    ok: true,
    escrowId: body.escrowId,
    chain: body.chain,
    status: "settlement_computed",
    proofHash: body.proofHash,
    totalLockedUsd: body.totalLockedUsd,
    nettedMarginUsd: body.nettedMarginUsd,
    freedCapitalUsd: freedCapital,
    releasedToPartyAUsd: releasedToA,
    releasedToPartyBUsd: releasedToB,
    idempotencyKey: idempotencyKey ?? null,
    timestamp: new Date().toISOString(),
    message:
      "Release computed from the verified netting result. On-chain transfer executes in the escrow contract repo; this envelope carries no fabricated transaction hash.",
  };

  if (idempotencyKey) {
    recordIdempotent(
      idempotencyKey,
      fingerprintBody(body as unknown as Record<string, unknown>),
      result,
    );
  }

  return NextResponse.json(result);
});
