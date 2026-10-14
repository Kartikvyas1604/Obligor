/**
 * Seal signature verification (shared, client + server safe).
 *
 * - Solana: ed25519 signature (base58) verified against the party's base58
 *   public key over the seal message bytes. This is exactly what Phantom /
 *   Solflare `signMessage` produce.
 * - EVM (Monad): EIP-191 `personal_sign` — a 65-byte r‖s‖v signature. We
 *   recover the signer address and compare it to the party's 0x wallet.
 *
 * No node builtins: @noble/curves / @noble/hashes only, so the same code runs
 * in the browser and on the server.
 */

import { ed25519 } from "@noble/curves/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { base58Decode } from "./base58";

export { base58Decode, base58Encode } from "./base58";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("hex: odd length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error("hex: invalid character");
    out[i] = byte;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface SealVerifyInput {
  chain: "solana" | "monad";
  /** Party wallet from the session (base58 for solana, 0x… for monad). */
  wallet: string;
  message: string;
  /** Signature from the wallet: base58 (solana) or hex (monad). */
  signature: string;
}

export interface SealVerifyResult {
  valid: boolean;
  reason: string;
}

/** Verify a Solana ed25519 message signature against the party's wallet. */
export function verifySolanaSeal(wallet: string, message: string, signature: string): SealVerifyResult {
  try {
    const pubkey = base58Decode(wallet);
    const sig = base58Decode(signature);
    if (pubkey.length !== 32) return { valid: false, reason: `wallet decodes to ${pubkey.length} bytes, expected 32` };
    if (sig.length !== 64) return { valid: false, reason: `signature decodes to ${sig.length} bytes, expected 64` };
    const ok = ed25519.verify(sig, new TextEncoder().encode(message), pubkey);
    return { valid: ok, reason: ok ? "ed25519 signature verified" : "ed25519 signature does not verify" };
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : "solana seal parse error" };
  }
}

/** Verify an EVM EIP-191 personal_sign signature against the party's address. */
export function verifyEvmSeal(wallet: string, message: string, signature: string): SealVerifyResult {
  try {
    const sig = hexToBytes(signature);
    if (sig.length !== 65) return { valid: false, reason: `signature is ${sig.length} bytes, expected 65` };
    const r = sig.slice(0, 32);
    const s = sig.slice(32, 64);
    let v = sig[64];
    if (v >= 27) v -= 27;
    if (v !== 0 && v !== 1) return { valid: false, reason: `invalid recovery id ${sig[64]}` };

    const msgBytes = new TextEncoder().encode(message);
    const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${msgBytes.length}`);
    const prefixed = new Uint8Array(prefix.length + msgBytes.length);
    prefixed.set(prefix, 0);
    prefixed.set(msgBytes, prefix.length);
    const msgHash = keccak_256(prefixed);

    // noble expects 'recovered' format = recid ‖ r ‖ s.
    const recoveredSig = new Uint8Array(65);
    recoveredSig[0] = v;
    recoveredSig.set(r, 1);
    recoveredSig.set(s, 33);

    // @noble/curves 1.9 exposes `recoverPublicKey` at runtime but omits it from
    // the `CurveFn` type, so reach it through a narrow typed view.
    const recover = secp256k1 as unknown as {
      recoverPublicKey(signature: Uint8Array, message: Uint8Array, opts?: { prehash?: boolean }): Uint8Array;
    };
    const pubCompressed = recover.recoverPublicKey(recoveredSig, msgHash, { prehash: false });
    const pubUncompressed = secp256k1.Point.fromBytes(pubCompressed).toBytes(false);
    const address = "0x" + bytesToHex(keccak_256(pubUncompressed.slice(1)).slice(-20));

    const ok = address.toLowerCase() === wallet.trim().toLowerCase();
    return { valid: ok, reason: ok ? "eip-191 signature recovered to the party address" : `recovered ${address}, expected ${wallet}` };
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : "monad seal parse error" };
  }
}

/** Chain-dispatched seal verification. */
export function verifySeal(input: SealVerifyInput): SealVerifyResult {
  if (input.chain === "monad") return verifyEvmSeal(input.wallet, input.message, input.signature);
  return verifySolanaSeal(input.wallet, input.message, input.signature);
}
