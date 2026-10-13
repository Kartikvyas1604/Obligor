import { generateKeyPairSync, randomBytes, sign as cryptoSign } from "node:crypto";
import { p384 } from "@noble/curves/nist.js";

// Test-only builders for a self-signed P-384 attestation "root" and a matching
// COSE_Sign1 NSM attestation document. The root is used as both the pinned root
// and the leaf, so the signature path (COSE + X.509) is the real one.

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function derLen(n: number): Uint8Array {
  if (n < 0x80) return Uint8Array.of(n);
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function tlv(tag: number, content: Uint8Array): Uint8Array {
  return concat(Uint8Array.of(tag), derLen(content.length), content);
}

const seq = (...content: Uint8Array[]) => tlv(0x30, concat(...content));
const oid = (b: Uint8Array) => tlv(0x06, b);
const utc = (s: string) => tlv(0x17, new TextEncoder().encode(s));
const bitString = (b: Uint8Array) => tlv(0x03, concat(Uint8Array.of(0), b));
function intFromBytes(b: Uint8Array): Uint8Array {
  const v = b[0] & 0x80 ? concat(Uint8Array.of(0), b) : b;
  return tlv(0x02, v);
}

const ECDSA_WITH_SHA384 = Uint8Array.from([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x03]);

function cborHead(major: number, len: number): Uint8Array {
  if (len < 24) return Uint8Array.of((major << 5) | len);
  if (len < 0x100) return Uint8Array.of((major << 5) | 24, len);
  if (len < 0x10000) return Uint8Array.of((major << 5) | 25, len >> 8, len & 0xff);
  return Uint8Array.of(
    (major << 5) | 26,
    (len >>> 24) & 0xff,
    (len >>> 16) & 0xff,
    (len >>> 8) & 0xff,
    len & 0xff,
  );
}
const cborText = (s: string) => {
  const b = new TextEncoder().encode(s);
  return concat(cborHead(3, b.length), b);
};
const cborBytes = (b: Uint8Array) => concat(cborHead(2, b.length), b);
const cborArray = (...items: Uint8Array[]) => concat(cborHead(4, items.length), ...items);
const cborMap = (entries: [Uint8Array, Uint8Array][]) =>
  concat(cborHead(5, entries.length), ...entries.flat());
const cborUInt = (n: number) => cborHead(0, n);
const cborNull = () => Uint8Array.of(0xf6);

function toPem(der: Uint8Array): string {
  const b64 = Buffer.from(der).toString("base64");
  const lines = b64.match(/.{1,64}/g)!.join("\n");
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
}

export interface TestAttestor {
  certDer: Uint8Array;
  certPem: string;
  pcr0: Uint8Array;
  pcr0Hex: string;
  makeQuote(nonce: Uint8Array, opts?: { pcr0?: Uint8Array; moduleId?: string; tamperSig?: boolean }): Uint8Array;
}

export function createTestAttestor(): TestAttestor {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
  const spki = new Uint8Array(publicKey.export({ type: "spki", format: "der" }));
  const tbs = seq(
    intFromBytes(Uint8Array.of(1)),
    seq(oid(ECDSA_WITH_SHA384)),
    seq(),
    seq(utc("200101000000Z"), utc("400101000000Z")),
    seq(),
    spki,
  );
  const certSig = new Uint8Array(cryptoSign("sha384", tbs, privateKey));
  const certDer = seq(tbs, seq(oid(ECDSA_WITH_SHA384)), bitString(certSig));
  const pcr0 = new Uint8Array(48).fill(0x0a);

  return {
    certDer,
    certPem: toPem(certDer),
    pcr0,
    pcr0Hex: Buffer.from(pcr0).toString("hex"),
    makeQuote(nonce, opts = {}) {
      const payload = cborMap([
        [cborText("module_id"), cborText(opts.moduleId ?? "obligor-test-enclave")],
        [cborText("digest"), cborText("SHA384")],
        [cborText("timestamp"), cborUInt(200)],
        [cborText("pcrs"), cborMap([[cborUInt(0), cborBytes(opts.pcr0 ?? pcr0)]])],
        [cborText("certificate"), cborBytes(certDer)],
        [cborText("cabundle"), cborArray()],
        [cborText("user_data"), cborNull()],
        [cborText("nonce"), cborBytes(nonce)],
        [cborText("public_key"), cborNull()],
      ]);
      const protectedHdr = cborMap([[cborUInt(1), Uint8Array.of(0x22, 0x22)]]); // {1: -35}
      const sigStructure = cborArray(
        cborText("Signature1"),
        cborBytes(protectedHdr),
        cborBytes(new Uint8Array(0)),
        cborBytes(payload),
      );
      const coseSigDer = new Uint8Array(cryptoSign("sha384", sigStructure, privateKey));
      const coseSigCompact = p384.Signature.fromDER(coseSigDer).toBytes();
      if (opts.tamperSig) coseSigCompact[0] ^= 0xff;
      return cborArray(
        cborBytes(protectedHdr),
        cborMap([]),
        cborBytes(payload),
        cborBytes(coseSigCompact),
      );
    },
  };
}

export function randomNonce(): Uint8Array {
  return randomBytes(32);
}
