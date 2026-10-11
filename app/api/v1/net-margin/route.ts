import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import { chainSchema } from "@/lib/env";
import { isPaid, paymentRequired } from "@/lib/x402";
import { getConfidentialBackend } from "@/lib/confidential";
import { priceAndNormalizeLegsWithVenueCheck as priceAndNormalizeLegs } from "@/lib/positions";
import { makeLogger } from "@/lib/logger";
import { computeCommitmentHash, hashLegs } from "@/lib/commitment";
import { registerComputation } from "@/lib/computation-registry";
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
  const paid = isPaid(paymentSig, Boolean(body.demoPayment));

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

  // Verifiable output: register the commitment. Only one-way hashes are
  // stored — never legs — so /net-margin/verify can prove registration from
  // a party's OWN inputs without ever reading the counterparty's book.
  let commitmentHash: string | null = null;
  if (marginResult.computationId) {
    const partyLegHashes = { A: hashLegs(legsA), B: hashLegs(legsB) };
    commitmentHash = computeCommitmentHash({
      partyLegHashes,
      computationId: marginResult.computationId,
      backendKind,
    });
    registerComputation({
      computationId: marginResult.computationId,
      chain: chainL,
      backendKind,
      commitmentHash,
      partyLegHashes,
      combinedNettedUsd: marginResult.nettedCombinedUsd,
      grossNotionalUsd: marginResult.grossNotionalUsd,
      perPartySiloedUsd: { A: marginResult.siloedAUsd, B: marginResult.siloedBUsd },
      createdAt: Date.now(),
    });
  }

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
    committed: Boolean(commitmentHash),
  });

  return NextResponse.json({
    ok: true,
    sessionId: body.sessionId || `session_${Date.now().toString(36)}`,
    chain: chainL,
    partyAWallet: bookA.wallet,
    partyBWallet: bookB.wallet,
    warnings: [...warnA, ...warnB],
    ...(commitmentHash ? { commitmentHash } : {}),
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
