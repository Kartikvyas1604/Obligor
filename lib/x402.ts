/**
 * Shared x402 payment-gate helpers for paid API routes (`/v1/net-margin`,
 * `/v1/net-margin/multi`). One definition of the challenge and the payment
 * gate so Solana and Monad paths can never drift apart.
 *
 * Verification has two layers:
 *  1. Obligor signed-receipt envelope — a base64url JSON payload whose ed25519
 *     signature is verified with `node:crypto`, binding the payer's key to the
 *     exact challenge terms (network/asset/payTo/amount). Replay is blocked via
 *     a one-time nonce claim. This is real cryptography, not a format check.
 *  2. Legacy format check — a well-formed-but-unverified header, accepted ONLY
 *     under the dev escape hatch `X402_ACCEPT_UNVERIFIED_SIGNATURES`.
 *
 * NOTE: the envelope is Obligor's own wire format, NOT the Coinbase x402
 * "exact" on-chain scheme (which carries a base64 partially-signed Solana
 * transaction and needs the `@x402` SDK to verify). Interop is tracked as a
 * follow-up; the on-chain facilitator path is advertised separately.
 */

import {
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";
import { env } from "./env";
import type { Chain } from "./env";
import { markOnce } from "./idempotency";

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

// ---------------------------------------------------------------------------
// Obligor signed-receipt envelope — ed25519 over the exact challenge terms.
// ---------------------------------------------------------------------------

export interface ObligorReceipt {
  v: "1";
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  nonce: string;
  signer: string; // base64url ed25519 public key (32 bytes)
  sig: string; // base64url ed25519 signature (64 bytes)
}

/** DER prefix for a raw 32-byte ed25519 public key (RFC 8410 SPKI). */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Canonical message a payer signs. Field order is fixed and versioned. */
export function receiptMessage(
  r: Pick<ObligorReceipt, "v" | "scheme" | "network" | "asset" | "payTo" | "amount" | "nonce">,
): string {
  return [r.v, r.scheme, r.network, r.asset, r.payTo, r.amount, r.nonce].join("|");
}

export function encodeReceipt(r: ObligorReceipt): string {
  return Buffer.from(JSON.stringify(r)).toString("base64url");
}

export interface PayerKey {
  /** base64url raw ed25519 public key (what a verifier sees as `signer`). */
  signer: string;
  privateKey: KeyObject;
}

/** Generate a fresh ephemeral ed25519 payer key (demo agents, CLIs). */
export function generatePayerKey(): PayerKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const rawPub = der.subarray(ED25519_SPKI_PREFIX.length);
  return { signer: Buffer.from(rawPub).toString("base64url"), privateKey };
}

/**
 * Sign the exact challenge terms with a payer key and return the
 * `x-payment-signature` header value. This is real ed25519 — the same receipt
 * the server verifies, no format-check shortcut.
 */
