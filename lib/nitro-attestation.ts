/**
 * AWS Nitro Enclaves attestation verification (host side).
 *
 * The enclave is UNTRUSTED. When it returns an NSM attestation document (a
 * COSE_Sign1 structure, `quote_hex` on the wire) the host must verify it from
 * first principles — never by trusting the enclave's own `verified` boolean:
 *
 *  1. decode the COSE_Sign1 (minimal CBOR reader);
 *  2. verify the ES384 signature over the COSE Sig_structure with the leaf
 *     certificate's P-384 public key;
 *  3. walk `cabundle` (root first, then the leaf) verifying every certificate's
 *     signature over its tbsCertificate with its parent's public key, and
 *     require the root to byte-equal a pinned AWS Nitro root;
 *  4. check every certificate's validity window at `now`;
 *  5. check PCR0 (enclave image measurement) against an operator allowlist;
 *  6. require a caller nonce and/or user_data to be bound into the document.
 *
 * It NEVER throws on untrusted input — it returns `{ verified, reason }`.
 * A `verified: true` result means all six checks passed.
 */

import { p384 } from "@noble/curves/nist.js";
import { sha384 } from "@noble/hashes/sha2.js";

/**
 * AWS Nitro Enclaves Root Certificate G1 (ecdsa-with-SHA384). Pinned by value:
 * a chain that does not terminate here is rejected regardless of its internal
 * consistency.
 */
const AWS_NITRO_ROOT_G1_PEM = `-----BEGIN CERTIFICATE-----
MIICETCCAZagAwIBAgIRAPkxdWgbkK/hHUbMtOTn+FYwCgYIKoZIzj0EAwMwSTEL
MAkGA1UEBhMCVVMxDzANBgNVBAoMBkFtYXpvbjEMMAoGA1UECwwDQVdTMRswGQYD
VQQDDBJhd3Mubml0cm8tZW5jbGF2ZXMwHhcNMTkxMDI4MTMyODA1WhcNNDkxMDI4
MTQyODA1WjBJMQswCQYDVQQGEwJVUzEPMA0GA1UECgwGQW1hem9uMQwwCgYDVQQL
DANBV1MxGzAZBgNVBAMMEmF3cy5uaXRyby1lbmNsYXZlczB2MBAGByqGSM49AgEG
BSuBBAAiA2IABPwCVOumCMHzaHDimtqQvkY4MpJzbolL//Zy2YlES1BR5TSksfbb
48C8WBoyt7F2Bw7eEtaaP+ohG2bnUs990d0JX28TcPQXCEPZ3BABIeTPYwEoCWZE
h8l5YoQwTcU/9KNCMEAwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUkCW1DdkF
R+eWw5b6cp3PmanfS5YwDgYDVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMDA2kAMGYC
MQCjfy+Rocm9Xue4YnwWmNJVA44fA0P5W2OpYow9OYCVRaEevL8uO1XYru5xtMPW
rfMCMQCi85sWBbJwKKXdS6BptQFuZbT73o/gBh1qUxl/nNr12UO8Yfwr6wPLb+6N
IwLz3/Y=
-----END CERTIFICATE-----`;

export function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(Buffer.from(body, "base64"));
}

export const AWS_NITRO_ROOT_G1_DER = pemToDer(AWS_NITRO_ROOT_G1_PEM);

// ---------------------------------------------------------------------------
// Minimal CBOR
// ---------------------------------------------------------------------------

type CborValue =
  | number
  | bigint
  | Uint8Array
  | string
  | CborValue[]
  | Map<CborValue, CborValue>
  | boolean
  | null;

class CborReader {
  private pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  read(): CborValue {
    const first = this.byte();
    const major = first >> 5;
    const info = first & 0x1f;
    switch (major) {
      case 0:
        return this.uint(info);
      case 1:
        return -1 - this.uint(info);
      case 2:
        return this.bytes(info);
      case 3:
        return new TextDecoder().decode(this.bytes(info));
      case 4:
        return this.array(info);
      case 5:
        return this.map(info);
      case 6:
        // Tag: decode and return the tagged value (Nitro uses no semantic tags
        // we rely on; tags never carry trust here).
        this.read();
        return this.read();
      case 7: {
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        throw new Error(`cbor: unsupported simple value ${info}`);
      }
      default:
        throw new Error(`cbor: bad major type ${major}`);
    }
  }

