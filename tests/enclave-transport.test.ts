import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Real-transport mode is read at module load, so set it BEFORE the dynamic
// import below. node:test runs each file in its own process, so this cannot
// leak into other tests.
process.env.CONFIDENTIAL_REAL_TRANSPORTS = "true";
// Host-side allowlist: TEE is only claimed when the host can match the
// enclave's returned measurement against this value.
process.env.ENCLAVE_EXPECTED_MEASUREMENT = "m";

let mode: "unattested" | "attested" | "spoofed" = "unattested";

function enclavePayload() {
  const measurement = mode === "spoofed" ? "attacker-measurement" : "m";
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
    attestation:
      mode === "unattested"
        ? { provider: "none", verified: false, quote_hex: "", pcr0: "", measurement }
        : { provider: "nitro", verified: true, quote_hex: "deadbeef", pcr0: "pcr0", measurement },
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
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(enclavePayload()));
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
  assert.match(sim.simulationNote ?? "", /no hardware attestation quote/i);

  // 2) enclave CLAIMS verified but its measurement does not match the host
  //    allowlist → the untrusted boolean is ignored, TEE is NOT claimed.
  mode = "spoofed";
  const spoofed = await backend.netTwoParty(bookA, bookB);
  assert.equal(spoofed.trustModel, "simulated_plaintext_compute");
  assert.equal(spoofed.attestation, undefined);
  assert.match(spoofed.simulationNote ?? "", /could not verify/i);

  // 3) enclave responds WITH a verified quote whose measurement matches the
  //    host allowlist → hardware_attested_tee + attestation.
  mode = "attested";
  const att = await backend.netTwoParty(bookA, bookB);
  assert.equal(att.trustModel, "hardware_attested_tee");
  assert.equal(att.attestation?.verified, true);
  assert.equal(att.attestation?.quote, "deadbeef");
  assert.equal(att.attestation?.provider, "nitro");

  // 4) transport unreachable → fail closed (never silently simulate).
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await assert.rejects(() => backend.netTwoParty(bookA, bookB), /unreachable/i);
});
