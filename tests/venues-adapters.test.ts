/**
 * Live venue adapter tests (Kamino Portfolio API + Monad EVM JSON-RPC).
 * Network is stubbed with a fake fetch so parsing, mapping, and loud-failure
 * behaviour are exercised deterministically. No fixtures are substituted for
 * real venue data anywhere in the adapters.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchKaminoPortfolio,
  fetchKaminoVenuePrice,
  kaminoSymbolToBucket,
} from "../lib/adapters/kamino";
import {
  fetchMonadChainState,
  fetchMonadErc20Balance,
  fetchMonadNativeBalance,
  parseMonadTokenMap,
} from "../lib/adapters/monad";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

// --- Kamino symbol mapping -------------------------------------------------

test("kaminoSymbolToBucket maps stables, perps and equities", () => {
  assert.equal(kaminoSymbolToBucket("USDC"), "USD");
  assert.equal(kaminoSymbolToBucket("USDT"), "USD");
  assert.equal(kaminoSymbolToBucket("SOL"), "SOL");
  assert.equal(kaminoSymbolToBucket("JitoSOL"), "SOL");
  assert.equal(kaminoSymbolToBucket("mSOL"), "SOL");
  assert.equal(kaminoSymbolToBucket("WBTC"), "BTC");
  assert.equal(kaminoSymbolToBucket("cbBTC"), "BTC");
  assert.equal(kaminoSymbolToBucket("WETH"), "ETH");
  assert.equal(kaminoSymbolToBucket("tAAPL"), "AAPL");
  assert.equal(kaminoSymbolToBucket("BONK"), null);
});

// --- Kamino venue mark ------------------------------------------------------

test("fetchKaminoVenuePrice rejects an unsupported bucket", async () => {
  await assert.rejects(() => fetchKaminoVenuePrice("DOGE"), /KAMINO_UNSUPPORTED_BUCKET/);
});

// --- Kamino portfolio parsing ----------------------------------------------

const portfolioPayload = {
  timestamp: "2026-01-01T00:00:00Z",
  lending: [
    {
      obligation: "oblig1",
      market: "market1",
      tag: "Vanilla",
      netValue: "1000.5",
      totalDepositValue: "3000",
      totalBorrowValue: "1999.5",
      ltv: "0.38",
      liquidationLtv: "0.8",
      deposits: [
        { mint: "mSOL", symbol: "SOL", value: "3000", amount: "20" },
      ],
      borrows: [
        { mint: "mUSDC", symbol: "USDC", value: "1999.5", amount: "1999.5" },
      ],
    },
  ],
  multiply: [
    {
      obligation: "oblig2",
      tag: "Multiply",
      netValue: "500",
      deposits: [{ mint: "mBTC", symbol: "WBTC", value: "2000" }],
      borrows: [{ mint: "mETH", symbol: "WETH", value: "1500" }],
    },
  ],
  leverage: [],
  unknownSection: [{ ignored: true }],
};

test("fetchKaminoPortfolio parses obligations and computes per-bucket net exposure", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => jsonResponse(portfolioPayload)) as typeof fetch;
  try {
    const pf = await fetchKaminoPortfolio("walletKaminoParse1");
    assert.equal(pf.obligations.length, 2);
    assert.equal(pf.obligations[0].netValueUsd, 1000.5);
    // SOL deposit 3000, USD borrow -1999.5, BTC deposit +2000, ETH borrow -1500.
    assert.equal(pf.bucketExposure.SOL, 3000);
    assert.equal(pf.bucketExposure.USD, -1999.5);
    assert.equal(pf.bucketExposure.BTC, 2000);
    assert.equal(pf.bucketExposure.ETH, -1500);
    assert.deepEqual(pf.unmappedSymbols, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchKaminoPortfolio surfaces unmapped on-chain symbols", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    jsonResponse({
      lending: [
        {
          obligation: "o",
          deposits: [{ mint: "mBONK", symbol: "BONK", value: "123" }],
          borrows: [],
        },
      ],
    })) as typeof fetch;
  try {
    const pf = await fetchKaminoPortfolio("walletKaminoUnmapped");
    assert.deepEqual(pf.unmappedSymbols, ["BONK"]);
    assert.deepEqual(pf.bucketExposure, {});
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchKaminoPortfolio fails loudly on a non-ok API response", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => jsonResponse({}, 503)) as typeof fetch;
  try {
    await assert.rejects(() => fetchKaminoPortfolio("walletKaminoDown"), /KAMINO_OFFLINE/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchKaminoPortfolio requires a wallet when unconfigured", async () => {
  await assert.rejects(() => fetchKaminoPortfolio(""), /KAMINO_NOT_CONFIGURED/);
});

// --- Monad token map parsing ------------------------------------------------

test("parseMonadTokenMap accepts string and object entries, 18 decimals default", () => {
  const specs = parseMonadTokenMap(
    JSON.stringify({
      SOL: "0x1111111111111111111111111111111111111111",
      USD: { address: "0x2222222222222222222222222222222222222222", decimals: 6 },
    }),
  );
  assert.equal(specs.length, 2);
  const sol = specs.find((s) => s.bucket === "SOL");
  const usd = specs.find((s) => s.bucket === "USD");
  assert.equal(sol?.decimals, 18);
  assert.equal(usd?.decimals, 6);
});

test("parseMonadTokenMap is loud on malformed input", () => {
  assert.throws(() => parseMonadTokenMap("{not json"), /MONAD_TOKEN_MAP_INVALID/);
  assert.throws(() => parseMonadTokenMap(JSON.stringify(["a"])), /MONAD_TOKEN_MAP_INVALID/);
  assert.throws(() => parseMonadTokenMap(JSON.stringify({ SOL: { decimals: 9 } })), /MONAD_TOKEN_MAP_INVALID/);
  assert.equal(parseMonadTokenMap("").length, 0);
});

// --- Monad JSON-RPC ---------------------------------------------------------

function rpcFetch(result: string, capture?: (body: unknown) => void): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    if (init?.body && capture) capture(JSON.parse(init.body as string));
    return jsonResponse({ jsonrpc: "2.0", id: 1, result });
  }) as unknown as typeof fetch;
}

test("fetchMonadChainState reads chain id and head block", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string) as { method: string };
    calls++;
    return jsonResponse({ jsonrpc: "2.0", id: 1, result: body.method === "eth_chainId" ? "0x279f" : "0x1234" });
  }) as unknown as typeof fetch;
  try {
    const state = await fetchMonadChainState();
    assert.equal(state.chainId, 10143);
    assert.equal(state.blockNumber, 0x1234);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchMonadErc20Balance encodes balanceOf(address) correctly", async () => {
  const realFetch = globalThis.fetch;
  let seen: { method: string; params: unknown[] } | undefined;
  globalThis.fetch = rpcFetch(
    "0x0000000000000000000000000000000000000000000000000000000000000064", // 100
    (b) => (seen = b as { method: string; params: unknown[] }),
  );
  try {
    const balance = await fetchMonadErc20Balance(
      "0x1111111111111111111111111111111111111111",
      "0xabc0000000000000000000000000000000000abc",
    );
    assert.equal(balance, BigInt(100));
    assert.equal(seen?.method, "eth_call");
    const call = seen?.params[0] as { to: string; data: string };
    assert.equal(call.to, "0x1111111111111111111111111111111111111111");
    assert.ok(call.data.startsWith("0x70a08231"));
    assert.equal(call.data.length, 2 + 8 + 64);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchMonadErc20Balance returns 0 on empty data", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = rpcFetch("0x");
  try {
    const balance = await fetchMonadErc20Balance(
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
    );
    assert.equal(balance, BigInt(0));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchMonadNativeBalance converts wei to MON", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = rpcFetch("0xde0b6b3a7640000"); // 1e18
  try {
    assert.equal(await fetchMonadNativeBalance("0xabc"), 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("monad RPC surfaces an error object loudly", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    jsonResponse({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "method not found" } })) as typeof fetch;
  try {
    await assert.rejects(() => fetchMonadChainState(), /MONAD_UNEXPECTED_RESPONSE/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
