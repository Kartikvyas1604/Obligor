/**
 * Obligor Demo Agent Monad (Parallel Multi-Pair Epoch Client)
 * Autonomous client agent executing parallel clearing requests against /api/v1/net-margin/parallel.
 */

export {};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";

async function runMonadAgent() {
  console.log("==================================================");
  console.log(" Obligor Monad Agent — Parallel Multi-Pair Client");
  console.log("==================================================");

  console.log("→ Submitting batch of 3+ desk pairs to Monad TEE clearing epoch...");
  const res = await fetch(`${API_BASE}/api/v1/net-margin/parallel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (res.ok) {
    const data = await res.json();
    console.log("\n← 200 OK — Parallel clearing epoch finalized!");
    console.log(`  Epoch ID     : ${data.epochId}`);
    console.log(`  Concurrency  : ${data.concurrency} concurrent pairs cleared`);
    console.log(`  Duration     : ${data.executionDurationMs}ms`);
    console.log(`  Trust Model  : ${data.trustModel} (Hardware-Attested TEE)`);
    console.log(`  Attestation  : Provider ${data.attestation.provider} (Verified: ${data.attestation.verified})`);
    console.log("\nCleared Desk Pairs:");
    data.pairs.forEach((p: { label: string; margin: { siloedCombinedUsd: number; nettedCombinedUsd: number; savingsUsd: number } }) => {
      console.log(
        `  • ${p.label.padEnd(24)}: Siloed $${p.margin.siloedCombinedUsd.toLocaleString()} → Netted $${p.margin.nettedCombinedUsd.toLocaleString()} (Freed: $${p.margin.savingsUsd.toLocaleString()})`,
      );
    });
    console.log("\n⚡ Monad native throughput proven with concurrent multi-pair settlement.\n");
  } else {
    console.error("Monad epoch request failed:", await res.text());
  }
}

runMonadAgent().catch(console.error);
