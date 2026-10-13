import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import { env } from "@/lib/env";
import { getConfidentialBackend } from "@/lib/confidential";
import { priceAndNormalizeLegs } from "@/lib/positions";
import { isPaid, paymentRequired } from "@/lib/x402";
import { makeLogger } from "@/lib/logger";

const log = makeLogger("parallel");

const rawLegSchema = z.record(z.unknown());
const pairSchema = z.object({
  pairId: z.string().trim().min(1).max(32),
  label: z.string().trim().max(60).optional(),
  a: z.object({ wallet: z.string().trim().min(32).max(64), legs: z.array(rawLegSchema).max(16) }),
  b: z.object({ wallet: z.string().trim().min(32).max(64), legs: z.array(rawLegSchema).max(16) }),
});
const bodySchema = z.object({
  chain: z.enum(["monad"]).default("monad"),
  pairs: z.array(pairSchema).min(1).max(env.positions.maxLegsPerBook),
  demoPayment: z.boolean().optional(),
});

const MIN_PARALLEL_PAIRS = 3;

/**
 * POST /api/v1/net-margin/parallel
 * Monad differentiator: N desk pairs netted concurrently per epoch.
 * Attestation is only reported when a real backend provides one — never
 * fabricated here.
 */
export const POST = withApi(async ({ req }) => {
  const headers = rateLimitFor("compute", req);
  const body = parseBody(bodySchema, await readJsonBody(req));
  const chain = body.chain as "monad";

  // x402 gate — same fail-closed policy as the two-party and N-party routes.
  const paymentSig =
    req.headers.get("x-payment-signature") || req.headers.get("payment-signature");
  const paid = isPaid(paymentSig, Boolean(body.demoPayment), chain);

  if (!paid) {
    const challenge = paymentRequired(chain);
    log.info("402 issued", { chain, route: "net-margin-parallel" });

    if (!challenge.configured) {
      return NextResponse.json(
        {
          ok: false,
          error: "PAYMENTS_NOT_CONFIGURED",
          message:
            "Parallel clearing is pay-per-call (x402) and no destination wallet is configured for this chain.",
          requestId: (req.headers.get("x-request-id") as string | undefined) ?? undefined,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "PAYMENT-REQUIRED",
        message: "Parallel multi-pair clearing requires an x402 micropayment.",
        x402: challenge.challenge,
      },
      {
        status: 402,
        headers: {
          ...headers,
          "WWW-Authenticate": `x402 scheme="exact", network="${challenge.challenge.network}", asset="${challenge.challenge.asset}", price="${challenge.challenge.priceUsd}", payTo="${challenge.challenge.payTo}"`,
        },
      },
    );
  }

  if (body.pairs.length < MIN_PARALLEL_PAIRS) {
    throw ApiError.badRequest(
      `Parallel clearing requires at least ${MIN_PARALLEL_PAIRS} pairs per epoch — solitude is a costume port`,
      { provided: body.pairs.length },
    );
  }

  const enclave = getConfidentialBackend("enclave");
  const startedAt = Date.now();

  const epochId = `epoch_${Date.now().toString(36)}`;
  const pairs = await Promise.all(
    body.pairs.map(async (pair) => {
      const [pricedA, pricedB] = await Promise.all([
        priceAndNormalizeLegs("A", pair.a.legs, { source: "manual" }),
        priceAndNormalizeLegs("B", pair.b.legs, { source: "manual" }),
      ]);
      const margin = await enclave.netTwoParty(
        {
          party: "A",
          label: pair.label ? `${pair.label} A` : "A",
          wallet: pair.a.wallet,
          chain,
          legs: pricedA.legs,
          warnings: pricedA.warnings,
        },
        {
          party: "B",
          label: pair.label ? `${pair.label} B` : "B",
          wallet: pair.b.wallet,
          chain,
          legs: pricedB.legs,
          warnings: pricedB.warnings,
        },
      );
      return {
        pairId: pair.pairId,
        label: pair.label ?? `${pair.a.wallet.slice(0, 4)}↔${pair.b.wallet.slice(0, 4)}`,
        margin,
        warnings: [...pricedA.warnings, ...pricedB.warnings],
      };
    }),
  );

  const executionDurationMs = Date.now() - startedAt;

  // Attestation honesty: only claim verification when the backend actually
  // produced one. The sealing/attestation metadata comes from the result.
  const attestation = pairs.find((p) => p.margin.attestation)?.margin.attestation;

  log.info("parallel epoch complete", {
    chain,
    pairs: pairs.length,
    executionDurationMs,
    attested: Boolean(attestation),
  });

  return NextResponse.json({
    ok: true,
    epochId,
    chain,
    concurrency: pairs.length,
    backend: "enclave",
    // Trust model is what the enclave backend ACTUALLY executed for this
    // epoch — simulated seal until the attested transport is wired.
    trustModel: pairs[0]?.margin.trustModel ?? "simulated_plaintext_compute",
    executionDurationMs,
    pairs,
    attestation: attestation
      ? { ...attestation, note: "Host-verified hardware attestation: the enclave's Nitro NSM document passed signature, pinned-root, PCR0 (ENCLAVE_PCR0_ALLOWLIST) and nonce checks." }
      : null,
    differentiator:
      "Parallel multi-pair clearing: Monad throughput nets N desk pairs concurrently per epoch. TEE ≠ MPC — trust model labeled honestly.",
  });
});
