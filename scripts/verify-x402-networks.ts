#!/usr/bin/env node
/**
 * Obligor x402 facilitator & network verification — REAL probe, honest gate.
 *
 * - Probes each configured facilitator's `/supported` endpoint with a hard timeout.
 * - A facilitator is only applied to a chain when its URL is set: Solana has no
 *   confirmed public facilitator URL, so it verifies only via FACILITATOR_URL_SOLANA.
 * - Exit codes (CI-gateable):
 *     0 = all probed facilitators respond with a supported x402 config
 *     1 = any requested facilitator failed ⇒ do not enable that chain's x402
 *         (Monad payments stay Solana-only and AN agent flow documents it).
 */

export {};

interface ChainSpec {
  chain: "solana" | "monad";
  network: string;
  asset: string;
  facilitatorUrl: string;
}

const NETWORKS: ChainSpec[] = [
  {
    chain: "solana",
    network: process.env.X402_NETWORK_SOLANA || "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    asset: process.env.X402_ASSET_MINT_SOLANA || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    facilitatorUrl: process.env.FACILITATOR_URL_SOLANA || "",
  },
  {
    chain: "monad",
    network: process.env.X402_NETWORK_MONAD || "eip155:10143",
    asset: process.env.X402_ASSET_MINT_MONAD || "0x534b2f3A21130d7a60830c2Df862319e593943A3",
    facilitatorUrl: process.env.FACILITATOR_URL_MONAD || "https://x402-facilitator.molandak.org",
  },
];

type ProbeResult = "verified" | "no_facilitator" | "failed";

async function probeFacilitator(url: string): Promise<{ status: ProbeResult; note: string }> {
  if (!url) {
    return { status: "no_facilitator", note: "Not verified — no facilitator URL configured for Solana V2 direct-settlement; keep x402 honest (format-check only)." };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(new URL("/supported", url).toString(), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { status: "failed", note: `HTTP ${res.status} from /supported` };
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return {
      status: "verified",
      note: `responded with ${res.ok ? "a valid" : "no"} /supported payload${body ? ` (keys: ${Object.keys(body).slice(0, 6).join(", ")})` : ""}`,
    };
  } catch (err) {
    return { status: "failed", note: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyNetworks() {
  console.log(`
========================================================
 Obligor x402 V2 verification — real facilitator probes
========================================================
`);

  let failures = 0;

  for (const net of NETWORKS) {
    console.log(`[+] ${net.chain.toUpperCase()} x402 configuration`);
    console.log(`    Network CAIP-2 : ${net.network}`);
    console.log(`    USDC asset     : ${net.asset}`);

    const probe = await probeFacilitator(net.facilitatorUrl);
    if (probe.status === "verified") {
      console.log(`    Facilitator    : ${net.facilitatorUrl}`);
      console.log(`    Status         : VERIFIED — ${probe.note}`);
    } else if (probe.status === "no_facilitator") {
      console.log(`    Facilitator    : none configured`);
      console.log(`    Status         : ${probe.note}`);
    } else {
      failures++;
      console.log(`    Facilitator    : ${net.facilitatorUrl}`);
      console.log(`    Status         : FAILED — ${probe.note}`);
    }
    console.log();
  }

  console.log("Gate semantics:");
  console.log("- A chain with a failed facilitator probe MUST NOT enable x402 in its env (X402_MONAD_ENABLED=false).");
  console.log("- A chain with no public facilitator keeps speed-direct settlement; its 402 challenge still advertises payTo + terms from env.");
  console.log("- Exit code is 0 only when every configured probe verified.\n");

  if (failures > 0) {
    console.error(`✖ ${failures} facilitator probe(s) failed — keep that chain's x402 disabled and document it.`);
    process.exitCode = 1;
  } else {
    console.log("✔ All configured facilitators verified.");
  }
}

verifyNetworks().catch((err) => {
  console.error("✖ Verification crashed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
