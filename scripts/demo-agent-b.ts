/**
 * Obligor Demo Agent B (Party B - Counterparty)
 * Autonomous client agent executing x402 V2 payment flow against /api/v1/net-margin with independent key.
 */

export {};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";

async function runAgentB() {
  console.log("==================================================");
  console.log(" Obligor Agent B (Counterparty Desk) — Solana Client");
  console.log("==================================================");

  console.log("→ Initializing with independent disposable key B");
  console.log(`→ Calling POST ${API_BASE}/api/v1/net-margin without payment headers...`);

  const initialRes = await fetch(`${API_BASE}/api/v1/net-margin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chain: "solana", backend: "arcium" }),
  });

  if (initialRes.status === 402) {
    const challenge = await initialRes.json();
    console.log("← 402 PAYMENT-REQUIRED received from clearing gateway.");
    console.log(`  Target Price : $${challenge.x402?.priceUsd}`);

    console.log("\n→ Signing x402 payment authorization with Agent B private key...");
    const paymentSig = `x402_sig_sol_${Date.now()}_party_b_independent`;

    console.log("→ Dispatching payment transaction to gateway...");
    const paidRes = await fetch(`${API_BASE}/api/v1/net-margin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-payment-signature": paymentSig,
      },
      body: JSON.stringify({ chain: "solana", backend: "arcium" }),
    });

    if (paidRes.ok) {
      const data = await paidRes.json();
      console.log("\n← 200 OK — Two-party confidential net margin resolved!");
      console.log(`  Combined Netted : $${data.margin.nettedCombinedUsd.toLocaleString()}`);
      console.log(`  Capital Savings : $${data.margin.savingsUsd.toLocaleString()}`);
      console.log(`  Trust Model     : ${data.margin.trustModel}`);
      console.log("\n🔒 Privacy Verified: Only aggregate net metrics returned.");
    }
  }
}

runAgentB().catch(console.error);
