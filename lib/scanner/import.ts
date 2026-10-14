/**
 * Institutional book import: CSV / JSON → validated RawLegInput[] → an
 * oracle-priced PositionBook. This is the ingestion front door for desks that
 * already hold positions elsewhere; it never invents legs, and every rejected
 * row is reported with its row number rather than silently dropped.
 */

import { z } from "zod";
import { rawLegSchema, type RawLegInput, type PricedBook, priceAndNormalizeLegsWithVenueCheck } from "@/lib/positions";
import type { ChainId, NettingPartyId, Side } from "@/lib/margin";
import { parseCsv } from "./csv";

export type ImportFormat = "csv" | "json" | "auto";

export interface ImportRowError {
  /** 1-based data row (header is row 1), or the JSON array index + 1. */
  row: number;
  message: string;
}

export interface ImportResult {
  legs: RawLegInput[];
  errors: ImportRowError[];
  /** Detected/used format. */
  format: "csv" | "json";
}

const SIDES: ReadonlySet<Side> = new Set(["long", "short", "lend", "borrow"]);

const VENUES = new Set(["drift", "kamino", "mock_equity", "monad_fixture", "manual"]);

const HEADER_ALIASES: Record<string, string> = {
  venue: "venue",
  instrument: "instrument",
  symbol: "instrument",
  instrumentid: "instrument",
  bucket: "bucket",
  riskbucket: "bucket",
  side: "side",
  direction: "side",
  qty: "qty",
  quantity: "qty",
  size: "qty",
  units: "qty",
  markusd: "markusd",
  mark: "markusd",
  price: "markusd",
  priceusd: "markusd",
  notionalusd: "notionalusd",
  notional: "notionalusd",
  notionalvalue: "notionalusd",
  valueusd: "notionalusd",
  haircut: "haircut",
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function toNumber(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const s = String(v).trim().replace(/[$,]/g, "");
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function toStr(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

/**
 * Map a loose record (string cells from CSV, or JSON object) to a RawLegInput.
 * Accepts either qty+markUsd, or notionalUsd+one of them (the other is derived).
 */
function recordToLeg(rec: Record<string, unknown>): { leg?: RawLegInput; error?: string } {
  const instrument = toStr(rec.instrument);
  const bucket = toStr(rec.bucket)?.toUpperCase();
  const sideRaw = toStr(rec.side)?.toLowerCase();
  const venueRaw = (toStr(rec.venue)?.toLowerCase() ?? "manual");

  if (!instrument) return { error: "missing instrument" };
  if (!bucket) return { error: "missing bucket" };
  if (!sideRaw) return { error: "missing side" };
  if (!SIDES.has(sideRaw as Side)) {
    return { error: `invalid side "${sideRaw}" (expected long|short|lend|borrow)` };
  }
  if (!VENUES.has(venueRaw)) {
    return { error: `invalid venue "${venueRaw}" (expected drift|kamino|mock_equity|monad_fixture|manual)` };
  }

  let qty = toNumber(rec.qty);
  let markUsd = toNumber(rec.markusd);
  const notionalUsd = toNumber(rec.notionalusd);

  if (qty === undefined && notionalUsd !== undefined && markUsd !== undefined && markUsd !== 0) {
    qty = notionalUsd / markUsd;
  }
  if (markUsd === undefined && notionalUsd !== undefined && qty !== undefined && qty !== 0) {
    markUsd = notionalUsd / qty;
  }

  if (qty === undefined) {
    return { error: "missing qty (provide qty, or notionalUsd together with a nonzero mark)" };
  }
  if (markUsd === undefined) {
    return { error: "missing mark (provide markUsd, or notionalUsd together with qty)" };
  }

  const candidate: Record<string, unknown> = {
    venue: venueRaw,
    instrument,
    bucket,
    side: sideRaw,
    qty,
    markUsd,
  };
  const haircut = toNumber(rec.haircut);
  if (haircut !== undefined) candidate.haircut = haircut;

  const parsed = rawLegSchema.safeParse(candidate);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "leg"}: ${i.message}`).join("; ");
    return { error: msg };
  }
  return { leg: parsed.data };
}

function csvToLegs(text: string): ImportResult {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { legs: [], errors: [{ row: 1, message: "empty CSV — no header row found" }], format: "csv" };
  }

  const header = rows[0].map(normHeader);
  const col = new Map<string, number>();
  header.forEach((h, i) => {
    const canonical = HEADER_ALIASES[h];
    if (canonical && !col.has(canonical)) col.set(canonical, i);
  });

  const required = ["instrument", "bucket", "side"] as const;
  const missing = required.filter((r) => !col.has(r));
  if (missing.length > 0) {
    return {
      legs: [],
      errors: [{ row: 1, message: `header missing required column(s): ${missing.join(", ")}` }],
      format: "csv",
    };
  }

  const legs: RawLegInput[] = [];
  const errors: ImportRowError[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const rec: Record<string, unknown> = {};
    for (const [name, idx] of col) rec[name] = cells[idx];
    const { leg, error } = recordToLeg(rec);
    if (leg) legs.push(leg);
    else errors.push({ row: r + 1, message: error ?? "invalid row" });
  }
  return { legs, errors, format: "csv" };
}

function jsonToLegs(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      legs: [],
      errors: [{ row: 1, message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` }],
      format: "json",
    };
  }

  let list: unknown[];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { legs?: unknown }).legs)) {
    list = (parsed as { legs: unknown[] }).legs;
  } else {
    return {
      legs: [],
      errors: [{ row: 1, message: "expected a JSON array of legs, or an object with a legs array" }],
      format: "json",
    };
  }

  const legs: RawLegInput[] = [];
  const errors: ImportRowError[] = [];
  list.forEach((item, i) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push({ row: i + 1, message: "leg must be an object" });
      return;
    }
    // Normalize known aliases so JSON accepts the same vocabulary as CSV.
    const raw = item as Record<string, unknown>;
    const rec: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      const canonical = HEADER_ALIASES[normHeader(k)];
      rec[canonical ?? k] = v;
    }
    const { leg, error } = recordToLeg(rec);
    if (leg) legs.push(leg);
    else errors.push({ row: i + 1, message: error ?? "invalid leg" });
  });
  return { legs, errors, format: "json" };
}

export function detectFormat(text: string): "csv" | "json" {
  const t = text.trimStart();
  return t.startsWith("{") || t.startsWith("[") ? "json" : "csv";
}

export function parseBookImport(text: string, format: ImportFormat = "auto"): ImportResult {
  const fmt = format === "auto" ? detectFormat(text) : format;
  return fmt === "json" ? jsonToLegs(text) : csvToLegs(text);
}

/**
 * Price an imported book through the same oracle pipeline as the compute path.
 * Venue verification (Drift/Kamino/Monad) runs too, so imported legs carry the
 * same provenance and warnings as manually-entered ones.
 */
export async function buildPricedBook(
  party: NettingPartyId,
  wallet: string,
  chain: ChainId,
  legs: RawLegInput[],
): Promise<PricedBook> {
  if (legs.length === 0) {
    throw new Error("buildPricedBook: no legs to price");
  }
  return priceAndNormalizeLegsWithVenueCheck(party, legs, { source: "manual" });
}

const bookSchema = z.object({
  format: z.enum(["csv", "json", "auto"]).optional(),
  party: z.enum(["A", "B", "C"]).optional(),
  wallet: z.string().trim().min(32).max(64),
  chain: z.enum(["solana", "monad"]).optional(),
  data: z.string().min(1).max(200_000),
});

export type ImportBookRequest = z.infer<typeof bookSchema>;
export { bookSchema };
