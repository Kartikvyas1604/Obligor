/**
 * Batch desk-pair import for Monad parallel clearing.
 *
 * A single CSV/JSON upload describes many counterparty pairs at once. Each row
 * carries a pair id, the desk (A or B), the desk wallet, and one leg — so a
 * clearing desk can load an entire epoch's worth of pairs from their blotter.
 * Nothing is invented: every rejected row is reported with its row number and
 * every pair must have both desks present before it is accepted.
 */

import type { ChainId, PositionLeg } from "@/lib/margin";
import type { RawLegInput, PricedBook } from "@/lib/positions";
import { buildPricedBook } from "./import";
import { HEADER_ALIASES, normHeader, recordToLeg } from "./import";
import { parseCsv } from "./csv";

export type PairImportFormat = "csv" | "json" | "auto";

export interface PairImportRowError {
  /** 1-based data row (header is row 1), or JSON array index + 1. */
  row: number;
  message: string;
}

export interface ParsedPair {
  pairId: string;
  label: string;
  a: { wallet: string; legs: RawLegInput[] };
  b: { wallet: string; legs: RawLegInput[] };
}

export interface PairImportResult {
  pairs: ParsedPair[];
  errors: PairImportRowError[];
  format: "csv" | "json";
}

/** A pair resolved all the way through the oracle pricing pipeline. */
export interface PricedPair {
  pairId: string;
  label: string;
  aWallet: string;
  bWallet: string;
  a: PricedBook;
  b: PricedBook;
  warnings: string[];
}

const PAIR_HEADER_ALIASES: Record<string, string> = {
  ...HEADER_ALIASES,
  pair: "pairid",
  pairid: "pairid",
  pairname: "pairid",
  group: "pairid",
  groupid: "pairid",
  desk: "desk",
  deskid: "desk",
  party: "desk",
  book: "desk",
  account: "desk",
  wallet: "wallet",
  address: "wallet",
  pubkey: "wallet",
  label: "label",
  deskname: "label",
};

function toStr(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function canonicalRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const rec: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const canonical = PAIR_HEADER_ALIASES[normHeader(k)];
    rec[canonical ?? k] = v;
  }
  return rec;
}

function deskOf(rec: Record<string, unknown>): "A" | "B" | undefined {
  const d = toStr(rec.desk)?.toUpperCase();
  if (d === "A" || d === "B") return d;
  return undefined;
}

interface PairAccumulator {
  label?: string;
  a?: { wallet?: string; legs: RawLegInput[] };
  b?: { wallet?: string; legs: RawLegInput[] };
}

function finalize(
  accum: Map<string, PairAccumulator>,
  errors: PairImportRowError[],
): ParsedPair[] {
  const pairs: ParsedPair[] = [];
  for (const [pairId, acc] of accum) {
    const aWallet = acc.a?.wallet?.trim();
    const bWallet = acc.b?.wallet?.trim();
    if (!acc.a || acc.a.legs.length === 0) {
      errors.push({ row: 0, message: `pair "${pairId}" is missing desk A legs` });
      continue;
    }
    if (!acc.b || acc.b.legs.length === 0) {
      errors.push({ row: 0, message: `pair "${pairId}" is missing desk B legs` });
      continue;
    }
    if (!aWallet) {
      errors.push({ row: 0, message: `pair "${pairId}" desk A has no wallet` });
      continue;
    }
    if (!bWallet) {
      errors.push({ row: 0, message: `pair "${pairId}" desk B has no wallet` });
      continue;
    }
    pairs.push({
      pairId,
      label: acc.label ?? `Desk ${aWallet.slice(0, 4)} ↔ ${bWallet.slice(0, 4)}`,
      a: { wallet: aWallet, legs: acc.a.legs },
      b: { wallet: bWallet, legs: acc.b.legs },
    });
  }
  return pairs;
}

function csvToPairs(text: string): PairImportResult {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { pairs: [], errors: [{ row: 1, message: "empty CSV — no header row found" }], format: "csv" };
  }

  const header = rows[0].map(normHeader);
  const col = new Map<string, number>();
  header.forEach((h, i) => {
    const canonical = PAIR_HEADER_ALIASES[h];
    if (canonical && !col.has(canonical)) col.set(canonical, i);
  });

  const required = ["pairid", "desk", "wallet", "instrument", "bucket", "side"] as const;
  const missing = required.filter((r) => !col.has(r));
  if (missing.length > 0) {
    return {
      pairs: [],
      errors: [{ row: 1, message: `header missing required column(s): ${missing.join(", ")}` }],
      format: "csv",
    };
  }

  const accum = new Map<string, PairAccumulator>();
  const errors: PairImportRowError[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.every((c) => c.trim() === "")) continue;
    const raw: Record<string, unknown> = {};
    for (const [name, idx] of col) raw[name] = cells[idx];
    const rec = canonicalRecord(raw);

    const pairId = toStr(rec.pairid);
    if (!pairId) {
      errors.push({ row: r + 1, message: "missing pair id" });
      continue;
    }
    const desk = deskOf(rec);
    if (!desk) {
      errors.push({ row: r + 1, message: `invalid desk "${toStr(rec.desk) ?? ""}" (expected A or B)` });
      continue;
    }
    const wallet = toStr(rec.wallet);
    if (!wallet) {
      errors.push({ row: r + 1, message: "missing desk wallet" });
      continue;
    }
    const { leg, error } = recordToLeg(rec);
    if (!leg) {
      errors.push({ row: r + 1, message: error ?? "invalid leg" });
      continue;
    }

    let acc = accum.get(pairId);
    if (!acc) {
      acc = {};
      accum.set(pairId, acc);
    }
    if (!acc.label) acc.label = toStr(rec.label);
    const sideKey = desk === "A" ? "a" : "b";
    const existing = acc[sideKey];
    if (existing) {
      if (existing.wallet && existing.wallet !== wallet) {
        errors.push({
          row: r + 1,
          message: `desk ${desk} wallet "${wallet}" does not match earlier wallet for pair "${pairId}"`,
        });
        continue;
      }
      existing.wallet = wallet;
      existing.legs.push(leg);
    } else {
      acc[sideKey] = { wallet, legs: [leg] };
    }
  }

  return { pairs: finalize(accum, errors), errors, format: "csv" };
}

