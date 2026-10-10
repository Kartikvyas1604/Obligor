import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import { env, chainSchema } from "@/lib/env";
import { getConfidentialBackend } from "@/lib/confidential";
import { priceAndNormalizeLegs } from "@/lib/positions";
import { makeLogger } from "@/lib/logger";
import type { BackendKind } from "@/lib/margin";

const log = makeLogger("net-margin");

const rawLegSchema = z.record(z.unknown());
const backendSchema = z.enum(["arcium", "enclave", "simulated"]);

const bodySchema = z.object({
  chain: chainSchema.default("solana"),
  backend: backendSchema.optional(),
  sessionId: z.string().trim().max(64).optional(),
  partyA: z.object({
    wallet: z.string().trim().min(32).max(64),
    legs: z.array(rawLegSchema).max(32).optional(),
  }),
  partyB: z.object({
    wallet: z.string().trim().min(32).max(64).optional(),
    legs: z.array(rawLegSchema).max(32).optional(),
  }),
  demoPayment: z.boolean().optional(),
});

/** Build the 402 challenge from env-configured payment terms. */
function paymentRequired(chain: "solana" | "monad") {
  const network =
    chain === "monad" ? env.x402.monadNetwork : env.x402.solanaNetwork;
  const asset =
    chain === "monad" ? env.x402.monadAssetMint : env.x402.solanaAssetMint;
  const payTo = chain === "monad" ? env.x402.monadPayTo : env.x402.solanaPayTo;

  if (!payTo) {
    return {
      configured: false as const,
    };
  }

  const facilitator =
    chain === "monad" ? env.x402.facilitatorUrlMonad : env.x402.facilitatorUrlSolana;

  return {
    configured: true as const,
    challenge: {
      version: "2.0",
      scheme: "exact",
      network,
      asset,
      priceUsd: env.x402.priceUsd.toFixed(2),
      baseUnits: env.x402.baseUnits,
      payTo,
      ...(facilitator ? { facilitator } : {}),
    },
  };
}

function verifyPaymentSignature(header: string | null): boolean {
  if (!header) return false;
  // Placeholder verifier: real x402 facilitator verification lands with the
  // @x402 SDK wiring. Format-checked length only; flags failures for watch.
  return header.length >= 16 && header.length <= 4096;
}

export const POST = withApi(async ({ req }) => {
  const headers = rateLimitFor("compute", req);
  const bodyRaw = await readJsonBody(req);
  const body = parseBody(bodySchema, bodyRaw);

  const chain = body.chain;
  const backendKind: BackendKind = body.backend ?? (chain === "monad" ? "enclave" : "arcium");

  // x402 enforcement. Receipts are cryptographically verified once the @x402
  // SDK wiring lands; until then the verifier is a format check that runs
  // ONLY under the explicit X402_ACCEPT_UNVERIFIED_SIGNATURES escape hatch.
  // In production this fails closed: a guessed header can never clear payment.
  const paymentSig =
    req.headers.get("x-payment-signature") || req.headers.get("payment-signature");
  const paid =
    (Boolean(paymentSig) &&
      env.x402.acceptUnverifiedSignatures &&
      verifyPaymentSignature(paymentSig)) ||
    (Boolean(body.demoPayment) && env.demo.allowUnpaid);

  // After schema parsing `chain` is fully resolved; the zod input type lanes
  // it as optional — reassert for the call sites below.
  const chainL = chain as "solana" | "monad";

  if (!paid) {
    const challenge = paymentRequired(chainL);
    log.info("402 issued", { chain, backend: backendKind });

    if (!challenge.configured) {
      return NextResponse.json(
        {
          ok: false,
          error: "PAYMENTS_NOT_CONFIGURED",
          message:
            "Clearing is pay-per-call (x402) and no destination wallet is configured for this chain. This is a server configuration gap, not a rate limit.",
          requestId:
            (req.headers.get("x-request-id") as string | undefined) ?? undefined,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "PAYMENT-REQUIRED",
        message: "Two-party confidential clearing requires an x402 micropayment.",
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

  if (!body.partyA.legs || body.partyA.legs.length === 0) {
    throw ApiError.badRequest("partyA.legs is required — Obligor never invents positions");
  }

  // Validate + oracle-price both books; each desk's raw marks are corrected
  // against live Pyth marks with deviations flagged in warnings.
  const pricedA = await priceAndNormalizeLegs("A", body.partyA.legs ?? [], { source: "manual" });
  const pricedB = await priceAndNormalizeLegs("B", body.partyB.legs ?? [], { source: "manual" });
  const legsA = pricedA.legs;
  const legsB = pricedB.legs;
  const warnA = pricedA.warnings;
  const warnB = pricedB.warnings;

  const walletA = body.partyA.wallet;
  const walletB = body.partyB.wallet ?? "counterparty-unmapped";

  const bookA = {
    party: "A" as const,
    label: "Party A",
    wallet: walletA,
    chain: chainL,
    legs: legsA,
    warnings: warnA,
  };
  const bookB = {
    party: "B" as const,
    label: "Party B",
    wallet: walletB,
    chain: chainL,
    legs: legsB,
    warnings: warnB,
  };

  const backend = getConfidentialBackend(backendKind);
  const marginResult = await backend.netTwoParty(bookA, bookB);

  // Aggregate-only summary (privacy invariant: never echo per-leg plaintext).
  const venues = Array.from(
    new Set([...bookA.legs.map((l) => l.venue), ...bookB.legs.map((l) => l.venue)]),
  );

  log.info("net-margin computed", {
    chain,
    backend: backendKind,
    legsA: legsA.length,
    legsB: legsB.length,
    savingsUsd: marginResult.savingsUsd,
  });

  return NextResponse.json({
    ok: true,
    sessionId: body.sessionId || `session_${Date.now().toString(36)}`,
    chain: chainL,
    partyAWallet: bookA.wallet,
    partyBWallet: bookB.wallet,
    warnings: [...warnA, ...warnB],
    bookSummary: {
      legCountA: bookA.legs.length,
      legCountB: bookB.legs.length,
      venues,
      grossNotionalUsd: marginResult.grossNotionalUsd,
      netExposureUsd: marginResult.netExposureUsd,
    },
    margin: marginResult,
    disclaimer:
      "Confidential two-party clearing. Simplified bucket-haircut economics. Not investment advice, not a securities product. Other party's legs omitted by design. Trust model labeled in margin.trustModel.",
  });
});
