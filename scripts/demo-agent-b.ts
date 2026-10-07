/**
 * Obligor Demo Law — Agent B (Party B, Solana)
 * Independent disposable key + runtime oracle-priced book, same x402 V2 flow.
 */

import { buildOracleBook } from "./agent-utils";

async function runAgentB() {
  const { API_BASE, solMark, bookA, bookB } = await buildOracleBook();

  console.log("==================================================");
  console.log(" Obligor Agent B (Counterparty Desk) — Solana x402 V2");
  console.log("==================================================");
  console.log("→ Independent disposable key B · oracle-priced runtime book (SOL " + solMark.toFixed(2) + ")");
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

  await initialRes.json();
  console.log("← 402 PAYMENT-REQUIRED — signing with Agent B's OWN key...");
  const paymentSig = `x402_sig_sol_${Date.now()}_agent_b`;

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
    margin: { trustModel: string; siloedBUsd: number; nettedCombinedUsd: number; savingsUsd: number; simulationNote?: string };
  };
  console.log("\n← 200 OK — combined net margin, zero book leakage");
  console.log(`  Trust model  : ${data.margin.trustModel}${data.margin.simulationNote ? " (see honesty note)" : ""}`);
  if (data.margin.simulationNote) console.log(`  Honesty note : ${data.margin.simulationNote}`);
  console.log(`  Siloed B     : $${data.margin.siloedBUsd.toLocaleString()}`);
  console.log(`  Netted       : $${data.margin.nettedCombinedUsd.toLocaleString()}`);
  console.log(`  Freed (save) : $${data.margin.savingsUsd.toLocaleString()}`);
}

runAgentB().catch((err) => {
  console.error("✖ Agent B failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
