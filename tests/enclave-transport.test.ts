import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createTestAttestor } from "./nitro-fixtures";

const attestor = createTestAttestor();

// Real-transport mode is read at module load, so set it BEFORE the dynamic
// import below. node:test runs each file in its own process, so this cannot
// leak into other tests.
process.env.CONFIDENTIAL_REAL_TRANSPORTS = "true";
// Host-side trust anchors: TEE is claimed only when the host can verify a
// Nitro quote chaining to this pinned root AND whose PCR0 is allowlisted.
process.env.ENCLAVE_ROOT_CERT_PEM = attestor.certPem;
process.env.ENCLAVE_PCR0_ALLOWLIST = attestor.pcr0Hex;

let mode: "unattested" | "valid" | "tampered" = "unattested";
let lastNonce: Uint8Array = new Uint8Array(32);

function enclavePayload() {
  let attestation: Record<string, unknown>;
  if (mode === "unattested") {
    attestation = { provider: "none", verified: false, quote_hex: "", pcr0: "", measurement: "m" };
  } else {
    const quote = attestor.makeQuote(lastNonce, { tamperSig: mode === "tampered" });
    attestation = {
      provider: "nitro",
      verified: false,
      quote_hex: Buffer.from(quote).toString("hex"),
      pcr0: attestor.pcr0Hex,
      measurement: "m",
      nonce_hex: Buffer.from(lastNonce).toString("hex"),
    };
  }
  return {
    session_id: "smoke",
    siloed_a_usd: 9940,
    siloed_b_usd: 14910,
    siloed_combined_usd: 24850,
    netted_combined_usd: 0,
    savings_usd: 24850,
    gross_notional_usd: 198800,
    net_exposure_usd: 0,
    buckets: [{ bucket: "SOL", exposure_usd: 0, haircut: 0.15, im_usd: 0 }],
    attestation,
  };
}

const bookA = {
  party: "A" as const,
  label: "A",
  wallet: "11111111111111111111111111111111",
  chain: "solana" as const,
  warnings: [] as string[],
  legs: [
    {
      party: "A" as const,
      venue: "kamino" as const,
      instrument: "SOL lend",
      bucket: "SOL",
      side: "lend" as const,
      qty: 700,
      notionalUsd: 99400,
      signedExposureUsd: 99400,
      haircut: 0.1,
      markUsd: 142,
      source: "demo" as const,
    },
  ],
};

const bookB = {
  party: "B" as const,
  label: "B",
  wallet: "11111111111111111111111111111112",
  chain: "solana" as const,
  warnings: [] as string[],
  legs: [
    {
      party: "B" as const,
      venue: "drift" as const,
      instrument: "SOL-PERP",
      bucket: "SOL",
      side: "short" as const,
      qty: 700,
      notionalUsd: 99400,
      signedExposureUsd: -99400,
      haircut: 0.15,
      markUsd: 142,
      source: "demo" as const,
    },
  ],
};

async function startFakeEnclave(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/net") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (typeof body?.nonce_hex === "string") {
            lastNonce = new Uint8Array(Buffer.from(body.nonce_hex, "hex"));
          }
        } catch {
          lastNonce = new Uint8Array(32);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(enclavePayload()));
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

test("enclave real transport: consumes remote numbers and maps attestation honestly", async () => {
  const { server, url } = await startFakeEnclave();
  process.env.ENCLAVE_ENDPOINT = url;

  const { EnclaveBackend } = await import("../lib/confidential");
  const backend = new EnclaveBackend();

  // 1) enclave responds WITHOUT a hardware quote → numbers used, TEE NOT claimed.
  mode = "unattested";
  const sim = await backend.netTwoParty(bookA, bookB);
  assert.equal(sim.nettedCombinedUsd, 0);
  assert.equal(sim.siloedCombinedUsd, 24850);
  assert.equal(sim.buckets[0]?.bucket, "SOL");
  assert.equal(sim.trustModel, "simulated_plaintext_compute");
  assert.equal(sim.attestation, undefined);
  assert.match(sim.simulationNote ?? "", /no host-verifiable hardware attestation/i);

  // 2) enclave returns a quote that FAILS host verification (tampered COSE
  //    signature) → the untrusted self-report is ignored, TEE is NOT claimed.
  mode = "tampered";
  const spoofed = await backend.netTwoParty(bookA, bookB);
  assert.equal(spoofed.trustModel, "simulated_plaintext_compute");
  assert.equal(spoofed.attestation, undefined);
  assert.match(spoofed.simulationNote ?? "", /does not verify/i);

  // 3) enclave returns a genuine quote slotted to the per-run nonce, chaining
  //    to the pinned root with an allowlisted PCR0 → hardware_attested_tee.
  mode = "valid";
  const att = await backend.netTwoParty(bookA, bookB);
  assert.equal(att.trustModel, "hardware_attested_tee");
  assert.equal(att.attestation?.verified, true);
  assert.equal(att.attestation?.provider, "nitro");

  // 4) transport unreachable → fail closed (never silently simulate).
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await assert.rejects(() => backend.netTwoParty(bookA, bookB), /unreachable/i);
});