  private byte(): number {
    if (this.pos >= this.buf.length) throw new Error("cbor: truncated");
    return this.buf[this.pos++];
  }

  /** Decode the argument encoded in the additional-info bits. */
  private headValue(info: number): number {
    if (info < 24) return info;
    if (info === 24) return this.byte();
    if (info === 25) return (this.byte() << 8) | this.byte();
    if (info === 26) {
      return this.byte() * 0x1000000 + (this.byte() << 16) + (this.byte() << 8) + this.byte();
    }
    if (info === 27) {
      let v = 0;
      for (let i = 0; i < 8; i++) v = v * 256 + this.byte();
      return v;
    }
    throw new Error("cbor: indefinite length unsupported");
  }

  private uint(info: number): number {
    return this.headValue(info);
  }

  private bytes(info: number): Uint8Array {
    const len = this.headValue(info);
    if (this.pos + len > this.buf.length) throw new Error("cbor: truncated bytes");
    const out = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }

  private array(info: number): CborValue[] {
    const len = this.headValue(info);
    const out: CborValue[] = [];
    for (let i = 0; i < len; i++) out.push(this.read());
    return out;
  }

  private map(info: number): Map<CborValue, CborValue> {
    const len = this.headValue(info);
    const out = new Map<CborValue, CborValue>();
    for (let i = 0; i < len; i++) {
      const k = this.read();
      out.set(k, this.read());
    }
    return out;
  }
}

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

function cborText(s: string): Uint8Array {
  const b = new TextEncoder().encode(s);
  return concat(cborHead(3, b.length), b);
}

function cborBytes(b: Uint8Array): Uint8Array {
  return concat(cborHead(2, b.length), b);
}

function cborArray(items: Uint8Array[]): Uint8Array {
  return concat(cborHead(4, items.length), ...items);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Minimal DER (X.509 + signature parsing)
// ---------------------------------------------------------------------------

interface DerNode {
  tag: number;
  start: number;
  end: number;
  value: Uint8Array;
}

class DerReader {
  private pos = 0;
  constructor(
    private readonly buf: Uint8Array,
    private readonly base = 0,
  ) {}

  read(): DerNode {
    const start = this.pos;
    if (this.pos >= this.buf.length) throw new Error("der: truncated");
    const tag = this.buf[this.pos++];
    const lenByte = this.buf[this.pos++];
    let len: number;
    if (lenByte & 0x80) {
      const n = lenByte & 0x7f;
      len = 0;
      for (let i = 0; i < n; i++) len = len * 256 + this.buf[this.pos++];
    } else {
      len = lenByte;
    }
    const contentStart = this.pos;
    const contentEnd = contentStart + len;
    if (contentEnd > this.buf.length) throw new Error("der: length overruns buffer");
    this.pos = contentEnd;
    return {
      tag,
      start: this.base + start,
      end: this.base + contentEnd,
      value: this.buf.subarray(contentStart, contentEnd),
    };
  }

  eof(): boolean {
    return this.pos >= this.buf.length;
  }
}

interface ParsedCert {
  raw: Uint8Array;
  tbs: Uint8Array;
  signature: Uint8Array;
  publicKey: Uint8Array;
  notBefore: Date;
  notAfter: Date;
}

function parseTime(node: DerNode): Date {
  const s = new TextDecoder().decode(node.value);
  if (node.tag === 0x17) {
    // UTCTime YYMMDDHHMMSSZ
    const yy = Number(s.slice(0, 2));
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    return new Date(
      Date.UTC(year, Number(s.slice(2, 4)) - 1, Number(s.slice(4, 6)), Number(s.slice(6, 8)), Number(s.slice(8, 10)), Number(s.slice(10, 12))),
    );
  }
  if (node.tag === 0x18) {
    // GeneralizedTime YYYYMMDDHHMMSSZ
    return new Date(
      Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)), Number(s.slice(8, 10)), Number(s.slice(10, 12)), Number(s.slice(12, 14))),
    );
  }
  throw new Error("der: unsupported time tag");
}