function jsonToPairs(text: string): PairImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      pairs: [],
      errors: [{ row: 1, message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` }],
      format: "json",
    };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { pairs?: unknown }).pairs)
      ? (parsed as { pairs: unknown[] }).pairs
      : null;

  if (!list) {
    return {
      pairs: [],
      errors: [{ row: 1, message: "expected a JSON array of pairs, or an object with a pairs array" }],
      format: "json",
    };
  }

  const pairs: ParsedPair[] = [];
  const errors: PairImportRowError[] = [];

  list.forEach((item, i) => {
    const row = i + 1;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push({ row, message: "pair must be an object" });
      return;
    }
    const p = item as Record<string, unknown>;
    const pairId = toStr(p.pairId ?? p.pair ?? p.id);
    if (!pairId) {
      errors.push({ row, message: "missing pairId" });
      return;
    }
    const readDesk = (side: "a" | "b"): { wallet: string; legs: RawLegInput[] } | { error: string } => {
      const desk = p[side] ?? p[side.toUpperCase()];
      if (!desk || typeof desk !== "object") return { error: `missing desk ${side.toUpperCase()}` };
      const d = desk as Record<string, unknown>;
      const wallet = toStr(d.wallet ?? d.address);
      if (!wallet) return { error: `desk ${side.toUpperCase()} has no wallet` };
      const legList = d.legs;
      if (!Array.isArray(legList) || legList.length === 0) {
        return { error: `desk ${side.toUpperCase()} has no legs` };
      }
      const legs: RawLegInput[] = [];
      for (let j = 0; j < legList.length; j++) {
        const legItem = legList[j];
        if (!legItem || typeof legItem !== "object" || Array.isArray(legItem)) {
          return { error: `desk ${side.toUpperCase()} leg ${j + 1} must be an object` };
        }
        const rec = canonicalRecord(legItem as Record<string, unknown>);
        const { leg, error } = recordToLeg(rec);
        if (!leg) return { error: `desk ${side.toUpperCase()} leg ${j + 1}: ${error ?? "invalid leg"}` };
        legs.push(leg);
      }
      return { wallet, legs };
    };

    const a = readDesk("a");
    if ("error" in a) {
      errors.push({ row, message: a.error });
      return;
    }
    const b = readDesk("b");
    if ("error" in b) {
      errors.push({ row, message: b.error });
      return;
    }
    pairs.push({
      pairId,
      label: toStr(p.label) ?? `Desk ${a.wallet.slice(0, 4)} ↔ ${b.wallet.slice(0, 4)}`,
      a,
      b,
    });
  });

  return { pairs, errors, format: "json" };
}

export function detectPairFormat(text: string): "csv" | "json" {
  const t = text.trimStart();
  return t.startsWith("{") || t.startsWith("[") ? "json" : "csv";
}

export function parsePairsImport(text: string, format: PairImportFormat = "auto"): PairImportResult {
  const fmt = format === "auto" ? detectPairFormat(text) : format;
  return fmt === "json" ? jsonToPairs(text) : csvToPairs(text);
}

/**
 * Resolve every parsed pair through the oracle pricing pipeline (same Pyth
 * marks and venue verification as the single-book path). Fails loudly if a book
 * cannot be priced rather than emitting a half-priced pair.
 */
export async function buildPricedPairs(pairs: ParsedPair[], chain: ChainId): Promise<PricedPair[]> {
  return Promise.all(
    pairs.map(async (pair) => {
      const [a, b] = await Promise.all([
        buildPricedBook("A", pair.a.wallet, chain, pair.a.legs),
        buildPricedBook("B", pair.b.wallet, chain, pair.b.legs),
      ]);
      return {
        pairId: pair.pairId,
        label: pair.label,
        aWallet: pair.a.wallet,
        bWallet: pair.b.wallet,
        a,
        b,
        warnings: [...a.warnings, ...b.warnings],
      };
    }),
  );
}

/** Minimal leg shape accepted by the parallel clearing endpoint. */
export function toParallelLegs(book: PricedBook): Array<Pick<PositionLeg, "venue" | "instrument" | "bucket" | "side" | "qty" | "markUsd">> {
  return book.legs.map((l) => ({
    venue: l.venue,
    instrument: l.instrument,
    bucket: l.bucket,
    side: l.side,
    qty: l.qty,
    markUsd: l.markUsd,
  }));
}
