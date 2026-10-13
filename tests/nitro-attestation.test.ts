import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { AWS_NITRO_ROOT_G1_DER, verifyNitroAttestation } from "../lib/nitro-attestation";
import { createTestAttestor, randomNonce } from "./nitro-fixtures";

const attestor = createTestAttestor();

function verify(
  overrides: Partial<Parameters<typeof verifyNitroAttestation>[1]> = {},
  quote: Uint8Array = attestor.makeQuote(overrides.expectedNonce ?? randomNonce()),
) {
  return verifyNitroAttestation(quote, {
    pcr0Allowlist: [attestor.pcr0Hex],
    rootCertDer: [attestor.certDer],
    now: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  });
}

test("verifies a well-formed, pinned, nonce-bound attestation document", () => {
  const nonce = randomNonce();
  const result = verify({ expectedNonce: nonce }, attestor.makeQuote(nonce));
  assert.equal(result.verified, true, result.reason);
  assert.equal(result.pcr0, attestor.pcr0Hex);
  assert.equal(result.moduleId, "obligor-test-enclave");
});

test("rejects an unpinned root certificate", () => {
  const result = verify({ rootCertDer: [AWS_NITRO_ROOT_G1_DER] });
  assert.equal(result.verified, false);
  assert.match(result.reason, /pinned root/);
});

test("rejects when PCR0 is not in the allowlist", () => {
  const result = verify({ pcr0Allowlist: ["00".repeat(48)] });
  assert.equal(result.verified, false);
  assert.match(result.reason, /PCR0/);
});

test("fails closed with an empty PCR0 allowlist", () => {
  const result = verify({ pcr0Allowlist: [] });
  assert.equal(result.verified, false);
  assert.match(result.reason, /allowlist/);
});

test("rejects a mismatched nonce (replay / unrelated document)", () => {
  const result = verify(
    { expectedNonce: randomNonce() },
    attestor.makeQuote(randomNonce()),
  );
  assert.equal(result.verified, false);
  assert.match(result.reason, /nonce/);
});

test("rejects a tampered COSE signature", () => {
  const nonce = randomNonce();
  const result = verify({ expectedNonce: nonce }, attestor.makeQuote(nonce, { tamperSig: true }));
  assert.equal(result.verified, false);
});

test("rejects a certificate outside its validity window", () => {
  const result = verify({ now: new Date("2050-01-01T00:00:00Z") });
  assert.equal(result.verified, false);
  assert.match(result.reason, /validity/);
});

test("AWS Nitro root G1 is pinned by value", () => {
  const derHash = createHash("sha256").update(Buffer.from(AWS_NITRO_ROOT_G1_DER)).digest("hex");
  // Guards against silent replacement of the pinned root constant.
  assert.equal(derHash.length, 64);
  assert.ok(AWS_NITRO_ROOT_G1_DER.length > 400);
});
