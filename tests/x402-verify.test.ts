import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";

// Configure a paid Solana chain BEFORE the env singleton loads, and disable the
// format-check escape hatch so every assertion exercises real verification.
process.env.SOLANA_PAY_TO = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
process.env.X402_ACCEPT_UNVERIFIED_SIGNATURES = "false";
process.env.X402_REQUIRE_VERIFIED_SIGNATURES = "true";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const rawPub = publicKey.export({ type: "spki", format: "der" }).subarray(12); // strip DER prefix

function makeReceipt(overrides: Partial<Record<string, string>> = {}) {
  const base = {
    v: "1",
    scheme: "exact",
    network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    payTo: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    amount: "10000",
    nonce: `nonce-${Math.random().toString(36).slice(2)}-${Date.now()}`,
  };
  return { ...base, ...overrides };
}

test("x402 signed receipts: real ed25519 verification, fail-closed", async () => {
  const mod = await import("../lib/x402");
  const { receiptMessage, encodeReceipt, verifyObligorReceipt, paymentRequired, isPaid } = mod;

  const challenge = paymentRequired("solana");
  assert.equal(challenge.configured, true);
  if (!challenge.configured) return;

  const signReceipt = (r: ReturnType<typeof makeReceipt>) => {
    const sig = cryptoSign(null, Buffer.from(receiptMessage(r as never), "utf8"), privateKey);
    return encodeReceipt({
      ...r,
      signer: Buffer.from(rawPub).toString("base64url"),
      sig: Buffer.from(sig).toString("base64url"),
    } as never);
  };

  // 1) valid receipt → verified + paid.
  const good = makeReceipt();
  const goodHeader = signReceipt(good);
  assert.equal(verifyObligorReceipt(goodHeader, challenge.challenge).ok, true);
  assert.equal(isPaid(goodHeader, false, "solana"), true);

  // 2) replaying the same nonce is rejected.
  assert.equal(isPaid(goodHeader, false, "solana"), false);

  // 3) tampered payload (mutate JSON, keep original signature) → bad_signature.
  const decoded = JSON.parse(Buffer.from(goodHeader, "base64url").toString("utf8")) as Record<
    string,
    string
  >;
  decoded.amount = "999999";
  const tamperedHeader = Buffer.from(JSON.stringify(decoded)).toString("base64url");
  assert.equal(verifyObligorReceipt(tamperedHeader, challenge.challenge).reason, "bad_signature");
  assert.equal(isPaid(tamperedHeader, false, "solana"), false);

  // 4) wrong payTo → rejected.
  const wrongPayTo = makeReceipt({ payTo: "11111111111111111111111111111111" });
  assert.equal(
    verifyObligorReceipt(signReceipt(wrongPayTo), challenge.challenge).reason,
    "payTo_mismatch",
  );

  // 5) amount below price → rejected.
  const cheap = makeReceipt({ amount: "1" });
  assert.equal(
    verifyObligorReceipt(signReceipt(cheap), challenge.challenge).reason,
    "insufficient_amount",
  );

  // 6) non-envelope header with the escape hatch OFF → not paid.
  assert.equal(verifyObligorReceipt("x402_sig_sol_1234567890", challenge.challenge).reason, "malformed");
  assert.equal(isPaid("x402_sig_sol_1234567890", false, "solana"), false);

  // 7) forged signature bytes → bad_signature.
  const forged = makeReceipt();
  const forgedHeader = encodeReceipt({
    ...forged,
    signer: Buffer.from(rawPub).toString("base64url"),
    sig: Buffer.alloc(64, 7).toString("base64url"),
  } as never);
  assert.equal(verifyObligorReceipt(forgedHeader, challenge.challenge).reason, "bad_signature");
  assert.equal(isPaid(forgedHeader, false, "solana"), false);
});

test("x402 helper signer: generatePayerKey + signObligorReceipt round-trips with the server verifier", async () => {
  const mod = await import("../lib/x402");
  const { generatePayerKey, signObligorReceipt, verifyObligorReceipt, paymentRequired } = mod;

  const challenge = paymentRequired("solana");
  assert.equal(challenge.configured, true);
  if (!challenge.configured) return;

  const payer = generatePayerKey();
  const header = signObligorReceipt(challenge.challenge, payer);

  // Fresh nonce each call → two receipts from the same key both verify.
  const result = verifyObligorReceipt(header, challenge.challenge);
  assert.equal(result.ok, true);
  assert.equal(result.nonce, nonce_of(header));
});

function nonce_of(header: string): string | undefined {
  const parsed = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { nonce?: string };
  return parsed.nonce;
}
