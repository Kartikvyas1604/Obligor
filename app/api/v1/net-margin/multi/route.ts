import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import { env, chainSchema } from "@/lib/env";
import { isPaid, paymentRequired } from "@/lib/x402";
import { priceAndNormalizeLegs } from "@/lib/positions";
import { rawLegSchema } from "@/lib/contracts";
import { nPartyNetted, type ChainId } from "@/lib/margin";
import { makeLogger } from "@/lib/logger";
import { computeCommitmentHash, hashLegs } from "@/lib/commitment";
import { registerComputation } from "@/lib/computation-registry";

const log = makeLogger("net-margin-multi");

const partySchema = z.object({
  party: z.enum(["A", "B", "C"]),
  wallet: z.string().trim().min(1).max(64),
  legs: z.array(rawLegSchema).min(1).max(env.positions.maxLegsPerBook),
});

const bodySchema = z.object({
  chain: chainSchema,
  venue: z.enum(["crypto"]).optional(),
  parties: z.array(partySchema).min(2).max(4),
  demoPayment: z.boolean().optional(),
});

/**
 * POST /api/v1/net-margin/multi
 * N-party netting (J3): union every desk's legs, net within each risk bucket,
 * apply the max bucket haircut — the exact economics of the two-party sketch,
 * just with N books instead of 2. Output is aggregate-only: per-party siloed
 * margin and the combined netted figure; no per-leg plaintext is returned.
 */
export const POST = withApi(async ({ req }) => {
  const headers = rateLimitFor("compute", req);
  const bodyRaw = await readJsonBody(req);
  const body = parseBody(bodySchema, bodyRaw);

  const chain = body.chain as ChainId;
  const chainL = body.chain;

  // x402 gate — same challenge construction and fail-closed policy as the
  // two-party route. Receipts verify only under the escape hatch; production
  // fails closed.
  const paymentSig =
    req.headers.get("x-payment-signature") || req.headers.get("payment-signature");
  const paid = isPaid(paymentSig, Boolean(body.demoPayment));

  if (!paid) {
    const challenge = paymentRequired(chainL);
    log.info("402 issued", { chain, route: "net-margin-multi" });

    if (!challenge.configured) {
      return NextResponse.json(
        {
          ok: false,
          error: "PAYMENTS_NOT_CONFIGURED",
          message:
            "Clearing is pay-per-call (x402) and no destination wallet is configured for this chain.",
          requestId: (req.headers.get("x-request-id") as string | undefined) ?? undefined,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "PAYMENT-REQUIRED",
        message: "N-party confidential clearing requires an x402 micropayment.",
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

  const books = [];
  const partyLegHashes: Record<string, string> = {};
  const warnings: string[] = [];

  for (const p of body.parties) {
    // `party` carries no economic content (it's re-assigned from the envelope);
    // strip it so each desk's legs validate against the shared raw schema.
    const raw = p.legs.map((l) => {
      const copy = { ...l };
      delete (copy as { party?: unknown }).party;
      return copy;
    });
    const priced = await priceAndNormalizeLegs(p.party, raw, { source: "manual" });
    warnings.push(...priced.warnings.map((w) => `[${p.party}] ${w}`));

    if (priced.legs.length === 0) {
      throw ApiError.badRequest(
        `party ${p.party} contributed no valid legs — Obligor never invents positions`,
      );
    }

    books.push({
      party: p.party,
      label: `Desk ${p.party}`,
      wallet: p.wallet,
      chain: chainL,
      legs: priced.legs,
      warnings: priced.warnings,
    });
    partyLegHashes[p.party] = hashLegs(priced.legs);
  }

  const marginResult = nPartyNetted(books);
  const computationId = `multi_${randomBytes(4).toString("hex")}_${Date.now().toString(36)}`;
  const commitmentHash = computeCommitmentHash({
    partyLegHashes,
    computationId,
    backendKind: "simulated",
  });

  registerComputation({
    computationId,
    chain: chainL,
    backendKind: "simulated",
    commitmentHash,
    partyLegHashes,
    combinedNettedUsd: marginResult.nettedCombinedUsd,
    grossNotionalUsd: marginResult.grossNotionalUsd,
    perPartySiloedUsd: marginResult.perPartySiloedUsd ?? {},
    createdAt: Date.now(),
  });

  log.info("n-party netting computed", {
    chain,
    parties: body.parties.length,
    combinedSiloed: marginResult.siloedCombinedUsd,
    combinedNetted: marginResult.nettedCombinedUsd,
    savings: marginResult.savingsUsd,
  });

  return NextResponse.json({
    ok: true,
    chain: chainL,
    computationId,
    commitmentHash,
    parties: books.map((b) => ({
      party: b.party,
      legCount: b.legs.length,
      warnings: b.warnings,
    })),
    margin: marginResult,
    warnings,
    trustModel: "simulated",
    attestation: null,
    disclaimer:
      "N-party netting demo. Simplified bucket-haircut economics. Per-leg plaintext omitted by design — only aggregate figures are returned.",
  });
});