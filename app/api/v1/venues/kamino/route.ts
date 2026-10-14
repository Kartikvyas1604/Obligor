import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { withApi } from "@/lib/http";
import {
  KAMINO_SUPPORTED_BUCKETS,
  fetchKaminoPortfolio,
  fetchKaminoVenuePrice,
} from "@/lib/adapters/kamino";

/**
 * GET /api/v1/venues/kamino
 * Live Kamino venue snapshot: marks resolved from the venue's oracle (Pyth
 * Hermes) plus Portfolio API verification status. Portfolio failure is reported
 * loudly — never replaced with synthetic positions.
 */
export const GET = withApi(async () => {
  const marks = [];
  for (const bucket of KAMINO_SUPPORTED_BUCKETS) {
    try {
      marks.push(await fetchKaminoVenuePrice(bucket));
    } catch (err) {
      marks.push({ bucket, error: err instanceof Error ? err.message : String(err) });
    }
  }

  let portfolio:
    | { status: "configured"; authority: string; obligations: number; buckets: string[] }
    | { status: "unconfigured" }
    | { status: "error"; message: string } = { status: "unconfigured" };

  if (env.kamino.authority) {
    try {
      const snapshot = await fetchKaminoPortfolio();
      portfolio = {
        status: "configured",
        authority: snapshot.authority,
        obligations: snapshot.obligations.length,
        buckets: Object.keys(snapshot.bucketExposure),
      };
    } catch (err) {
      portfolio = { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({
    ok: true,
    venue: "kamino",
    markSource: "kamino_oracle_pyth",
    marks,
    portfolio,
  });
});
