/**
 * Tokenized Equity Adapter
 * Interacts with Backed Finance (bAAPL, bIB01) and xStocks SPL token rails on Solana.
 */

import { type PositionLeg } from "../margin";
import { fetchLivePythPrice } from "./pyth";

export interface TokenizedEquityAsset {
  symbol: string;
  name: string;
  mintAddress: string;
  haircut: number;
}

export const BACKED_FINANCE_ASSETS: Record<string, TokenizedEquityAsset> = {
  bAAPL: {
    symbol: "tAAPL",
    name: "Backed IB01 $ Treasury / Apple Tokenized Exposure",
    mintAddress: "BAAPLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    haircut: 0.25,
  },
};

export async function fetchLiveTokenizedEquityLeg(
  party: "A" | "B",
  side: "long" | "short",
  notionalTargetUsd = 55_000,
): Promise<PositionLeg> {
  const aaplPriceData = await fetchLivePythPrice("AAPL");
  const aaplMark = aaplPriceData.priceUsd;
  const qty = Math.round((notionalTargetUsd / aaplMark) * 100) / 100;
  const notionalUsd = Math.round(qty * aaplMark * 100) / 100;
  const signed = side === "long" ? notionalUsd : -notionalUsd;

  return {
    party,
    venue: "mock_equity",
    instrument: `tAAPL ${side}`,
    bucket: "AAPL",
    side,
    qty,
    notionalUsd,
    signedExposureUsd: signed,
    haircut: 0.25,
    markUsd: aaplMark,
    source: "live",
  };
}