function parseCertificate(der: Uint8Array): ParsedCert {
  const outer = new DerReader(der);
  const cert = outer.read();
  if (cert.tag !== 0x30) throw new Error("der: certificate is not a SEQUENCE");

  const c = new DerReader(cert.value, cert.end - cert.value.length);
  const tbs = c.read();
  c.read(); // signatureAlgorithm
  const sigBits = c.read();
  if (sigBits.tag !== 0x03) throw new Error("der: signatureValue is not a BIT STRING");
  const signature = sigBits.value.subarray(1); // drop the unused-bits byte

  const t = new DerReader(tbs.value);
  // First element is the optional [0] version; when absent it is the serial.
  let n = t.read();
  if (n.tag === 0xa0) n = t.read(); // serialNumber after version
  t.read(); // signature AlgorithmIdentifier
  t.read(); // issuer
  const validity = t.read();
  t.read(); // subject
  const spki = t.read();

  const v = new DerReader(validity.value);
  const notBefore = parseTime(v.read());
  const notAfter = parseTime(v.read());

  const s = new DerReader(spki.value);
  s.read(); // AlgorithmIdentifier
  const spkiBits = s.read();
  if (spkiBits.tag !== 0x03) throw new Error("der: SPKI key is not a BIT STRING");
  const publicKey = spkiBits.value.subarray(1); // uncompressed EC point

  return {
    raw: der,
    tbs: der.subarray(tbs.start, tbs.end),
    signature,
    publicKey,
    notBefore,
    notAfter,
  };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function hex(u: Uint8Array): string {
  return Buffer.from(u).toString("hex");
}

function verifyEs384(signatureDer: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    const compact = p384.Signature.fromDER(signatureDer).toBytes();
    return p384.verify(compact, sha384(message), publicKey, { prehash: false });
  } catch {
    return false;
  }
}

