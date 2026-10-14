import { NextResponse } from "next/server";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import { makeLogger } from "@/lib/logger";
import { bookSchema, buildPricedBook, parseBookImport } from "@/lib/scanner/import";

const log = makeLogger("positions-import");

/**
 * POST /api/v1/positions/import
 * Convert an institutional CSV/JSON holdings file into a validated, oracle-
 * priced book. Rejected rows are returned with their row numbers — the server
 * never silently drops or invents positions. This is ingestion, not clearing:
 * it does not net anything and takes no payment.
 */
export const POST = withApi(async ({ req }) => {
  const headers = rateLimitFor("compute", req);
  const raw = await readJsonBody(req);
  const body = parseBody(bookSchema, raw);

  const party = body.party ?? "A";
  const chain = body.chain ?? "solana";

  const parsed = parseBookImport(body.data, body.format ?? "auto");

  if (parsed.errors.length > 0) {
    log.info("import rejected", { format: parsed.format, rows: parsed.errors.length });
    return NextResponse.json(
      {
        ok: false,
        error: "IMPORT_INVALID",
        format: parsed.format,
        message:
          "Some rows could not be parsed. Fix the reported rows and re-upload — Obligor will not import a partial book silently.",
        acceptedRows: parsed.legs.length,
        errors: parsed.errors,
      },
      { status: 422, headers },
    );
  }

  if (parsed.legs.length === 0) {
    throw ApiError.badRequest("no position rows found in upload");
  }

  const priced = await buildPricedBook(party, body.wallet, chain, parsed.legs);

  log.info("import priced", {
    format: parsed.format,
    party,
    rows: priced.legs.length,
  });

  return NextResponse.json({
    ok: true,
    format: parsed.format,
    party,
    wallet: body.wallet,
    chain,
    rowCount: priced.legs.length,
    warnings: priced.warnings,
    book: {
      party,
      label: `Party ${party}`,
      wallet: body.wallet,
      chain,
      legs: priced.legs,
      warnings: priced.warnings,
    },
    disclaimer:
      "Imported and oracle-priced for this desk only. Marks are corrected against live Pyth with deviations flagged. Not investment advice.",
  }, { headers });
});
