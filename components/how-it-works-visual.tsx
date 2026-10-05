"use client";

import { useState } from "react";
import { ArrowRight, ShieldCheck, Lock, Unlock, EyeOff, Cpu, Coins, CheckCircle2, ChevronRight } from "lucide-react";

export function HowItWorksVisual() {
  const [activeStep, setActiveStep] = useState<number>(0);

  const steps = [
    {
      stepNumber: "01",
      title: "Encrypted Input Submission",
      badge: "Zero Strategy Leakage",
      icon: EyeOff,
      description:
        "Trading Desk A and Trading Desk B submit their secret positions directly from their own devices. Each portfolio is encrypted client-side using independent keys.",
      visualTag: "Inputs Sealed Client-Side",
      deskAData: "Long +$10,000,000 SOL (Encrypted 🔒)",
      deskBData: "Short -$10,000,000 SOL (Encrypted 🔒)",
      outcome: "Neither desk nor the server operator can see individual trades.",
    },
    {
      stepNumber: "02",
      title: "Confidential Enclave Netting",
      badge: "Hardware TEE / Arcium MPC",
      icon: Cpu,
      description:
        "The encrypted portfolios enter an isolated hardware TEE (Monad AWS Nitro) or MPC circuit (Solana Arcium). Real-time Pyth Network oracles price the collateral, and the SPAN netting algorithm computes the combined risk.",
      visualTag: "Confidential Compute Active",
      deskAData: "Siloed Risk: $3,000,000 Margin",
      deskBData: "Siloed Risk: $3,000,000 Margin",
      outcome: "Offsetting positions cancel out. Combined net margin drops to $800,000 total.",
    },
    {
      stepNumber: "03",
      title: "Bilateral Escrow & Cash Unlock",
      badge: "On-Chain Capital Release",
      icon: Unlock,
      description:
        "The enclave publishes a cryptographic attestation to the on-chain Escrow contract. Both desks deposit only their reduced net margin, instantly freeing $5,200,000 in excess cash.",
      visualTag: "Settled on Monad / Solana",
      deskAData: "New Margin: $400,000 (Saved $2.6M)",
      deskBData: "New Margin: $400,000 (Saved $2.6M)",
      outcome: "$5,200,000 returned to trading desks for deployment in yield strategies.",
    },
  ];

  const current = steps[activeStep];
  const IconComponent = current.icon;

  return (
    <div className="relative mx-auto max-w-5xl rounded-[28px] border border-[#1F1F1F] bg-[#0A0A0A] p-6 sm:p-10 shadow-2xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1F1F1F] pb-6">
        <div>
          <span className="font-['JetBrains_Mono',monospace] text-xs uppercase tracking-wider text-[#C59A3F] block mb-1">
            Simple 3-Step Architecture
          </span>
          <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            How Two Desks Clear Margin in 60 Seconds
          </h3>
        </div>

        {/* Step Selector Pills */}
        <div className="flex gap-2">
          {steps.map((s, idx) => (
            <button
              key={s.stepNumber}
              onClick={() => setActiveStep(idx)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                activeStep === idx
                  ? "bg-[#C59A3F] text-black shadow-[0_0_15px_rgba(197,154,63,0.4)]"
                  : "border border-[#1F1F1F] bg-[#141414] text-[#94A3B8] hover:text-white hover:border-[#333]"
              }`}
            >
              <span>Step {s.stepNumber}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="grid gap-8 lg:grid-cols-12 pt-8 items-center">
        {/* Step Details */}
        <div className="lg:col-span-5 space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C59A3F]/30 bg-[#C59A3F]/10 px-3 py-1 font-['JetBrains_Mono',monospace] text-xs text-[#E8C874]">
            <IconComponent className="h-3.5 w-3.5" />
            <span>{current.badge}</span>
          </div>

          <h4 className="text-2xl font-bold text-white tracking-tight">
            {current.stepNumber}. {current.title}
          </h4>

          <p className="text-sm leading-relaxed text-[#94A3B8]">
            {current.description}
          </p>

          <div className="rounded-xl border border-[#1F1F1F] bg-[#141414] p-4 text-xs text-[#CBD5E1] space-y-1">
            <span className="text-[#C59A3F] font-semibold block font-['JetBrains_Mono',monospace]">
              Outcome:
            </span>
            <p>{current.outcome}</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              disabled={activeStep === 0}
              onClick={() => setActiveStep((prev) => Math.max(0, prev - 1))}
              className="rounded-full border border-[#1F1F1F] bg-[#141414] px-4 py-1.5 text-xs text-[#94A3B8] hover:text-white disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={activeStep === steps.length - 1}
              onClick={() => setActiveStep((prev) => Math.min(steps.length - 1, prev + 1))}
              className="rounded-full border border-[#C59A3F]/40 bg-[#C59A3F]/20 px-4 py-1.5 text-xs text-[#E8C874] hover:bg-[#C59A3F]/30 disabled:opacity-40 flex items-center gap-1"
            >
              <span>Next Step</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Step Visual Graphic */}
        <div className="lg:col-span-7 rounded-2xl border border-[#1F1F1F] bg-[#111111] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3">
            <span className="font-['JetBrains_Mono',monospace] text-xs uppercase tracking-wider text-[#94A3B8]">
              Live Simulation Stage
            </span>
            <span className="font-['JetBrains_Mono',monospace] text-xs text-[#C59A3F]">
              {current.visualTag}
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Desk A Box */}
            <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Trading Desk A</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
              </div>
              <div className="font-['JetBrains_Mono',monospace] text-xs text-[#94A3B8] rounded bg-[#141414] p-2">
                {current.deskAData}
              </div>
            </div>

            {/* Desk B Box */}
            <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Trading Desk B</span>
                <span className="h-2 w-2 rounded-full bg-blue-400"></span>
              </div>
              <div className="font-['JetBrains_Mono',monospace] text-xs text-[#94A3B8] rounded bg-[#141414] p-2">
                {current.deskBData}
              </div>
            </div>
          </div>

          {/* Central Enclave Action Graphic */}
          <div className="rounded-xl border border-[#C59A3F]/30 bg-gradient-to-r from-[#17140E] to-[#0A0A0A] p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#C59A3F]/20 text-[#E8C874]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-semibold text-white block">
                  Obligor Confidential Clearing Core
                </span>
                <span className="font-['JetBrains_Mono',monospace] text-[11px] text-[#94A3B8]">
                  Zero plaintext leakage &bull; Pyth Hermes Oracle Feeds
                </span>
              </div>
            </div>
            <span className="font-['JetBrains_Mono',monospace] text-xs font-bold text-emerald-400">
              {activeStep === 2 ? "Freed: +$5.20M" : "Protected"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
