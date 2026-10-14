/**
 * Batch desk-pair importer for Monad parallel clearing: grouping, validation,
 * priced output, and the leg projection the parallel endpoint consumes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPricedPairs,
  detectPairFormat,
  parsePairsImport,
  toParallelLegs,
} from "../lib/scanner/pairs";

const WALLET_A = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const WALLET_B = "3BhLGpKkfirMtcC7LEmVAZ3f9sv5VMspD6MKAtd1Wq6aY";
const WALLET_C = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS";
const WALLET_D = "5yzwEtvhBAoVJZaWuN9MbJz2s34m5Nz3ZMiWDAfP8wkr";

const CSV = [
  "pair,desk,wallet,venue,instrument,bucket,side,qty,markUsd",
  `p1,A,${WALLET_A},manual,MON lend,MON,lend,70000,1`,
  `p1,B,${WALLET_B},manual,MON-PERP,MON,short,75000,1`,
  `p2,A,${WALLET_C},manual,ETH long,ETH,long,20,1`,
  `p2,B,${WALLET_D},manual,ETH-PERP,ETH,short,20,1`,
].join("\n");

test("detectPairFormat distinguishes JSON from CSV", () => {
  assert.equal(detectPairFormat("  [ {\"a\":1} ]"), "json");
  assert.equal(detectPairFormat("pair,desk,wallet"), "csv");
});

test("CSV batch parses and groups pairs", () => {
  const res = parsePairsImport(CSV);
  assert.equal(res.errors.length, 0);
  assert.equal(res.format, "csv");
  assert.equal(res.pairs.length, 2);
  const p1 = res.pairs.find((p) => p.pairId === "p1")!;
  assert.equal(p1.a.wallet, WALLET_A);
  assert.equal(p1.b.wallet, WALLET_B);
  assert.equal(p1.a.legs.length, 1);
  assert.equal(p1.a.legs[0].instrument, "MON lend");
  assert.equal(p1.a.legs[0].side, "lend");
});

test("CSV row errors carry their row number", () => {
  const bad = [
    "pair,desk,wallet,venue,instrument,bucket,side,qty,markUsd",
    `p1,A,${WALLET_A},manual,MON lend,MON,lend,70000,1`,
    `p1,Z,${WALLET_B},manual,MON-PERP,MON,short,75000,1`,
  ].join("\n");
  const res = parsePairsImport(bad);
  assert.ok(res.errors.some((e) => e.row === 3 && /invalid desk/i.test(e.message)));
});

test("a pair missing one desk is rejected", () => {
  const oneSided = [
    "pair,desk,wallet,venue,instrument,bucket,side,qty,markUsd",
    `p1,A,${WALLET_A},manual,MON lend,MON,lend,70000,1`,
  ].join("\n");
  const res = parsePairsImport(oneSided);
  assert.equal(res.pairs.length, 0);
  assert.ok(res.errors.some((e) => /missing desk B/i.test(e.message)));
});

test("conflicting wallets for the same desk/pair are rejected", () => {
  const conflict = [
    "pair,desk,wallet,venue,instrument,bucket,side,qty,markUsd",
    `p1,A,${WALLET_A},manual,MON lend,MON,lend,70000,1`,
    `p1,A,${WALLET_C},manual,ETH long,ETH,long,60000,1`,
    `p1,B,${WALLET_B},manual,MON-PERP,MON,short,75000,1`,
  ].join("\n");
  const res = parsePairsImport(conflict);
  assert.ok(res.errors.some((e) => /does not match earlier wallet/i.test(e.message)));
});

test("empty CSV reports a header error", () => {
  const res = parsePairsImport("");
  assert.equal(res.pairs.length, 0);
  assert.ok(res.errors.length > 0);
});

test("JSON batch parses desk pairs with alias fields", () => {
  const json = JSON.stringify({
    pairs: [
      {
        pairId: "p1",
        a: { address: WALLET_A, legs: [{ instrument: "MON lend", bucket: "MON", side: "lend", size: 70000, price: 1 }] },
        b: { wallet: WALLET_B, legs: [{ instrument: "MON-PERP", bucket: "MON", direction: "short", quantity: 75000, mark: 1 }] },
      },
    ],
  });
  const res = parsePairsImport(json, "auto");
  assert.equal(res.format, "json");
  assert.equal(res.errors.length, 0);
  assert.equal(res.pairs.length, 1);
  assert.equal(res.pairs[0].a.wallet, WALLET_A);
  assert.equal(res.pairs[0].b.legs[0].side, "short");
});

test("JSON pair without an id is rejected", () => {
  const json = JSON.stringify([
    { a: { wallet: WALLET_A, legs: [{ instrument: "X", bucket: "SOL", side: "long", qty: 1, markUsd: 1 }] }, b: { wallet: WALLET_B, legs: [] } },
  ]);
  const res = parsePairsImport(json, "json");
  assert.equal(res.pairs.length, 0);
  assert.ok(res.errors.some((e) => /missing pairId/i.test(e.message)));
});

test("buildPricedPairs prices every leg and toParallelLegs projects the minimal shape", async () => {
  const res = parsePairsImport(CSV);
  const priced = await buildPricedPairs(res.pairs, "monad");
  assert.equal(priced.length, 2);
  const p1 = priced[0];
  assert.equal(p1.a.legs.length, 1);
  assert.ok(p1.a.legs[0].notionalUsd > 0);
  const projected = toParallelLegs(p1.a);
  assert.deepEqual(Object.keys(projected[0]).sort(), ["bucket", "instrument", "markUsd", "qty", "side", "venue"].sort());
});
