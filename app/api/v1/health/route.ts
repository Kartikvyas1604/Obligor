import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { sessionStore } from "@/lib/session-store";

/**
 * GET /api/v1/health
 * Operational readiness surface: config flags the UI needs (demo/payment
 * availability), store mode, and deployed build status. No secrets.
 */
export function GET() {
  const solanaPayments = Boolean(env.x402.solanaPayTo);
  const monadPayments = Boolean(env.x402.monadPayTo);
  const sessions = sessionStore.all();

  return NextResponse.json({
    ok: true,
    version: "0.1.0",
    twoParty: true,
    formula: "two_party_netted_bucket_haircut",
    config: {
      // Client needs these to decide what to render:
      demoFixturesEnabled: env.demo.allowFixtures,
      payments: { solana: solanaPayments, monad: monadPayments },
      storeMode: sessionStore.mode,
      sessionCount: sessions.length,
      maxLegsPerBook: env.positions.maxLegsPerBook,
      haircuts: {
        spot: env.positions.haircutSpot,
        perp: env.positions.haircutPerp,
        equity: env.positions.haircutEquity,
      },
      x402: {
        priceUsd: env.x402.priceUsd,
        networks: {
          solana: { network: env.x402.solanaNetwork, asset: env.x402.solanaAssetMint, enabled: solanaPayments },
          monad: { network: env.x402.monadNetwork, asset: env.x402.monadAssetMint, enabled: monadPayments },
        },
      },
      oracle: {
        source: "pyth_network_hermes",
        fallback: env.oracle.fallbackEnabled,
        stalenessMs: env.oracle.stalenessMs,
      },
    },
    disclaimer:
      "Obligor is confidential two-party margin analytics. Not a custody protocol, not an exchange. TEE ≠ MPC — trust models are labeled per backend.",
  });
}