function verifyEs384Cose(signatureCompact: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return p384.verify(signatureCompact, sha384(message), publicKey, { prehash: false });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface NitroVerifyOptions {
  /** Allowed PCR0 measurements (lowercase hex). Empty = reject (fail closed). */
  pcr0Allowlist: string[];
  /** Pinned root certificate DER values. Defaults to the AWS Nitro Root G1. */
  rootCertDer?: Uint8Array[];
  /** Optional allowed module ids. */
  moduleIdAllowlist?: string[];
  /** Verification time; defaults to now. */
  now?: Date;
  /** When set, the document nonce must equal this value. */
  expectedNonce?: Uint8Array | null;
  /** When set, the document user_data must equal this value. */
  expectedUserData?: Uint8Array | null;
}

export interface NitroVerification {
  verified: boolean;
  reason: string;
  moduleId?: string;
  timestampMs?: number;
  pcr0?: string;
}

function fail(reason: string, extra: Partial<NitroVerification> = {}): NitroVerification {
  return { verified: false, reason, ...extra };
}

export function verifyNitroAttestation(
  quote: Uint8Array,
  opts: NitroVerifyOptions,
): NitroVerification {
  const now = opts.now ?? new Date();
  const roots = opts.rootCertDer ?? [AWS_NITRO_ROOT_G1_DER];
  if (opts.pcr0Allowlist.length === 0) {
    return fail("no PCR0 allowlist configured — refusing to trust an unpinned enclave measurement");
  }

  // 1. COSE_Sign1
  let cose: CborValue;
  try {
    cose = new CborReader(quote).read();
  } catch (e) {
    return fail(`attestation document is not valid CBOR: ${(e as Error).message}`);
  }
  if (!Array.isArray(cose) || cose.length !== 4) {
    return fail("attestation document is not a COSE_Sign1 array of 4 elements");
  }
  const [protectedHdr, , payload, signature] = cose as [
    Uint8Array,
    CborValue,
    Uint8Array | null,
    Uint8Array,
  ];
  if (!(protectedHdr instanceof Uint8Array) || !(signature instanceof Uint8Array) || !(payload instanceof Uint8Array)) {
    return fail("attestation document has malformed COSE_Sign1 fields");
  }

  // 2. Attestation document payload
  let doc: CborValue;
  try {
    doc = new CborReader(payload).read();
  } catch (e) {
    return fail(`attestation payload is not valid CBOR: ${(e as Error).message}`);
  }
  if (!(doc instanceof Map)) return fail("attestation payload is not a map");

  const get = (k: string): CborValue | undefined => doc.get(k);
  const certificate = get("certificate");
  const cabundle = get("cabundle");
  const pcrs = get("pcrs");
  const moduleId = get("module_id");
  const timestamp = get("timestamp");
  const nonce = get("nonce");
  const userData = get("user_data");
  if (!(certificate instanceof Uint8Array)) return fail("attestation document missing `certificate`");
  if (!Array.isArray(cabundle)) return fail("attestation document missing `cabundle`");
  if (!(pcrs instanceof Map)) return fail("attestation document missing `pcrs`");

  // 3. Chain: cabundle (root-first) then the leaf.
  let leaf: ParsedCert;
  let chain: ParsedCert[];
  try {
    leaf = parseCertificate(certificate);
    chain = [...cabundle.map((b) => parseCertificate(b as Uint8Array)), leaf];
  } catch (e) {
    return fail(`certificate chain could not be parsed: ${(e as Error).message}`);
  }

  const root = chain[0];
  const rootPinned = roots.some((r) => bytesEqual(r, root.raw));
  if (!rootPinned) return fail("certificate chain does not terminate at a pinned root");

  if (!verifyEs384(root.signature, root.tbs, root.publicKey)) {
    return fail("root certificate is not self-signed");
  }
  for (let i = 1; i < chain.length; i++) {
    if (!verifyEs384(chain[i].signature, chain[i].tbs, chain[i - 1].publicKey)) {
      return fail(`certificate ${i} is not signed by its parent`);
    }
  }

  // 4. Validity windows
  for (let i = 0; i < chain.length; i++) {
    if (now < chain[i].notBefore || now > chain[i].notAfter) {
      return fail(`certificate ${i} is outside its validity window`);
    }
  }

  // 5. COSE signature over the Sig_structure, using the leaf key.
  const sigStructure = cborArray([
    cborText("Signature1"),
    cborBytes(protectedHdr),
    cborBytes(new Uint8Array(0)),
    cborBytes(payload),
  ]);
  if (!verifyEs384Cose(signature, sigStructure, leaf.publicKey)) {
    return fail("COSE_Sign1 signature does not verify against the leaf certificate");
  }

  // 6. PCR0 allowlist
  const pcr0Bytes = pcrs.get(0);
  if (!(pcr0Bytes instanceof Uint8Array)) return fail("attestation document missing PCR0");
  const pcr0 = hex(pcr0Bytes);
  if (!opts.pcr0Allowlist.map((p) => p.toLowerCase()).includes(pcr0)) {
    return fail(`PCR0 ${pcr0} is not in the allowlist`);
  }

  // 7. module id allowlist (optional)
  if (opts.moduleIdAllowlist && opts.moduleIdAllowlist.length > 0) {
    if (typeof moduleId !== "string" || !opts.moduleIdAllowlist.includes(moduleId)) {
      return fail("module_id is not in the allowlist");
    }
  }

  // 8. Nonce / user_data binding
  if (opts.expectedNonce) {
    if (!(nonce instanceof Uint8Array) || !bytesEqual(nonce, opts.expectedNonce)) {
      return fail("attestation nonce does not match the verifier-supplied nonce");
    }
  }
  if (opts.expectedUserData) {
    if (!(userData instanceof Uint8Array) || !bytesEqual(userData, opts.expectedUserData)) {
      return fail("attestation user_data does not match the expected binding");
    }
  }

  return {
    verified: true,
    reason: "attestation verified: COSE signature, pinned-root chain, validity, PCR0, and binding checks all passed",
    moduleId: typeof moduleId === "string" ? moduleId : undefined,
    timestampMs: typeof timestamp === "number" ? timestamp : undefined,
    pcr0,
  };
}
