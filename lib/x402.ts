/**
 * Shared x402 payment-gate helpers for paid API routes (`/v1/net-margin`,
 * `/v1/net-margin/multi`). One definition of the challenge and the payment
 * gate so Solana and Monad paths can never drift apart.
 */

import { env } from "./env";
import type { Chain } from "./env";

export interface PaymentChallenge {
  version: "2.0";
  scheme: "exact";
  network: string;
  asset: string;
  priceUsd: string;
  baseUnits: string;
  payTo: string;
  facilitator?: string;
}

export type PaymentRequirement =
  | { configured: false }
  | { configured: true; challenge: PaymentChallenge };

/** Build the exact-scheme x402 challenge for a chain from env configuration. */
export function paymentRequired(chain: Chain): PaymentRequirement {
  const network = chain === "monad" ? env.x402.monadNetwork : env.x402.solanaNetwork;
  const asset = chain === "monad" ? env.x402.monadAssetMint : env.x402.solanaAssetMint;
  const payTo = chain === "monad" ? env.x402.monadPayTo : env.x402.solanaPayTo;

  // Monad x402 is explicitly disabled until X402_MONAD_ENABLED=true after the
  // facilitator probe passes — MONAD_PAY_TO alone never enables payments.
  const chainEnabled = chain === "monad" ? env.x402.monadEnabled : Boolean(payTo);

  if (!chainEnabled || !payTo) {
    return { configured: false };
  }

  const facilitator = chain === "monad" ? env.x402.facilitatorUrlMonad : env.x402.facilitatorUrlSolana;

  return {
    configured: true,
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

/**
 * Payment gate: a well-formed receipt header OR the demo escape hatch.
 * Receipts are cryptographically verified once the @x402 SDK wiring lands;
 * until then the verifier is a format check that runs ONLY under the
 * explicit X402_ACCEPT_UNVERIFIED_SIGNATURES escape hatch. In production this
 * fails closed — a guessed header can never clear payment.
 */
export function isPaid(paymentSignature: string | null, demoPayment: boolean): boolean {
  const wellFormed =
    typeof paymentSignature === "string" &&
    paymentSignature.length >= 16 &&
    paymentSignature.length <= 4096;
  const viaReceipt = wellFormed && env.x402.acceptUnverifiedSignatures;
  const viaDemo = Boolean(demoPayment) && env.demo.allowUnpaid;
  return viaReceipt || viaDemo;
}