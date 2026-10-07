import { NextResponse } from "next/server";
import { rateLimitFor, withApi } from "@/lib/http";
import { fetchAllOraclePrices } from "@/lib/adapters/pyth";

/** GET /api/v1/oracle/prices — live Hermes marks with honest provenance metadata. */
export const GET = withApi(async ({ req }) => {
  rateLimitFor("default", req);
  const prices = await fetchAllOraclePrices();
  return NextResponse.json({
    ok: true,
    provider: "pyth_network_hermes",
    timestamp: new Date().toISOString(),
    prices,
  });
});
