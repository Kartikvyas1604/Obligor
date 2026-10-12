"use client";

import { useState } from "react";
import { ShieldCheck, Unlock, EyeOff, Cpu, ChevronLeft, ChevronRight } from "lucide-react";

const STEPS = [
  {
    stepNumber: "01",
    title: "Sealed input submission",
    badge: "Cryptographic Book Sealing",
    icon: EyeOff,
    description:
      "Desk A and Desk B submit multi-venue positions authenticated by capability tokens. Individual positions, notionals, and marks are sealed and strictly withheld from the counterparty and public API.",
    deskAData: "Long +$10,000,000 SOL (sealed)",
    deskBData: "Short -$10,000,000 SOL (sealed)",
    outcome: "Neither desk ever sees the other's trades.",
  },
  {
    stepNumber: "02",
    title: "Confidential netting compute",
    badge: "Confidential Clearing Core",
    icon: Cpu,
    description:
      "Sealed positions enter the confidential netting engine. Real-time Pyth Hermes feeds mark collateral to market, risk factor buckets collapse offsetting exposures, and conservative haircuts determine the combined net initial margin.",
    deskAData: "Siloed risk: $3,000,000 margin",
    deskBData: "Siloed risk: $3,000,000 margin",
    outcome: "Offsetting positions cancel out. Combined net margin drops to $800,000.",
  },
  {
    stepNumber: "03",
    title: "Bilateral escrow & cash unlock",
    badge: "On-Chain Escrow Settlement",
    icon: Unlock,
    description:
      "The verified net margin scalar conditions the bilateral escrow contract. Excess locked collateral is calculated and released directly back to authenticated desk token accounts upon cryptographic consensus.",
    deskAData: "New margin: $400,000 (saved $2.6M)",
    deskBData: "New margin: $400,000 (saved $2.6M)",
    outcome: "$5,200,000 released directly back to counterparties.",
  },
];

export function HowItWorksVisual() {
  const [activeStep, setActiveStep] = useState<number>(0);
  const current = STEPS[activeStep];
  const Icon = current.icon;

  return (
    <div className="mx-auto max-w-5xl rounded-2xl engraved bg-card p-6 sm:p-10">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="mb-1 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            How it works
          </span>
          <h2 className="text-2xl font-medium tracking-[-0.02em] text-foreground sm:text-3xl">
            Two desks clear margin in 60 seconds
          </h2>
        </div>

        <div
          className="flex gap-2"
          role="tablist"
          aria-label="Clearing steps"
        >
          {STEPS.map((s, idx) => (
            <button
              key={s.stepNumber}
              type="button"
              role="tab"
              aria-selected={activeStep === idx}
              onClick={() => setActiveStep(idx)}
              className={`rounded-full px-4 py-2 font-mono text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeStep === idx
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.stepNumber}
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-center gap-8 pt-8 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 font-mono text-xs text-muted-foreground">
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span>{current.badge}</span>
          </div>

          <h3 className="text-2xl font-medium tracking-[-0.02em] text-foreground">
            {current.stepNumber}. {current.title}
          </h3>

          <p className="text-sm leading-relaxed text-muted-foreground">{current.description}</p>

          <div className="rounded-xl border border-border bg-secondary p-4 text-xs leading-relaxed text-foreground">
            <span className="mb-1 block font-mono font-medium uppercase tracking-wider text-muted-foreground">
              Outcome
            </span>
            <p>{current.outcome}</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={activeStep === 0}
              onClick={() => setActiveStep((prev) => Math.max(0, prev - 1))}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-4 py-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={activeStep === STEPS.length - 1}
              onClick={() => setActiveStep((prev) => Math.min(STEPS.length - 1, prev + 1))}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-4 py-2 text-xs text-foreground transition-colors duration-150 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>Next step</span>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-background p-6 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Simulation stage
            </span>
            <span className="font-mono text-xs text-foreground">{current.title}</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-xl engraved bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Trading Desk A</span>
                <span className="h-2 w-2 rounded-full bg-steel" aria-hidden />
              </div>
              <div className="rounded bg-secondary p-2 font-mono text-xs tabular-nums text-muted-foreground">
                {current.deskAData}
              </div>
            </div>

            <div className="space-y-2 rounded-xl engraved bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Trading Desk B</span>
                <span className="h-2 w-2 rounded-full bg-steel" aria-hidden />
              </div>
              <div className="rounded bg-secondary p-2 font-mono text-xs tabular-nums text-muted-foreground">
                {current.deskBData}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl engraved bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <span className="block text-xs font-medium text-foreground">
                  Obligor confidential clearing core
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Aggregate-only output · Pyth Hermes oracle feeds
                </span>
              </div>
            </div>
            <span className="font-mono text-xs font-medium tabular-nums text-success">
              {activeStep === 2 ? "Freed: +$5.20M" : "Protected"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
