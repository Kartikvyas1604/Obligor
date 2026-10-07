/**
 * Venue registry — display labels and metadata only.
 *
 * Provenance honesty: venues carry display labels and notes, but never invent
 * position sizes. All quantities enter through the ingestion pipeline
 * (lib/positions.ts) from desk input, the session store, or explicitly-gated
 * demo endpoints.
 */

import type { Venue } from "@/lib/margin";

export interface VenueInfo {
  label: string;
  note?: string;
}

export const VENUES: Record<Venue, VenueInfo> = {
  drift: { label: "Drift Protocol (perps)" },
  kamino: { label: "Kamino Lend" },
  mock_equity: {
    label: "Tokenized equity (tAAPL)",
    note: "Mock SPL equity priced from the live Pyth AAPL mark. Adapter-ready for xStocks/Backed rails — analytics never custody.",
  },
  monad_fixture: { label: "Monad fixture venue" },
  manual: { label: "Manually entered" },
};

/** Risk-factor bucket → Pyth symbol. MON has no Hermes feed id yet. */
export const BUCKET_ORACLE_SYMBOL: Record<string, "SOL" | "BTC" | "ETH" | "AAPL" | "USDC" | null> = {
  SOL: "SOL",
  BTC: "BTC",
  ETH: "ETH",
  AAPL: "AAPL",
  USD: "USDC",
  USDC: "USDC",
  MON: null,
};
