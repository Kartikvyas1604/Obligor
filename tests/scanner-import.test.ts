/**
 * Institutional book importer tests: CSV/JSON parsing, row-level error
 * reporting, alias mapping, and the oracle-priced book builder (offline
 * fallback path via a stubbed fetch).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../lib/scanner/csv";
import { buildPricedBook, detectFormat, parseBookImport } from "../lib/scanner/import";

test("parseCsv handles quotes, embedded commas and newlines", () => {
  const rows = parseCsv('a,b,c\n"x,1","y\n2",z\n');
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["x,1", "y\n2", "z"],
  ]);
});

test("parseCsv handles escaped quotes and CRLF", () => {
  const rows = parseCsv('h1,h2\r\n"he said ""hi""",2\r\n');
  assert.deepEqual(rows, [
    ["h1", "h2"],
    ['he said "hi"', "2"],
  ]);
});

test("parseCsv rejects an unterminated quote", () => {
  assert.throws(() => parseCsv('a,"b'), /unterminated quoted field/);
});

test("detectFormat sniffs JSON vs CSV", () => {
  assert.equal(detectFormat(' [ {"a":1} ]'), "json");
  assert.equal(detectFormat('{"legs":[]}'), "json");
  assert.equal(detectFormat("bucket,side\nSOL,long"), "csv");
});

test("parseBookImport maps a CSV book into valid legs", () => {
  const csv = [
    "instrument,bucket,side,qty,markUsd,venue",
    "SOL-PERP,SOL,long,100,150,drift",
    "USDC-lend,USD,lend,50000,1,kamino",
  ].join("\n");
  const r = parseBookImport(csv);
  assert.equal(r.format, "csv");
  assert.equal(r.errors.length, 0);
  assert.equal(r.legs.length, 2);
  assert.equal(r.legs[0].venue, "drift");
  assert.equal(r.legs[0].bucket, "SOL");
  assert.equal(r.legs[1].venue, "kamino");
});

test("parseBookImport derives qty from notional + mark when qty is absent", () => {
  const csv = ["instrument,bucket,side,notionalUsd,markUsd", "SOL-PERP,SOL,long,15000,150"].join("\n");
  const r = parseBookImport(csv);
  assert.equal(r.errors.length, 0);
  assert.equal(r.legs[0].qty, 100);
});

test("parseBookImport reports invalid rows with row numbers and keeps valid ones", () => {
  const csv = [
    "instrument,bucket,side,qty,markUsd",
    "SOL-PERP,SOL,long,10,150",
    "BAD,SOL,sideways,10,150",
    "OK-BTC,BTC,short,1,60000",
  ].join("\n");
  const r = parseBookImport(csv);
  assert.equal(r.legs.length, 2);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].row, 3);
  assert.match(r.errors[0].message, /invalid side/);
});

test("parseBookImport fails loudly when a required header is missing", () => {
  const csv = ["instrument,qty,markUsd", "SOL-PERP,10,150"].join("\n");
  const r = parseBookImport(csv);
  assert.equal(r.legs.length, 0);
  assert.match(r.errors[0].message, /header missing required column/);
});

test("parseBookImport accepts a JSON array with alias keys", () => {
  const json = JSON.stringify([
    { symbol: "SOL-PERP", riskBucket: "SOL", direction: "long", size: 10, price: 150, venue: "drift" },
  ]);
  const r = parseBookImport(json);
  assert.equal(r.format, "json");
  assert.equal(r.errors.length, 0);
  assert.equal(r.legs[0].instrument, "SOL-PERP");
  assert.equal(r.legs[0].bucket, "SOL");
  assert.equal(r.legs[0].qty, 10);
  assert.equal(r.legs[0].side, "long");
});

test("parseBookImport accepts a JSON object with a legs array and reports bad items", () => {
  const json = JSON.stringify({
    legs: [
      { instrument: "BTC-PERP", bucket: "btc", side: "short", qty: 1, markUsd: 60000 },
      { instrument: "NOPE", bucket: "SOL", side: "long" }, // missing qty+mark
    ],
  });
  const r = parseBookImport(json);
  assert.equal(r.legs.length, 1);
  assert.equal(r.legs[0].bucket, "BTC");
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].row, 2);
});

test("parseBookImport reports malformed JSON", () => {
  const r = parseBookImport("{not json");
  assert.equal(r.legs.length, 0);
  assert.match(r.errors[0].message, /invalid JSON/);
});

test("buildPricedBook prices an imported book via the offline desk-mark fallback", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network disabled in test");
  }) as typeof fetch;
  try {
    const legs = parseBookImport(
      ["instrument,bucket,side,qty,markUsd,venue", "SOL-PERP,SOL,long,100,150,drift"].join("\n"),
    ).legs;
    const priced = await buildPricedBook("A", "wallet-import-test-0000000000000000000000000", "solana", legs);
    assert.equal(priced.legs.length, 1);
    assert.equal(priced.legs[0].venue, "drift");
    // Hermes is unreachable, so the labeled fallback mark (SOL=142.5) is
    // applied and surfaced — never silently replaced with desk data.
    assert.equal(priced.legs[0].notionalUsd, 14250);
    assert.ok(priced.warnings.some((w) => /Oracle mark for SOL is fallback/.test(w)));
    assert.ok(priced.warnings.some((w) => /venue drift: no subaccount linked/.test(w)));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("buildPricedBook rejects an empty book", async () => {
  await assert.rejects(() => buildPricedBook("A", "wallet", "solana", []), /no legs to price/);
});
