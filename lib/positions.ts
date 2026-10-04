import { type PositionBook, type PositionLeg, type Venue, type Side } from "./margin";

export interface MockEquityConfig {
  symbol: string;
  name: string;
  markUsd: number;
  haircut: number;
  adapterNote: string;
}

export const DEFAULT_MOCK_EQUITY: MockEquityConfig = {
  symbol: "tAAPL",
  name: "Tokenized Apple (Mock Equity)",
  markUsd: 190.0,
  haircut: 0.25,
  adapterNote:
    "Adapter-ready for xStocks / Backed Finance (Solana RO) and off-chain equity venues. Compute analytics only — never custody.",
};

export function createLeg(
  party: "A" | "B",
  venue: Venue,
  instrument: string,
  bucket: string,
  side: Side,
  notionalUsd: number,
  signedExposureUsd: number,
  haircut: number,
  markUsd: number,
  source: PositionLeg["source"] = "mock",
): PositionLeg {
  const notional = Math.abs(notionalUsd);
  return {
    party,
    venue,
    instrument,
    bucket,
    side,
    qty: markUsd > 0 ? notional / markUsd : 0,
    notionalUsd: notional,
    signedExposureUsd,
    haircut,
    markUsd,
    source,
  };
}

export function createMockEquityLeg(
  party: "A" | "B",
  side: "long" | "short",
  notionalUsd: number,
  config: MockEquityConfig = DEFAULT_MOCK_EQUITY,
): PositionLeg {
  const signed = side === "long" ? Math.abs(notionalUsd) : -Math.abs(notionalUsd);
  return createLeg(
    party,
    "mock_equity",
    `${config.symbol} ${side}`,
    "AAPL",
    side,
    notionalUsd,
    signed,
    config.haircut,
    config.markUsd,
    "mock",
  );
}

export function sanitizePositionBook(
  party: "A" | "B",
  wallet: string,
  chain: "solana" | "monad",
  legs: PositionLeg[],
  label?: string,
): PositionBook {
  return {
    party,
    label: label || `Desk ${party} (${wallet.slice(0, 4)}...${wallet.slice(-4)})`,
    wallet: wallet.trim(),
    chain,
    warnings: [],
    legs: legs.map((l) => ({
      ...l,
      party,
      notionalUsd: Math.abs(l.notionalUsd),
      signedExposureUsd:
        l.side === "short" || l.side === "borrow"
          ? -Math.abs(l.signedExposureUsd)
          : Math.abs(l.signedExposureUsd),
    })),
  };
}
