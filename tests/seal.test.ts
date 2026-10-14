/**
 * Deal-seal cryptography: canonical message construction and real signature
 * verification for both Solana (ed25519 message signature) and Monad/EVM
 * (EIP-191 personal_sign), plus the base58 codec used to transport them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ed25519 } from "@noble/curves/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { legsCommitment, sealMessage, SEAL_MESSAGE_PREFIX } from "../lib/seal";
import {
  base58Decode,
  base58Encode,
  verifyEvmSeal,
  verifySeal,
  verifySolanaSeal,
} from "../lib/seal-verify";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

test("base58 round-trips arbitrary bytes", () => {
  for (let len = 1; len < 40; len++) {
    const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + len) % 256);
    assert.deepEqual(base58Decode(base58Encode(bytes)), bytes);
  }
});

test("base58 matches known vectors", () => {
  assert.equal(base58Encode(new Uint8Array([0])), "1");
  assert.equal(base58Encode(new Uint8Array([0, 0, 1])), "112");
  assert.deepEqual(base58Decode("1"), new Uint8Array([0]));
});

test("legsCommitment is deterministic and sensitive to leg changes", () => {
  const legs = [
    { venue: "drift", instrument: "SOL-PERP", bucket: "SOL", side: "long", party: "A", qty: 10, notionalUsd: 1500, markUsd: 150, haircut: 0.2, signedExposureUsd: 1500 },
  ];
  const a = legsCommitment(legs);
  const b = legsCommitment([...legs]);
  assert.equal(a, b);
  assert.match(a, /^sha256:[0-9a-f]{64}$/);
  const changed = legsCommitment([{ ...legs[0], qty: 11 }]);
  assert.notEqual(a, changed);
});

test("sealMessage is the canonical v1 layout", () => {
  const msg = sealMessage({ sessionId: "0xabc", partyId: "B", chain: "monad", book: "sha256:dead" });
  assert.equal(
    msg,
    [SEAL_MESSAGE_PREFIX, "session:0xabc", "party:B", "chain:monad", "book:sha256:dead"].join("\n"),
  );
});

// --- Solana (ed25519) -------------------------------------------------------

test("verifySolanaSeal accepts a real ed25519 message signature", () => {
  const priv = new Uint8Array(32).fill(9);
  const pub = ed25519.getPublicKey(priv);
  const message = sealMessage({ sessionId: "0x1", partyId: "A", chain: "solana", book: "sha256:aa" });
  const sig = ed25519.sign(new TextEncoder().encode(message), priv);
  const res = verifySolanaSeal(base58Encode(pub), message, base58Encode(sig));
  assert.equal(res.valid, true);
});

test("verifySolanaSeal rejects a tampered message or wrong wallet", () => {
  const priv = new Uint8Array(32).fill(9);
  const pub = ed25519.getPublicKey(priv);
  const message = sealMessage({ sessionId: "0x1", partyId: "A", chain: "solana", book: "sha256:aa" });
  const sig = ed25519.sign(new TextEncoder().encode(message), priv);
  assert.equal(verifySolanaSeal(base58Encode(pub), message + "x", base58Encode(sig)).valid, false);
  const otherPub = ed25519.getPublicKey(new Uint8Array(32).fill(3));
  assert.equal(verifySolanaSeal(base58Encode(otherPub), message, base58Encode(sig)).valid, false);
});

// --- Monad / EVM (EIP-191) --------------------------------------------------

function evmSign(priv: Uint8Array, message: string): { address: string; signature: string } {
  const pub = secp256k1.getPublicKey(priv, false);
  const address = "0x" + bytesToHex(keccak_256(pub.slice(1)).slice(-20));
  const msgBytes = new TextEncoder().encode(message);
  const prefixed = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${msgBytes.length}`);
  const combined = new Uint8Array(prefixed.length + msgBytes.length);
  combined.set(prefixed, 0);
  combined.set(msgBytes, prefixed.length);
  const hash = keccak_256(combined);
  const rs = secp256k1.sign(hash, priv, { prehash: false, lowS: true });
  const compact = rs.toBytes("compact");
  const v = 27 + rs.recovery;
  const sig = new Uint8Array(65);
  sig.set(compact, 0);
  sig[64] = v;
  return { address, signature: "0x" + bytesToHex(sig) };
}

test("verifyEvmSeal recovers the signer address for EIP-191", () => {
  const priv = secp256k1.utils.randomPrivateKey();
  const message = sealMessage({ sessionId: "0x2", partyId: "B", chain: "monad", book: "sha256:bb" });
  const { address, signature } = evmSign(priv, message);
  assert.equal(verifyEvmSeal(address, message, signature).valid, true);
});

test("verifyEvmSeal rejects a wrong wallet or changed message", () => {
  const priv = secp256k1.utils.randomPrivateKey();
  const message = sealMessage({ sessionId: "0x2", partyId: "B", chain: "monad", book: "sha256:bb" });
  const { signature } = evmSign(priv, message);
  const other = "0x" + "ab".repeat(20);
  assert.equal(verifyEvmSeal(other, message, signature).valid, false);
  const { address } = evmSign(priv, message);
  assert.equal(verifyEvmSeal(address, message + "x", signature).valid, false);
});

test("verifySeal dispatches by chain", () => {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = ed25519.getPublicKey(priv);
  const message = sealMessage({ sessionId: "0x3", partyId: "A", chain: "solana", book: "sha256:cc" });
  const sig = ed25519.sign(new TextEncoder().encode(message), priv);
  assert.equal(verifySeal({ chain: "solana", wallet: base58Encode(pub), message, signature: base58Encode(sig) }).valid, true);
  assert.equal(verifySeal({ chain: "monad", wallet: base58Encode(pub), message, signature: base58Encode(sig) }).valid, false);
});
