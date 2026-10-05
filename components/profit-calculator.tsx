"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Calculator, Coins, TrendingUp, Unlock, ShieldCheck, Sparkles } from "lucide-react";

export function ProfitCalculator() {
  const [portfolioSize, setPortfolioSize] = useState<number>(10_000_000); // Default $10M
  const [strategyYieldApy, setStrategyYieldApy] = useState<number>(18); // Default 18% APY basis rate

  // Financial model:
  // Typical siloed margin required without netting = 30% of gross notional ($3M on $10M)
  // Obligor netted margin required = ~4.8% of gross notional ($480k on $10M)
  // Freed capital = 25.2% of gross notional ($2.52M on $10M)
  // Extra annual yield = Freed Capital * APY
  const siloedMargin = portfolioSize * 0.30;
  const nettedMargin = portfolioSize * 0.048;
  const freedCapital = siloedMargin - nettedMargin;
  const annualProfit = freedCapital * (strategyYieldApy / 100);
  const capitalSavingsPercent = Math.round((freedCapital / siloedMargin) * 100);

  function formatCurrency(amount: number) {
    if (amount >= 1_000_000) {
      return `$${(amount / 1_000_000).toFixed(2)}M`;
    }
    if (amount >= 1_000) {
      return `$${(amount / 1_000).toFixed(0)}k`;
    }
    return `$${amount.toLocaleString()}`;
  }

  return (
    <div className="relative mx-auto max-w-5xl rounded-[28px] border border-[#1F1F1F] bg-[#0A0A0A] p-6 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden">
      {/* Background Gold Ambient Gradient */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(232,200,116,0.12),transparent_70%)]" 
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1F1F1F] pb-6">
        <div>
          <div className="inline-flex items-center gap-2 font-['JetBrains_Mono',monospace] text-xs uppercase tracking-wider text-[#C59A3F] mb-1">
            <Calculator className="h-3.5 w-3.5" />
            <span>Interactive Profit &amp; Capital Calculator</span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            See how much cash Obligor unlocks for your desk
          </h3>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#1F1F1F] bg-[#141414] px-4 py-1.5 text-xs text-[#94A3B8]">
          <Sparkles className="h-3.5 w-3.5 text-[#E8C874]" />
          <span>Real-time Capital Model</span>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12 pt-8 items-center">
        {/* Left: Interactive Controls */}
        <div className="lg:col-span-6 space-y-6">
          {/* Slider 1: Gross Notional Portfolio Size */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#94A3B8]">
                Your Gross Trading Book Size
              </label>
              <span className="font-['JetBrains_Mono',monospace] text-lg font-bold text-white">
                {formatCurrency(portfolioSize)}
              </span>
            </div>
            <input
              type="range"
              min={100_000}
              max={100_000_000}
              step={100_000}
              value={portfolioSize}
              onChange={(e) => setPortfolioSize(Number(e.target.value))}
              className="w-full h-2 rounded-lg bg-[#1F1F1F] appearance-none cursor-pointer accent-[#C59A3F]"
            />
            <div className="flex justify-between text-[11px] font-['JetBrains_Mono',monospace] text-[#64748B]">
              <span>$100k (Prosumer)</span>
              <span>$10M (Desk)</span>
              <span>$100M (Prime Fund)</span>
            </div>
          </div>

          {/* Slider 2: Re-investment APY */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#94A3B8]">
                Expected Reinvestment Yield (Basis APY / T-Bills)
              </label>
              <span className="font-['JetBrains_Mono',monospace] text-lg font-bold text-[#E8C874]">
                {strategyYieldApy}% APY
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={35}
              step={1}
              value={strategyYieldApy}
              onChange={(e) => setStrategyYieldApy(Number(e.target.value))}
              className="w-full h-2 rounded-lg bg-[#1F1F1F] appearance-none cursor-pointer accent-[#E8C874]"
            />
            <div className="flex justify-between text-[11px] font-['JetBrains_Mono',monospace] text-[#64748B]">
              <span>5% (T-Bills)</span>
              <span>18% (Funding Arbitrage)</span>
              <span>35% (Active DeFi)</span>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="pt-2">
            <span className="text-xs text-[#64748B] block mb-2 font-['JetBrains_Mono',monospace]">
              One-Click Presets:
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "$1M (DeFi Trader)", val: 1_000_000, apy: 22 },
                { label: "$10M (Mid Desk)", val: 10_000_000, apy: 18 },
                { label: "$50M (Market Maker)", val: 50_000_000, apy: 15 },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setPortfolioSize(p.val);
                    setStrategyYieldApy(p.apy);
                  }}
                  className="rounded-full border border-[#1F1F1F] bg-[#141414] px-3 py-1 text-xs text-[#94A3B8] transition-colors hover:border-[#C59A3F] hover:text-white"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Results Display Card */}
        <div className="lg:col-span-6 rounded-2xl border border-[#C59A3F]/30 bg-[#121212] p-6 sm:p-8 space-y-6 relative">
          <div className="space-y-4">
            {/* Before vs After Comparison */}
            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-[#1F1F1F]">
              <div>
                <span className="text-xs text-[#94A3B8] block mb-1">
                  Margin Trapped Without Obligor
                </span>
                <span className="font-['JetBrains_Mono',monospace] text-xl font-bold text-red-400 line-through">
                  {formatCurrency(siloedMargin)}
                </span>
              </div>
              <div>
                <span className="text-xs text-[#94A3B8] block mb-1">
                  Net Margin With Obligor
                </span>
                <span className="font-['JetBrains_Mono',monospace] text-xl font-bold text-[#E8C874]">
                  {formatCurrency(nettedMargin)}
                </span>
              </div>
            </div>

            {/* Core Highlight 1: Freed Capital */}
            <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Unlock className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs text-[#94A3B8] block">Idle Cash Unlocked</span>
                  <span className="font-['JetBrains_Mono',monospace] text-2xl font-black text-emerald-400">
                    +{formatCurrency(freedCapital)}
                  </span>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-['JetBrains_Mono',monospace] text-xs font-semibold text-emerald-400">
                {capitalSavingsPercent}% Saved
              </span>
            </div>

            {/* Core Highlight 2: Additional Annual Profit */}
            <div className="rounded-xl border border-[#C59A3F]/40 bg-gradient-to-br from-[#1A160E] to-[#0A0A0A] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#C59A3F]/20 text-[#E8C874]">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs text-[#C59A3F] block font-medium">
                    New Annual Revenue Generated
                  </span>
                  <span className="font-['JetBrains_Mono',monospace] text-2xl font-black bg-gradient-to-r from-[#E8C874] to-[#C59A3F] bg-clip-text text-transparent">
                    +{formatCurrency(annualProfit)} / yr
                  </span>
                </div>
              </div>
              <span className="font-['JetBrains_Mono',monospace] text-xs text-[#94A3B8]">
                at {strategyYieldApy}% APY
              </span>
            </div>
          </div>

          {/* Action Link */}
          <Link
            href="/clear"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#E8C874] via-[#C59A3F] to-[#A67C27] text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-[0_4px_20px_rgba(197,154,63,0.3)]"
          >
            <span>Test This on the Live Terminal</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
