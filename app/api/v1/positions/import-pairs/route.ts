import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import { makeLogger } from "@/lib/logger";
import { buildPricedPairs, parsePairsImport } from "@/lib/scanner/pairs";
import { toParallelLegs } from "@/lib/scanner/pairs";

const log = makeLogger("positions-import-pairs");

const pairBatchSchema = z.object({
  format: z.enum(["csv", "json", "auto"]).optional(),
  chain: z.enum(["solana", "monad"]).default("monad"),
  data: z.string().min(1).max(500_000),
});

/**
 * POST /api/v1/positions/import-pairs
 * Parse a batch blotter of desk pairs (CSV/JSON) and oracle-price every leg.
 * Returns the pairs in the exact shape the parallel clearing epoch accepts.
 * Rejected rows are reported with their row numbers; no pair is half-imported.
 */
export const POST = withApi(async ({ req }) => {
  const headers = rateLimitFor("compute", req);
  const body = parseBody(pairBatchSchema, await readJsonBody(req));

  const parsed = parsePairsImport(body.data, body.format ?? "auto");

  if (parsed.errors.length > 0) {
    log.info("pair import rejected", { format: parsed.format, errors: parsed.errors.length });
    return NextResponse.json(
      {
        ok: false,
        error: "IMPORT_INVALID",
        format: parsed.format,
        message:
          "Some rows or pairs could not be parsed. Fix the reported rows and re-upload — Obligor will not import a partial epoch silently.",
        acceptedPairs: parsed.pairs.length,
        errors: parsed.errors,
      },
      { status: 422, headers },
    );
  }

  if (parsed.pairs.length === 0) {
    throw ApiError.badRequest("no desk pairs found in upload");
  }

  const chain = body.chain ?? "monad";
  const priced = await buildPricedPairs(parsed.pairs, chain);

  log.info("pair batch priced", { format: parsed.format, pairs: priced.length });

  return NextResponse.json(
    {
      ok: true,
      format: parsed.format,
      chain,
      pairCount: priced.length,
      pairs: priced.map((p) => ({
        pairId: p.pairId,
        label: p.label,
        warnings: p.warnings,
        a: {
          wallet: p.aWallet,
          chain,
          legs: p.a.legs,
          parallelLegs: toParallelLegs(p.a),
        },
        b: {
          wallet: p.bWallet,
          chain,
          legs: p.b.legs,
          parallelLegs: toParallelLegs(p.b),
        },
      })),
      disclaimer:
        "Every leg is oracle-priced against live Pyth marks. Batches with fewer than three pairs cannot run a parallel clearing epoch.",
    },
    { headers },
  );
});
