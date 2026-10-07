"use client";

import { useState } from "react";
import { Plus, X, Sparkles, TrendingUp, TrendingDown, Shield } from "lucide-react";
import { type PartyId, type PositionLeg, type Venue, type Side } from "@/lib/margin";

interface PositionBuilderModalProps {
  party: PartyId;
  partyName: string;
  isOpen: boolean;
  onClose: () => void;
  onAddLeg: (leg: PositionLeg) => void;
}

const ASSET_PRICES: Record<string, { price: number; bucket: string; defaultHaircut: number }> = {
  "SOL-PERP": { price: 145.20, bucket: "crypto_sol", defaultHaircut: 0.15 },
  "BTC-PERP": { price: 65400.00, bucket: "crypto_btc", defaultHaircut: 0.10 },
  "ETH-PERP": { price: 3520.00, bucket: "crypto_eth", defaultHaircut: 0.12 },
  "bAAPL (Equity)": { price: 228.40, bucket: "tokenized_equity", defaultHaircut: 0.20 },
  "MON-PERP": { price: 1.45, bucket: "crypto_mon", defaultHaircut: 0.25 },
};

export function PositionBuilderModal({
  party,
  partyName,
  isOpen,
  onClose,
  onAddLeg,
}: PositionBuilderModalProps) {
  const [selectedAsset, setSelectedAsset] = useState<string>("SOL-PERP");
  const [venue, setVenue] = useState<Venue>("drift");
  const [side, setSide] = useState<Side>("long");
  const [amountUsd, setAmountUsd] = useState<number>(100_000);

  if (!isOpen) return null;

  const assetInfo = ASSET_PRICES[selectedAsset] || { price: 100, bucket: "crypto", defaultHaircut: 0.15 };
  const qty = amountUsd / assetInfo.price;
  const isNegative = side === "short" || side === "borrow";
  const signedExposureUsd = isNegative ? -amountUsd : amountUsd;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newLeg: PositionLeg = {
      party,
      venue,
      instrument: selectedAsset,
      bucket: assetInfo.bucket,
      side,
      qty: Math.round(qty * 1000) / 1000,
      notionalUsd: amountUsd,
      signedExposureUsd,
      haircut: assetInfo.defaultHaircut,
      markUsd: assetInfo.price,
      source: "live",
    };
    onAddLeg(newLeg);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 anim-fade-in">
      <div className="relative w-full max-w-lg rounded-[24px] border border-border bg-card p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 font-mono text-xs text-foreground uppercase tracking-wider">
              <Sparkles className="h-3 w-3" />
              <span>Custom Trade Builder</span>
            </div>
            <h3 className="text-xl font-bold text-foreground tracking-tight mt-1">
              Add Trade Leg to {partyName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border p-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Asset Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Select Asset</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ASSET_PRICES).map(([name, data]) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => setSelectedAsset(name)}
                  className={`flex flex-col text-left p-2.5 rounded-xl border text-xs transition-colors duration-150 ${
                    selectedAsset === name
                      ? "border-foreground bg-secondary text-foreground"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground "
                  }`}
                >
                  <span className="font-bold">{name}</span>
                  <span className="font-mono text-[11px] text-foreground">
                    ${data.price.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Direction & Venue */}
          <div className="grid grid-cols-2 gap-4">
            {/* Side */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Position Direction</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSide("long")}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-bold transition-colors duration-150 ${
                    side === "long"
                      ? "bg-success bg-success/20 text-success"
                      : "border-border bg-secondary text-muted-foreground"
                  }`}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>LONG</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSide("short")}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-bold transition-colors duration-150 ${
                    side === "short"
                      ? "border-red-500 bg-red-500/20 text-red-400"
                      : "border-border bg-secondary text-muted-foreground"
                  }`}
                >
                  <TrendingDown className="h-3.5 w-3.5" />
                  <span>SHORT</span>
                </button>
              </div>
            </div>

            {/* Venue */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Exchange Venue</label>
              <select
                value={venue}
                onChange={(e) => setVenue(e.target.value as Venue)}
                className="w-full h-10 rounded-lg border border-border bg-secondary px-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:border-foreground"
              >
                <option value="drift">Drift Protocol (Solana)</option>
                <option value="kamino">Kamino Lending (Solana)</option>
                <option value="monad_fixture">Monad DEX / Perps</option>
                <option value="mock_equity">Backed Finance (Equity)</option>
              </select>
            </div>
          </div>

          {/* Amount Notional Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-muted-foreground">Notional Position Size (USD)</span>
              <span className="font-mono font-bold text-foreground text-sm">
                ${amountUsd.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min={10_000}
              max={2_000_000}
              step={10_000}
              value={amountUsd}
              onChange={(e) => setAmountUsd(Number(e.target.value))}
              className="w-full h-2 rounded-lg bg-secondary appearance-none cursor-pointer "
            />
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
              <span>$10k</span>
              <span>$500k</span>
              <span>$2M</span>
            </div>
          </div>

          {/* Computed Leg Preview */}
          <div className="rounded-xl border border-border bg-secondary p-3 text-xs font-mono text-muted-foreground space-y-1">
            <div className="flex justify-between text-foreground font-semibold">
              <span>Estimated Units:</span>
              <span>{qty.toFixed(4)} {selectedAsset.split("-")[0]}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Required Siloed Margin ({(assetInfo.defaultHaircut * 100)}%):</span>
              <span className="text-red-400">${(amountUsd * assetInfo.defaultHaircut).toLocaleString()}</span>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-bold text-primary-foreground text-sm transition-colors duration-150"
          >
            <Plus className="h-4 w-4" />
            <span>Add Position Leg to {partyName}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
