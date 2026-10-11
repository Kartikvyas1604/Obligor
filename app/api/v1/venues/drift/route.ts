import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { withApi } from "@/lib/http";
import { DRIFT_PERP_INSTRUMENTS, fetchDriftVenuePrice } from "@/lib/adapters/drift";

/**
 * GET /api/v1/venues/drift
 * Live Drift venue snapshot: marks resolved from the venue's own oracle
 * (Pyth Hermes) plus subaccount verification status. Subaccount failure is
 * reported loudly — never replaced with synthetic balances.
 */
export const GET = withApi(async () => {
  const marks = [];
  for (const instrument of DRIFT_PERP_INSTRUMENTS) {
    try {
      marks.push(await fetchDriftVenuePrice(instrument));
    } catch (err) {
      marks.push({
        instrument,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let subAccount:
    | { status: "configured"; authority: string; subAccountId: number }
    | { status: "unconfigured" }
    | { status: "error"; message: string } = { status: "unconfigured" };

  if (env.drift.authority) {
    const { fetchDriftSubAccount } = await import("@/lib/adapters/drift");
    try {
      const snapshot = await fetchDriftSubAccount();
      subAccount = {
        status: "configured",
        authority: snapshot.authority,
        subAccountId: snapshot.subAccountId,
      };
    } catch (err) {
      subAccount = {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json({
    ok: true,
    venue: "drift",
    markSource: "drift_oracle_pyth",
    marks,
    subAccount,
  });
});