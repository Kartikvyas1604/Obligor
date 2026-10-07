/**
 * Obligor Demo Law — Monad Agent (parallel multi-pair epoch)
 * Builds 3+ runtime oracle-priced desk pairs and clears them concurrently
 * against /api/v1/net-margin/parallel. Reports the trust model exactly as
 * the server labels it — simulated seal stays labeled, TEE never implied.
 */

import { buildOracleBook, demoWallet } from "./agent-utils";

async function runMonadAgent() {
  const { API_BASE, bookA, bookB } = await buildOracleBook();

  console.log("==================================================");
  console.log(" Obligor Monad Agent — Parallel Multi-Pair Epoch");
  console.log("==================================================");

  const pairs = [1, 2, 3].map((n) => ({
    pairId: `p${n}`,
    label: `Desk ${2 * n - 1} ↔ Desk ${2 * n}`,
    a: { wallet: n === 1 ? bookA.wallet : demoWallet(), legs: bookA.legs },
    b: { wallet: n === 1 ? bookB.wallet : demoWallet(), legs: bookB.legs },
  }));

  console.log(`→ Submitting ${pairs.length} desk pairs to the Monad clearing epoch...`);
  const res = await fetch(`${API_BASE}/api/v1/net-margin/parallel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chain: "monad", pairs }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`✖ Epoch request failed (${res.status}):`, body.slice(0, 400));
    process.exitCode = 1;
    return;
  }

  const data = (await res.json()) as {
    epochId: string;
    concurrency: number;
    executionDurationMs: number;
    trustModel: string;
    attestation: { provider: string; verified: boolean; note?: string } | null;
    pairs: Array<{ label: string; margin: { siloedCombinedUsd: number; nettedCombinedUsd: number; savingsUsd: number } }>;
  };

  console.log("\n← 200 OK — parallel clearing epoch finalized");
  console.log(`  Epoch ID    : ${data.epochId}`);
  console.log(`  Concurrency : ${data.concurrency} pairs cleared concurrently`);
  console.log(`  Duration    : ${data.executionDurationMs}ms`);
  console.log(`  Trust model : ${data.trustModel} (labeled exactly as executed — TEE ≠ MPC)`);
  if (data.attestation?.note) {
    console.log(`  Attestation : ${data.attestation.note}`);
  } else if (!data.attestation) {
    console.log("  Attestation : none issued — simulated seal, honestly labeled");
  }
  console.log("\nCleared desk pairs:");
  data.pairs.forEach((p) => {
    console.log(
      `  • ${p.label.padEnd(24)}: Siloed $${p.margin.siloedCombinedUsd.toLocaleString()} → Netted $${p.margin.nettedCombinedUsd.toLocaleString()} (Freed: $${p.margin.savingsUsd.toLocaleString()})`,
    );
  });
}

runMonadAgent().catch((err) => {
  console.error("✖ Monad agent failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
