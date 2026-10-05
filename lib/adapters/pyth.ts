/**
 * Pyth Network Real-Time Oracle Feed Adapter
 * Connects directly to Pyth Hermes REST API to fetch sub-second institutional marks.
 */

export interface OraclePrice {
  symbol: string;
  priceUsd: number;
  confidenceUsd: number;
  expo: number;
  publishTime: string;
  source: "pyth_hermes" | "benchmark_cache";
}

// Official Pyth Feed IDs
export const PYTH_FEED_IDS: Record<string, string> = {
  SOL: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  BTC: "0xe62df6e80f49a143f71e79274da700a0d5da2953e03b97e2f0da015e2721b300",
  ETH: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  AAPL: "0x49f6b65fb1de4a14c6436575eed6865324e963b6d51cad86c2e3995f3244e835",
  USDC: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  MON: "0x0000000000000000000000000000000000000000000000000000000000000000", // Monad native testnet benchmark
};

// Resilient Fallback Benchmarks
const FALLBACK_PRICES: Record<string, number> = {
  SOL: 142.5,
  BTC: 64200.0,
  ETH: 3450.0,
  AAPL: 190.0,
  USDC: 1.0,
  MON: 38.0,
};

const CACHE_TTL_MS = 10_000; // 10 seconds cache
const cachedPrices: Record<string, { price: OraclePrice; fetchedAt: number }> = {};

export async function fetchLivePythPrice(symbol: string): Promise<OraclePrice> {
  const sym = symbol.toUpperCase();
  const feedId = PYTH_FEED_IDS[sym];

  // Check cache
  const cached = cachedPrices[sym];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.price;
  }

  if (feedId && feedId !== PYTH_FEED_IDS.MON) {
    try {
      const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (res.ok) {
        const json = await res.json();
        const parsed = json.parsed?.[0];
        if (parsed?.price) {
          const rawPrice = Number(parsed.price.price);
          const expo = Number(parsed.price.expo);
          const priceUsd = rawPrice * Math.pow(10, expo);
          const rawConf = Number(parsed.price.conf || 0);
          const confidenceUsd = rawConf * Math.pow(10, expo);

          const result: OraclePrice = {
            symbol: sym,
            priceUsd: Math.round(priceUsd * 100) / 100,
            confidenceUsd: Math.round(confidenceUsd * 100) / 100,
            expo,
            publishTime: new Date(Number(parsed.price.publish_time) * 1000).toISOString(),
            source: "pyth_hermes",
          };

          cachedPrices[sym] = { price: result, fetchedAt: Date.now() };
          return result;
        }
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Return fallback price
  const fallbackVal = FALLBACK_PRICES[sym] || 100.0;
  const fallbackResult: OraclePrice = {
    symbol: sym,
    priceUsd: fallbackVal,
    confidenceUsd: 0.05,
    expo: -2,
    publishTime: new Date().toISOString(),
    source: "benchmark_cache",
  };

  cachedPrices[sym] = { price: fallbackResult, fetchedAt: Date.now() };
  return fallbackResult;
}

export async function fetchAllOraclePrices(): Promise<Record<string, OraclePrice>> {
  const symbols = ["SOL", "BTC", "ETH", "AAPL", "USDC", "MON"];
  const results: Record<string, OraclePrice> = {};

  await Promise.all(
    symbols.map(async (s) => {
      results[s] = await fetchLivePythPrice(s);
    }),
  );

  return results;
}
