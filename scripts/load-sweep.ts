/**
 * Load sweep for the paid clearing path.
 *
 * Fires N concurrent POST /api/v1/net-margin requests (paid via the demo
 * escape hatch) and reports latency percentiles + throughput. Distinguishes:
 *   - ok        (200)
 *   - throttled (429 — rate limiter working as designed)
 *   - errors    (5xx / anything else)
 *
 * Exit is non-zero only on real errors (5xx), never on throttling, so CI can
 * use it as a smoke gate while an operator runs the wide sweep by hand.
 *
 * For a clean throughput number raise the limits on the server under test, e.g.
 *   RATE_LIMIT_COMPUTE_MAX=100000 RATE_LIMIT_MAX=100000 \
 *   SOLANA_PAY_TO=<wallet> X402_ACCEPT_UNVERIFIED_SIGNATURES=true \
 *   npx next start -p 4323
 * then:
 *   NEXT_PUBLIC_API_BASE=http://localhost:4323 TOTAL=300 CONCURRENCY=25 \
 *   npx -y tsx scripts/load-sweep.ts
 */

import { performance } from "node:perf_hooks";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";
const TOTAL = Number(process.env.TOTAL || 200);
const CONCURRENCY = Number(process.env.CONCURRENCY || 20);
const PAY = process.env.LOAD_PAY_SIG || "x402_sig_load_sweep_0000000000";

const WALLET_A = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const WALLET_B = "4Nd1mBQtrMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytW";

const body = {
  chain: "solana",
  partyA: {
    wallet: WALLET_A,
    legs: [
      { venue: "manual", instrument: "SOL lend", bucket: "SOL", side: "lend", qty: 700, markUsd: 142 },
      { venue: "manual", instrument: "USDC", bucket: "USD", side: "lend", qty: 40000, markUsd: 1 },
    ],
  },
  partyB: {
    wallet: WALLET_B,
    legs: [
      { venue: "manual", instrument: "SOL-PERP", bucket: "SOL", side: "short", qty: 700, markUsd: 142 },
      { venue: "manual", instrument: "BTC-PERP", bucket: "BTC", side: "long", qty: 0.47, markUsd: 60000 },
    ],
  },
};

interface Sample {
  ms: number;
  status: number;
  leaked: boolean;
}

async function fire(): Promise<Sample> {
  const t0 = performance.now();
  try {
    const res = await fetch(`${API_BASE}/api/v1/net-margin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-payment-signature": PAY },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const ms = performance.now() - t0;
    // Privacy invariant under load: an aggregate response must never carry legs.
    const leaked = res.status === 200 && (/"legs":/.test(text) || /signedExposureUsd/.test(text));
    return { ms, status: res.status, leaked };
  } catch {
    return { ms: performance.now() - t0, status: 0, leaked: false };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main() {
  console.log(`Load sweep → ${API_BASE}/api/v1/net-margin`);
  console.log(`Requests: ${TOTAL}, concurrency: ${CONCURRENCY}`);

  const samples: Sample[] = [];
  const started = performance.now();
  let inFlight = 0;
  let launched = 0;

  await new Promise<void>((resolve) => {
    const pump = () => {
      while (inFlight < CONCURRENCY && launched < TOTAL) {
        launched++;
        inFlight++;
        fire().then((s) => {
          samples.push(s);
          inFlight--;
          if (samples.length === TOTAL) resolve();
          else pump();
        });
      }
      if (launched >= TOTAL && inFlight === 0) resolve();
    };
    pump();
  });

  const wallMs = performance.now() - started;

  const ok = samples.filter((s) => s.status === 200);
  const throttled = samples.filter((s) => s.status === 429);
  const errors = samples.filter((s) => s.status !== 200 && s.status !== 429);
  const leaked = samples.filter((s) => s.leaked);
  const latencies = ok.map((s) => s.ms).sort((a, b) => a - b);

  const rps = (samples.length / wallMs) * 1000;

  console.log("\n--- results ---");
  console.log(`ok:        ${ok.length}/${samples.length}`);
  console.log(`throttled: ${throttled.length}`);
  console.log(`errors:    ${errors.length}${errors.length ? ` (statuses: ${[...new Set(errors.map((e) => e.status))].join(", ")})` : ""}`);
  console.log(`privacy:   ${leaked.length === 0 ? "OK — no per-leg leakage in any 200" : `VIOLATION in ${leaked.length} response(s)`}`);
  if (latencies.length) {
    console.log(`latency p50: ${percentile(latencies, 50).toFixed(1)}ms`);
    console.log(`latency p95: ${percentile(latencies, 95).toFixed(1)}ms`);
    console.log(`latency p99: ${percentile(latencies, 99).toFixed(1)}ms`);
  }
  console.log(`throughput: ${rps.toFixed(1)} req/s (wall ${wallMs.toFixed(0)}ms)`);

  if (errors.length > 0 || leaked.length > 0) process.exitCode = 1;
}

void main().catch((err) => {
  console.error("load sweep crashed:", err);
  process.exitCode = 1;
});
