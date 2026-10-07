/**
 * Shared runtime-book helpers for the Demo Law agents.
 *
 * No baked-in data: agent books are generated at RUNTIME from live Pyth
 * Hermes marks (via /api/v1/oracle/prices) with fresh random wallets.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function demoWallet(): string {
  const bytes = new Uint8Array(44);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => B58[b % B58.length]).join("");
}

interface OraclePrices {
  prices?: Record<string, { priceUsd: number } | null>;
}

export async function buildOracleBook(): Promise<{
  API_BASE: string;
  solMark: number;
  bookA: { wallet: string; legs: unknown[] };
  bookB: { wallet: string; legs: unknown[] };
}> {
  const res = await fetch(`${API_BASE}/api/v1/oracle/prices`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ORACLE_UNAVAILABLE: /api/v1/oracle/prices returned ${res.status}`);
  const data = (await res.json()) as OraclePrices;
  const solMark = data.prices?.SOL?.priceUsd ?? 0;
  if (!solMark) throw new Error("ORACLE_UNAVAILABLE: no live SOL mark — price both desk legs against real Pyth marks");

  const legsA = [
    { venue: "kamino", instrument: "SOL lend", bucket: "SOL", side: "lend", qty: 700, markUsd: solMark },
    { venue: "kamino", instrument: "USDC deposit", bucket: "USD", side: "lend", qty: 40_000, markUsd: 1 },
  ];
  const legsB = [
    { venue: "drift", instrument: "SOL-PERP", bucket: "SOL", side: "short", qty: 700, markUsd: solMark },
    { venue: "drift", instrument: "BTC-PERP", bucket: "BTC", side: "long", qty: 0.47, markUsd: data.prices?.BTC?.priceUsd ?? 0 },
  ];

  return {
    API_BASE,
    solMark,
    bookA: { wallet: demoWallet(), legs: legsA },
    bookB: { wallet: demoWallet(), legs: legsB },
  };
}