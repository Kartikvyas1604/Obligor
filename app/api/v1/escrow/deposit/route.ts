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
  partyA: z.string().trim().min(32).max(64),
  partyB: z.string().trim().min(32).max(64),
  amountAUsd: z.number().positive().max(50_000_000),
  amountBUsd: z.number().positive().max(50_000_000),
  /** Attested netting computation the escrow release will be conditioned on. */
  computationId: z.string().trim().min(4).max(96).optional(),
});

/**
 * POST /api/v1/escrow/deposit
 * Records a bilateral escrow deposit intent. In this deployment the escrow
 * contract repo (contracts/) performs the real lock; this route records and
 * returns the split — it never fabricates a settlement outcome.
 */
export const POST = withApi<Record<string, never>>(async ({ req }) => {
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
        note: "This escrow intent was already recorded — returning the original result (Idempotency-Key replay).",
      });
    }
  }

  const totalLocked = Math.round((body.amountAUsd + body.amountBUsd) * 100) / 100;

  const result = {
    ok: true,
    escrowId: body.escrowId,
    chain: body.chain,
    status: "deposit_recorded",
    partyA: body.partyA,
    partyB: body.partyB,
    lockedAUsd: body.amountAUsd,
    lockedBUsd: body.amountBUsd,
    totalLockedUsd: totalLocked,
    computationId: body.computationId ?? null,
    idempotencyKey: idempotencyKey ?? null,
    timestamp: new Date().toISOString(),
    message:
      "Deposit intent recorded. On-chain lock executes in the escrow contract; settlement requires a verified netting proof.",
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
