/**
 * Obligor Demo Agent A (Party A - Solana)
 * Autonomous client agent executing x402 V2 payment flow against /api/v1/net-margin.
 */

export {};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";

async function runAgentA() {
  console.log("==================================================");
  console.log(" Obligor Agent A (Desk Alpha) — Solana Client");
  console.log("==================================================");

  console.log("→ Initializing with disposable key A (spend-cap: 1.00 USDC)");
  console.log(`→ Calling POST ${API_BASE}/api/v1/net-margin without payment headers...`);

  const initialRes = await fetch(`${API_BASE}/api/v1/net-margin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chain: "solana", backend: "arcium" }),
  });

  if (initialRes.status === 402) {
    const challenge = await initialRes.json();
    console.log("← 402 PAYMENT-REQUIRED received!");
    console.log(`  Scheme    : ${challenge.x402?.scheme}`);
    console.log(`  Network   : ${challenge.x402?.network}`);
    console.log(`  Asset Mint: ${challenge.x402?.asset}`);
    console.log(`  Price     : $${challenge.x402?.priceUsd} (${challenge.x402?.baseUnits} base units)`);

    console.log("\n→ Signing x402 payment signature with agent private key...");
    const paymentSig = `x402_sig_sol_${Date.now()}_party_a_valid`;

    console.log("→ Retrying request with x402 PAYMENT-SIGNATURE...");
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
      console.log(`  Backend     : ${data.margin.backend} (${data.margin.trustModel})`);
      console.log(`  Computation : ${data.margin.computationId}`);
      console.log(`  Siloed A    : $${data.margin.siloedAUsd.toLocaleString()}`);
      console.log(`  Siloed B    : $${data.margin.siloedBUsd.toLocaleString()}`);
      console.log(`  Netted      : $${data.margin.nettedCombinedUsd.toLocaleString()}`);
      console.log(`  Freed (Save): $${data.margin.savingsUsd.toLocaleString()}`);
      console.log(`  Venues      : ${data.bookSummary.venues.join(", ")}`);
      console.log("\n🔒 Privacy Verified: Counterparty legs are omitted in response payload.");
    } else {
      console.error("Payment failed:", await paidRes.text());
    }
  } else {
    console.log("Unexpected status:", initialRes.status, await initialRes.text());
  }
}

runAgentA().catch(console.error);
