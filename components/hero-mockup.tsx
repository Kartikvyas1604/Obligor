"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

export function HeroMockup() {
  const [activeTab, setActiveTab] = useState<"netted" | "siloed">("netted");

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="rounded-2xl engraved bg-card p-5 sm:p-7">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs tracking-tight text-muted-foreground">
              SESSION: 0x8F92..A4
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 font-mono text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-steel" aria-hidden />
            CONFIDENTIAL MPC
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-border bg-background p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Combined initial margin
            </span>
            <div
              className="flex rounded-full border border-border bg-background p-0.5 text-xs"
              role="group"
              aria-label="Margin mode"
            >
              <button
                type="button"
                onClick={() => setActiveTab("netted")}
                aria-pressed={activeTab === "netted"}
                className={`rounded-full px-3 py-1 font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  activeTab === "netted"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Netted
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("siloed")}
                aria-pressed={activeTab === "siloed"}
                className={`rounded-full px-3 py-1 font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  activeTab === "siloed"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Siloed
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-foreground sm:text-4xl">
                {activeTab === "netted" ? "$24,500.00" : "$46,500.00"}
              </p>
              <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                {activeTab === "netted"
                  ? "Net cross-desk exposure: -$15,000.00"
                  : "Gross siloed exposure: $325,000.00"}
              </p>
            </div>

            {activeTab === "netted" && (
              <div className="rounded-lg border border-success/25 bg-success/10 p-2.5 text-right">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-success">
                  Capital freed
                </span>
                <p className="font-mono text-lg font-semibold tabular-nums text-success">
                  +$22,000.00
                </p>
                <span className="font-mono text-[10px] tabular-nums text-success/80">
                  47.3% reduction
                </span>
              </div>
            )}
          </div>

          <div className="mt-5 space-y-1.5">
            <div className="flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
              <span>Collateral efficiency</span>
              <span>{activeTab === "netted" ? "52.7% posted" : "100% required"}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-foreground transition-[width] duration-500 ease-out"
                style={{ width: activeTab === "netted" ? "52.7%" : "100%" }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Desk Alpha (Party A)</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                Kamino
              </span>
            </div>
            <div className="mt-3 space-y-2 font-mono text-xs tabular-nums">
              <div className="flex justify-between text-muted-foreground">
                <span>SOL Lend (10%)</span>
                <span className="text-foreground">+$90,000</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>tAAPL Long (25%)</span>
                <span className="text-foreground">+$55,000</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 text-foreground">
                <span>Siloed IM</span>
                <span>$26,750</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Desk Bravo (Party B)</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                Drift
              </span>
            </div>
            <div className="mt-3 space-y-2 font-mono text-xs tabular-nums">
              <div className="flex justify-between text-muted-foreground">
                <span>SOL-PERP Short (15%)</span>
                <span className="text-foreground">-$95,000</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>BTC-PERP Long (15%)</span>
                <span className="text-foreground">+$30,000</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 text-foreground">
                <span>Siloed IM</span>
                <span>$19,750</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            <span className="font-mono text-[11px]">Zero plaintext leaks enforced</span>
          </div>
          <span className="font-mono text-[11px] text-foreground">x402 V2 micro-settled</span>
        </div>
      </div>
    </div>
  );
}
