"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

export function HeroMockup() {
  const [activeTab, setActiveTab] = useState<"netted" | "siloed">("netted");

  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
      {/* Subtle Ambient Gold Glow Behind Mockup */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1 rounded-[32px] bg-gradient-to-r from-[#E8C874]/15 via-[#C59A3F]/10 to-[#A67C27]/15 blur-2xl opacity-60"
      />

      {/* Main Glass/Dark Frame */}
      <div className="relative rounded-[28px] border border-[#1F1F1F] bg-[#0A0A0A] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-7">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-[#1A1A1A] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-[#222222]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#222222]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#C59A3F]/60" />
            </div>
            <span className="font-['JetBrains_Mono',monospace] text-xs text-[#94A3B8] tracking-tight">
              SESSION: #0x8F92..A4
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-[#C59A3F]/30 bg-[#C59A3F]/10 px-3 py-1 font-['JetBrains_Mono',monospace] text-[11px] text-[#E8C874]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#E8C874] animate-pulse" />
            CONFIDENTIAL MPC
          </div>
        </div>

        {/* Hero Margin Overview Card */}
        <div className="mt-5 rounded-2xl border border-[#1A1A1A] bg-[#000000] p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[#94A3B8]">
              Combined Initial Margin
            </span>
            <div className="flex rounded-full border border-[#1F1F1F] bg-[#0A0A0A] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("netted")}
                className={`rounded-full px-3 py-1 font-medium transition-all ${
                  activeTab === "netted"
                    ? "bg-[#1F1F1F] text-[#E8C874] shadow-sm"
                    : "text-[#94A3B8] hover:text-white"
                }`}
              >
                Netted (MPC)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("siloed")}
                className={`rounded-full px-3 py-1 font-medium transition-all ${
                  activeTab === "siloed"
                    ? "bg-[#1F1F1F] text-white shadow-sm"
                    : "text-[#94A3B8] hover:text-white"
                }`}
              >
                Siloed
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-baseline justify-between gap-4">
            <div>
              <p className="font-['JetBrains_Mono',monospace] text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {activeTab === "netted" ? "$24,500.00" : "$46,500.00"}
              </p>
              <p className="mt-1 font-['JetBrains_Mono',monospace] text-xs text-[#94A3B8]">
                {activeTab === "netted"
                  ? "Net Cross-Desk Exposure: -$15,000.00"
                  : "Gross Siloed Exposure: $325,000.00"}
              </p>
            </div>

            {activeTab === "netted" && (
              <div className="rounded-xl border border-[#C59A3F]/30 bg-gradient-to-b from-[#C59A3F]/15 to-transparent p-2.5 text-right">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-[#C59A3F]">
                  Capital Freed
                </span>
                <p className="font-['JetBrains_Mono',monospace] text-lg font-bold text-[#E8C874]">
                  +$22,000.00
                </p>
                <span className="font-['JetBrains_Mono',monospace] text-[10px] text-[#E8C874]/80">
                  47.3% reduction
                </span>
              </div>
            )}
          </div>

          {/* Collateral Progress Bar */}
          <div className="mt-5 space-y-1.5">
            <div className="flex justify-between text-[11px] font-['JetBrains_Mono',monospace] text-[#94A3B8]">
              <span>Collateral Efficiency</span>
              <span className="text-[#E8C874]">{activeTab === "netted" ? "52.7% Posted" : "100% Required"}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#1A1A1A]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#E8C874] via-[#C59A3F] to-[#A67C27] transition-all duration-500 ease-out"
                style={{ width: activeTab === "netted" ? "52.7%" : "100%" }}
              />
            </div>
          </div>
        </div>

        {/* Counterparty Books Preview */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {/* Party A Card */}
          <div className="rounded-2xl border border-[#1A1A1A] bg-[#000000] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Desk Alpha (Party A)</span>
              <span className="rounded-full bg-[#141414] px-2 py-0.5 font-['JetBrains_Mono',monospace] text-[10px] text-[#94A3B8]">
                Kamino / RO
              </span>
            </div>
            <div className="mt-3 space-y-2 font-['JetBrains_Mono',monospace] text-xs">
              <div className="flex justify-between text-[#94A3B8]">
                <span>SOL Lend (10%)</span>
                <span className="text-white">+$90,000</span>
              </div>
              <div className="flex justify-between text-[#94A3B8]">
                <span>tAAPL Long (25%)</span>
                <span className="text-white">+$55,000</span>
              </div>
              <div className="border-t border-[#1A1A1A] pt-1.5 flex justify-between text-[#E8C874]">
                <span>Siloed IM</span>
                <span>$26,750</span>
              </div>
            </div>
          </div>

          {/* Party B Card */}
          <div className="rounded-2xl border border-[#1A1A1A] bg-[#000000] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Counterparty (Party B)</span>
              <span className="rounded-full bg-[#141414] px-2 py-0.5 font-['JetBrains_Mono',monospace] text-[10px] text-[#94A3B8]">
                Drift Perps
              </span>
            </div>
            <div className="mt-3 space-y-2 font-['JetBrains_Mono',monospace] text-xs">
              <div className="flex justify-between text-[#94A3B8]">
                <span>SOL-PERP Short (15%)</span>
                <span className="text-white">-$95,000</span>
              </div>
              <div className="flex justify-between text-[#94A3B8]">
                <span>BTC-PERP Long (15%)</span>
                <span className="text-white">+$30,000</span>
              </div>
              <div className="border-t border-[#1A1A1A] pt-1.5 flex justify-between text-[#E8C874]">
                <span>Siloed IM</span>
                <span>$19,750</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Pill Status */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-full border border-[#1A1A1A] bg-[#000000] px-4 py-2.5 text-xs text-[#94A3B8]">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-[#C59A3F]" />
            <span className="font-['JetBrains_Mono',monospace] text-[11px]">
              Zero Plaintext Leaks Enforced
            </span>
          </div>
          <span className="font-['JetBrains_Mono',monospace] text-[11px] text-[#E8C874]">
            x402 V2 Micro-Settled
          </span>
        </div>
      </div>
    </div>
  );
}