export function signObligorReceipt(
  challenge: { scheme: string; network: string; asset: string; payTo: string; baseUnits: string },
  key: PayerKey,
  amount?: string,
): string {
  const receipt = {
    v: "1" as const,
    scheme: challenge.scheme,
    network: challenge.network,
    asset: challenge.asset,
    payTo: challenge.payTo,
    amount: amount ?? challenge.baseUnits,
    nonce: `nonce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
  };
  const sig = cryptoSign(null, Buffer.from(receiptMessage(receipt), "utf8"), key.privateKey);
  const full: ObligorReceipt = {
    ...receipt,
    signer: key.signer,
    sig: Buffer.from(sig).toString("base64url"),
  };
  return encodeReceipt(full);
}

function decodeReceipt(header: string): ObligorReceipt | null {
  try {
    const obj = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as Record<string, unknown>;
    const fields = ["v", "scheme", "network", "asset", "payTo", "amount", "nonce", "signer", "sig"] as const;
    for (const f of fields) {
      if (typeof obj[f] !== "string" || (obj[f] as string).length === 0) return null;
    }
    return obj as unknown as ObligorReceipt;
  } catch {
    return null;
  }
}

export interface ReceiptVerification {
  ok: boolean;
  reason?:
    | "malformed"
    | "unsupported_version"
    | "network_mismatch"
    | "asset_mismatch"
    | "payTo_mismatch"
    | "bad_amount"
    | "insufficient_amount"
    | "bad_encoding"
    | "bad_signature";
  nonce?: string;
}

/**
 * Verify an Obligor signed receipt against the active challenge. Binds the
 * payer's ed25519 key to network/asset/payTo/amount and rejects tampering.
 * Returns `{ ok:false, reason:"malformed" }` only when the payload is not our
 * envelope at all (so legacy/demo callers can still be handled by the caller).
 */
export function verifyObligorReceipt(
  header: string,
  challenge: PaymentChallenge,
): ReceiptVerification {
  const r = decodeReceipt(header);
  if (!r) return { ok: false, reason: "malformed" };
  if (r.v !== "1" || r.scheme !== challenge.scheme) return { ok: false, reason: "unsupported_version" };
  if (r.network !== challenge.network) return { ok: false, reason: "network_mismatch" };
  if (r.asset !== challenge.asset) return { ok: false, reason: "asset_mismatch" };
  if (r.payTo !== challenge.payTo) return { ok: false, reason: "payTo_mismatch" };

  let paid: bigint;
  try {
    paid = BigInt(r.amount);
  } catch {
    return { ok: false, reason: "bad_amount" };
  }
  if (paid < BigInt(0)) return { ok: false, reason: "bad_amount" };
  let required = BigInt(0);
  try {
    required = BigInt(challenge.baseUnits);
  } catch {
    required = BigInt(0);
  }
  if (paid < required) return { ok: false, reason: "insufficient_amount" };

  let pub: Buffer;
  let sig: Buffer;
  try {
    pub = Buffer.from(r.signer, "base64url");
    sig = Buffer.from(r.sig, "base64url");
  } catch {
    return { ok: false, reason: "bad_encoding" };
  }
  if (pub.length !== 32 || sig.length !== 64) return { ok: false, reason: "bad_encoding" };

  let key;
  try {
    key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, pub]),
      format: "der",
      type: "spki",
    });
  } catch {
    return { ok: false, reason: "bad_encoding" };
  }

  const ok = cryptoVerify(null, Buffer.from(receiptMessage(r), "utf8"), key, sig);
  if (!ok) return { ok: false, reason: "bad_signature" };
  return { ok: true, nonce: r.nonce };
}

/**
 * Payment gate.
 *
 * Order of trust:
 *  1. demo escape hatch (X402... no — DEMO_ALLOW_UNPAID) — labeled demo.
 *  2. Obligor signed-receipt envelope, cryptographically verified: a valid
 *     signature over the exact challenge terms with a fresh nonce.
 *  3. if a receipt is present but is OUR envelope and fails verification →
 *     FAIL CLOSED (a forged/tampered receipt can never fall through to the
 *     format check).
 *  4. legacy format check, only under the explicit escape hatch.
 */
export function isPaid(
  paymentSignature: string | null,
  demoPayment: boolean,
  chain?: Chain,
): boolean {
  const viaDemo = Boolean(demoPayment) && env.demo.allowUnpaid;
  if (viaDemo) return true;

  if (typeof paymentSignature !== "string" || paymentSignature.length === 0) {
    return false;
  }

  if (chain) {
    const requirement = paymentRequired(chain);
    if (requirement.configured) {
      const result = verifyObligorReceipt(paymentSignature, requirement.challenge);
      if (result.ok) {
        // One-time nonce claim — a replayed receipt is rejected.
        if (result.nonce && !markOnce(`x402:${result.nonce}`)) return false;
        return true;
      }
      // A receipt that decodes as our envelope but fails crypto is rejected
      // outright — never let the escape hatch launder a bad signature.
      if (result.reason !== "malformed") return false;
      if (env.x402.requireVerifiedSignatures) return false;
    }
  }

  const wellFormed = paymentSignature.length >= 16 && paymentSignature.length <= 4096;
  return wellFormed && env.x402.acceptUnverifiedSignatures;
}