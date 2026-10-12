/**
 * Sign an Obligor x402 receipt (ed25519) for a live challenge.
 *
 * Generates an ephemeral payer key, fetches the 402 challenge from a running
 * API, signs the exact challenge terms, and prints the ready-to-send
 * `x-payment-signature` header. Uses only node:crypto — no dependencies.
 *
 *   API_BASE=http://localhost:3000 npm run x402:sign
 *
 * Then:
 *   curl -X POST $API_BASE/api/v1/net-margin \
 *     -H 'content-type: application/json' \
 *     -H "x-payment-signature: <printed header>" -d @book.json
 */
import { generatePayerKey, signObligorReceipt } from "../lib/x402";

async function main() {
  const API_BASE = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";
  const chain = (process.env.CHAIN as "solana" | "monad") || "solana";

  const res = await fetch(`${API_BASE}/api/v1/net-margin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chain, partyA: { wallet: "11111111111111111111111111111111" } }),
  });
  if (res.status !== 402) {
    throw new Error(`Expected 402 challenge, got ${res.status} — is payment configured (payTo) for ${chain}?`);
  }
  const body = (await res.json()) as {
    x402?: { scheme: string; network: string; asset: string; baseUnits: string; payTo: string };
  };
  const c = body.x402;
  if (!c) throw new Error("No x402 challenge in 402 response");

  const payer = generatePayerKey();
  const header = signObligorReceipt(
    { scheme: c.scheme, network: c.network, asset: c.asset, payTo: c.payTo, baseUnits: c.baseUnits },
    payer,
  );

  console.log("Signed x402 receipt for", `${c.network} (${c.baseUnits} base units → ${c.payTo})`);
  console.log("\nx-payment-signature:");
  console.log(header);
}

main().catch((err) => {
  console.error("x402 signing failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
