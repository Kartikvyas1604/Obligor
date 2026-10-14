import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { withApi } from "@/lib/http";
import { fetchMonadChainState, fetchMonadExposure } from "@/lib/adapters/monad";

/**
 * GET /api/v1/venues/monad
 * Live Monad (EVM) venue snapshot: chain id + head block from JSON-RPC, plus
 * on-chain token exposure verification status. RPC or balance failures are
 * reported loudly — never replaced with synthetic positions.
 */
export const GET = withApi(async () => {
  let chain: { chainId: number; blockNumber: number } | { error: string };
  try {
    const state = await fetchMonadChainState();
    chain = { chainId: state.chainId, blockNumber: state.blockNumber };
  } catch (err) {
    chain = { error: err instanceof Error ? err.message : String(err) };
  }

  let exposure:
    | { status: "configured"; authority: string; buckets: string[]; unpriceableBuckets: string[] }
    | { status: "unconfigured" }
    | { status: "error"; message: string } = { status: "unconfigured" };

  if (env.monad.authority && env.monad.tokenMap) {
    try {
      const snapshot = await fetchMonadExposure();
      exposure = {
        status: "configured",
        authority: snapshot.authority,
        buckets: Object.keys(snapshot.bucketExposure),
        unpriceableBuckets: snapshot.unpriceableBuckets,
      };
    } catch (err) {
      exposure = { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({
    ok: true,
    venue: "monad",
    rpc: env.monad.rpcUrl,
    chain,
    exposure,
  });
});
