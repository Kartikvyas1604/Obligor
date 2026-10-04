import { NextRequest, NextResponse } from "next/server";
import { solanaPartyA, solanaPartyB } from "@/lib/fixtures";
import { getConfidentialBackend } from "@/lib/confidential";
import { type BackendKind, type PositionBook } from "@/lib/margin";

const SOLANA_NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const SOLANA_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const MONAD_NETWORK = "eip155:10143";
const MONAD_USDC_MINT = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const PAY_TO_WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

export async function POST(req: NextRequest) {
  let body: {
    chain?: "solana" | "monad";
    backend?: BackendKind;
    partyA?: { wallet?: string; legsOverride?: PositionBook["legs"] };
    partyB?: { wallet?: string; legsOverride?: PositionBook["legs"] };
    sessionId?: string;
    demoPayment?: boolean;
  } = {};

  try {
    body = await req.json();
  } catch {
    // defaults if empty
  }

  const chain = body.chain || "solana";
  const backendKind: BackendKind =
    body.backend || (chain === "monad" ? "enclave" : "arcium");

  // Check x402 Payment Signature
  const paymentSig =
    req.headers.get("x-payment-signature") ||
    req.headers.get("payment-signature") ||
    req.headers.get("x-402-payment") ||
    req.headers.get("authorization");

  const hasPaid = Boolean(paymentSig || body.demoPayment);

  const network = chain === "monad" ? MONAD_NETWORK : SOLANA_NETWORK;
  const asset = chain === "monad" ? MONAD_USDC_MINT : SOLANA_USDC_MINT;

  if (!hasPaid) {
    return NextResponse.json(
      {
        error: "PAYMENT-REQUIRED",
        status: 402,
        message: "Two-party confidential clearing quote requires x402 payment.",
        x402: {
          version: "2.0",
          scheme: "exact",
          network,
          asset,
          priceUsd: "0.01",
          baseUnits: "10000",
          payTo: PAY_TO_WALLET,
          facilitator:
            chain === "monad"
              ? "https://x402-facilitator.molandak.org"
              : "https://x402-facilitator.solana.com",
        },
      },
      {
        status: 402,
        headers: {
          "WWW-Authenticate": `x402 scheme="exact", network="${network}", asset="${asset}", price="0.01", payTo="${PAY_TO_WALLET}"`,
          "PAYMENT-REQUIRED": "true",
        },
      },
    );
  }

  // Construct Party A and Party B books
  const bookA: PositionBook = {
    ...solanaPartyA,
    wallet: body.partyA?.wallet || solanaPartyA.wallet,
    chain,
    legs: body.partyA?.legsOverride || solanaPartyA.legs,
  };

  const bookB: PositionBook = {
    ...solanaPartyB,
    wallet: body.partyB?.wallet || solanaPartyB.wallet,
    chain,
    legs: body.partyB?.legsOverride || solanaPartyB.legs,
  };

  // Run confidential backend
  const backendInstance = getConfidentialBackend(backendKind);
  const marginResult = await backendInstance.netTwoParty(bookA, bookB);

  // Compute aggregate-only summary (NO PER-LEG PLAINTEXT EXPOSED)
  const allVenues = Array.from(
    new Set([...bookA.legs.map((l) => l.venue), ...bookB.legs.map((l) => l.venue)]),
  );

  return NextResponse.json({
    sessionId: body.sessionId || `session_${Date.now()}`,
    chain,
    partyAWallet: bookA.wallet,
    partyBWallet: bookB.wallet,
    bookSummary: {
      legCountA: bookA.legs.length,
      legCountB: bookB.legs.length,
      venues: allVenues,
      grossNotionalUsd: marginResult.grossNotionalUsd,
      netExposureUsd: marginResult.netExposureUsd,
    },
    margin: marginResult,
    disclaimer:
      "Two-party confidential clearing demo. Mock equity and simplified bucket haircuts. Not investment advice. Other party's legs omitted by design. Trust model labeled in margin.trustModel.",
  });
}
