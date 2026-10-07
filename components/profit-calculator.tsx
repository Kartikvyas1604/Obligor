"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const PRESETS = [
  { label: "$1M · DeFi trader", val: 1_000_000, apy: 22 },
  { label: "$10M · Mid desk", val: 10_000_000, apy: 18 },
  { label: "$50M · Market maker", val: 50_000_000, apy: 15 },
];

export function ProfitCalculator() {
  const [portfolioSize, setPortfolioSize] = useState<number>(10_000_000);
  const [strategyYieldApy, setStrategyYieldApy] = useState<number>(18);

  // Model: siloed IM = 30% of gross notional, netted IM = 4.8%.
  const siloedMargin = portfolioSize * 0.3;
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
    <div className="mx-auto max-w-5xl rounded-2xl engraved bg-card p-6 sm:p-10">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="mb-1 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Capital calculator
          </span>
          <h2 className="text-2xl font-medium tracking-[-0.02em] text-foreground sm:text-3xl">
            See how much cash Obligor unlocks for your desk
          </h2>
        </div>
      </div>

      <div className="grid items-center gap-8 pt-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="calc-book-size" className="text-sm font-medium text-foreground">
                Gross trading book size
              </label>
              <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(portfolioSize)}
              </span>
            </div>
            <input
              id="calc-book-size"
              type="range"
              min={100_000}
              max={100_000_000}
              step={100_000}
              value={portfolioSize}
              onChange={(e) => setPortfolioSize(Number(e.target.value))}
              className="h-2 w-full cursor-pointer rounded-lg bg-secondary"
            />
            <div className="flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
              <span>$100k</span>
              <span>$10M</span>
              <span>$100M</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="calc-reinvest-apy" className="text-sm font-medium text-foreground">
                Reinvestment yield
              </label>
              <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
                {strategyYieldApy}% APY
              </span>
            </div>
            <input
              id="calc-reinvest-apy"
              type="range"
              min={5}
              max={35}
              step={1}
              value={strategyYieldApy}
              onChange={(e) => setStrategyYieldApy(Number(e.target.value))}
              className="h-2 w-full cursor-pointer rounded-lg bg-secondary"
            />
            <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
              <span>5% T-bills</span>
              <span>18% funding arb</span>
              <span>35% DeFi</span>
            </div>
          </div>

          <div className="pt-2">
            <span className="mb-2 block font-mono text-xs text-muted-foreground">Presets</span>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setPortfolioSize(p.val);
                    setStrategyYieldApy(p.apy);
                  }}
                  className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-background p-6 sm:p-8 lg:col-span-6">
          <div className="grid grid-cols-2 gap-4 border-b border-border pb-4">
            <div>
              <span className="mb-1 block text-xs text-muted-foreground">
                Margin trapped without Obligor
              </span>
              <span className="font-mono text-xl font-semibold tabular-nums text-muted-foreground line-through">
                {formatCurrency(siloedMargin)}
              </span>
            </div>
            <div>
              <span className="mb-1 block text-xs text-muted-foreground">Net margin with Obligor</span>
              <span className="font-mono text-xl font-semibold tabular-nums text-foreground">
                {formatCurrency(nettedMargin)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl engraved bg-card p-4">
            <div>
              <span className="block text-xs text-muted-foreground">Idle cash unlocked</span>
              <span className="font-mono text-2xl font-semibold tabular-nums text-success">
                +{formatCurrency(freedCapital)}
              </span>
            </div>
            <span className="rounded-full bg-success/10 px-3 py-1 font-mono text-xs font-medium tabular-nums text-success">
              {capitalSavingsPercent}% saved
            </span>
          </div>

          <div className="flex items-center justify-between rounded-xl engraved bg-card p-4">
            <div>
              <span className="block text-xs text-muted-foreground">New annual revenue</span>
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                +{formatCurrency(annualProfit)} <span className="text-sm text-muted-foreground">/ yr</span>
              </span>
            </div>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              at {strategyYieldApy}% APY
            </span>
          </div>

          <Link
            href="/clear"
            className="btn-press flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span>Test this on the live terminal</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
