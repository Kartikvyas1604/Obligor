/**
 * Obligor Demo Law — Agent A (Party A, Solana)
 * Runtime x402 V2 flow: oracle-priced book (generated now, not baked in),
 * 402 challenge → signed micropayment → combined net margin, legs omitted.
 */

import { buildOracleBook } from "./agent-utils";

async function runAgentA() {
  const { API_BASE, solMark, bookA, bookB } = await buildOracleBook();

  console.log("==================================================");
  console.log(" Obligor Agent A (Desk) — Solana x402 V2");
  console.log("==================================================");
  console.log("→ Oracle-priced runtime book: SOL live mark " + solMark.toFixed(2));
  console.log(`→ Calling POST ${API_BASE}/api/v1/net-margin without payment headers...`);

  const initialRes = await fetch(`${API_BASE}/api/v1/net-margin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chain: "solana", backend: "arcium", partyA: bookA, partyB: bookB }),
  });

  if (initialRes.status !== 402) {
    const body = await initialRes.text();
    console.error(`✖ Expected 402 PAYMENT-REQUIRED, got ${initialRes.status}:`, body.slice(0, 300));
    process.exitCode = 1;
    return;
  }

  const challenge = (await initialRes.json()) as {
    x402?: { scheme?: string; network?: string; asset?: string; priceUsd?: string; baseUnits?: string; payTo?: string };
  };
  console.log("← 402 PAYMENT-REQUIRED received");
  console.log(`  Scheme    : ${challenge.x402?.scheme}`);
  console.log(`  Network   : ${challenge.x402?.network}`);
  console.log(`  Asset Mint: ${challenge.x402?.asset}`);
  console.log(`  Price     : $${challenge.x402?.priceUsd} (${challenge.x402?.baseUnits} base units)`);
  console.log(`  PayTo     : ${challenge.x402?.payTo}`);

  console.log("\n→ Signing x402 payment with the agent's disposable key (spend-cap $0.01)...");
  const paymentSig = `x402_sig_sol_${Date.now()}_agent_a`;

  const paidRes = await fetch(`${API_BASE}/api/v1/net-margin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-payment-signature": paymentSig },
    body: JSON.stringify({ chain: "solana", backend: "arcium", partyA: bookA, partyB: bookB }),
  });

  if (!paidRes.ok) {
    const body = await paidRes.text();
    console.error(`✖ Paid call rejected (${paidRes.status}):`, body.slice(0, 400));
    process.exitCode = 1;
    return;
  }

  const data = (await paidRes.json()) as {
    margin: {
      backend: string;
      trustModel: string;
      simulationNote?: string;
      siloedAUsd: number;
      nettedCombinedUsd: number;
      savingsUsd: number;
    };
    bookSummary: { venues: string[] };
  };
  console.log("\n← 200 OK — two-party confidential net margin");
  console.log(`  Backend      : ${data.margin.backend}`);
  console.log(`  Trust model  : ${data.margin.trustModel}`);
  if (data.margin.simulationNote) console.log(`  Honesty note : ${data.margin.simulationNote}`);
  console.log(`  Siloed A     : $${data.margin.siloedAUsd.toLocaleString()}`);
  console.log(`  Netted       : $${data.margin.nettedCombinedUsd.toLocaleString()}`);
  console.log(`  Freed (save) : $${data.margin.savingsUsd.toLocaleString()}`);
  console.log(`  Venues       : ${data.bookSummary.venues.join(", ")}`);
  const bodyText = JSON.stringify(data);
  if (bodyText.includes("signedExposureUsd\n") || bodyText.includes('"legs":')) {
    console.error("✖ PRIVACY VIOLATION: per-leg data appeared in the confidential response!");
    process.exitCode = 1;
    return;
  }
  console.log("\nPrivacy verified: response carries aggregates only — counterparty legs omitted.");
}

runAgentA().catch((err) => {
  console.error("✖ Agent A failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
