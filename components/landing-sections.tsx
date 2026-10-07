"use client";

import { useState } from "react";
import { useCountUp } from "@/hooks/use-count-up";
import { Sparkle } from "@/components/sparkle";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

function Stat({ value, decimals = 0, prefix = "", suffix = "", label }: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label: string;
}) {
  const v = useCountUp(value, true, 1200);
  const display =
    prefix === "$"
      ? usd(v)
      : v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <div className="flex flex-col justify-center gap-1 px-6 py-8 text-center md:px-8">
      <p className="text-[36px] font-semibold leading-[122%] tracking-[-0.06em] tabular-nums">
        {prefix === "$" ? display : `${display}${suffix}`}
      </p>
      <p className="text-[13px] font-medium leading-[112%] tracking-[-0.01em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export function StatsBand() {
  return (
    <section aria-label="Product constants" className="border-b border-border py-10 md:py-14">
      <div className="mx-auto max-w-[1332px] px-4 sm:px-6 lg:px-8">
        <div className="engraved grid grid-cols-2 gap-1 rounded-[32px] bg-secondary/50 p-1 md:grid-cols-4">
          <div className="rounded-2xl bg-card">
            <Stat value={2} label="sealed parties per session" />
          </div>
          <div className="rounded-2xl bg-card">
            <Stat value={8} label="max legs per encrypted book" />
          </div>
          <div className="rounded-2xl bg-card">
            <Stat value={3} suffix="+" label="pairs cleared per Monad epoch" />
          </div>
          <div className="rounded-2xl bg-card">
            <Stat value={0.01} decimals={2} prefix="$" label="per clearing call (x402)" />
          </div>
        </div>
      </div>
    </section>
  );
}

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Why does netting need confidential compute?",
    a: "Netting one wallet's own positions is client-side math — a spreadsheet, not a product. Obligor exists for the harder case: two mutually distrusting desks who will only clear if neither, nor the operator, can read the other's book.",
  },
  {
    q: "Why MPC on Solana but TEE on Monad?",
    a: "We ship the strongest honest backend per chain. Arcium MXE gives cryptographic MPC on Solana. Monad gets hardware-attested TEE (Nitro/Oyster). Both are real confidentiality with different trust models — TEE is not MPC, and every screen labels which one ran.",
  },
  {
    q: "What does Obligor actually see?",
    a: "Only the combined net margin. In confidential mode, per-leg plaintext never reaches the other party, the operator, or the logs. Adversarial plaintext views exist only as an explicitly labeled demo mode.",
  },
  {
    q: "Is this a DEX, a lender, or a dark pool?",
    a: "No. Obligor is clearing compute and margin analytics. It never custodies assets, matches orders, or lends. Simplified bucket haircuts stand in for venue-specific IM in the demo.",
  },
  {
    q: "Why $0.01 per call?",
    a: "Wedge pricing to make clearing machine-payable for agents via x402 — not venture-scale revenue math. The durable value is the two-party confidentiality property itself.",
  },
];

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-2xl bg-card transition-colors duration-200">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-4 px-6 py-6 text-left text-[15px] font-medium tracking-[-0.01em] transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {q}
          <span
            aria-hidden
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-transform duration-300 ${
              open ? "rotate-45" : ""
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3v10M3 8h10" strokeLinecap="round" />
            </svg>
          </span>
        </button>
      </h3>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <p className="max-w-2xl px-6 pb-6 text-[15px] font-medium leading-[148%] tracking-[-0.01em] text-muted-foreground">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

export function FaqSection() {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <section
      aria-label="Frequently asked questions"
      className="border-b border-border py-20 md:py-28"
    >
      <div className="mx-auto max-w-[1332px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <span className="flex items-center gap-1.5 text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
              <Sparkle size={11} className="text-gold" />
              FAQ
            </span>
            <h2 className="mt-3 text-[32px] font-medium leading-[122%] tracking-[-0.03em] sm:text-4xl">
              Got questions?
              <br />
              <span className="text-muted-foreground">Find answers.</span>
            </h2>
          </div>
          <div className="space-y-1 rounded-[18px] border border-border bg-secondary/50 p-1 lg:col-span-8">
            {FAQS.map((f, i) => (
              <FaqItem
                key={f.q}
                q={f.q}
                a={f.a}
                open={openIdx === i}
                onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CornerBrackets() {
  const base = "absolute h-2 w-2 text-steel/70";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <span className={`${base} left-3 top-3 border-l border-t`} />
      <span className={`${base} right-3 top-3 border-r border-t`} />
      <span className={`${base} bottom-3 left-3 border-b border-l`} />
      <span className={`${base} bottom-3 right-3 border-b border-r`} />
    </div>
  );
}

export function CtaBand() {
  return (
    <section className="border-b border-border py-20 md:py-28">
      <div className="mx-auto max-w-[1332px] px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-secondary/50 p-1">
          <div className="engraved relative rounded-[22px] bg-card px-6 py-16 text-center md:py-24">
            <CornerBrackets />
            <h2 className="mx-auto max-w-2xl text-[32px] font-medium leading-[122%] tracking-[-0.03em] sm:text-5xl">
              Clear both books.{" "}
              <span className="text-muted-foreground">Leak neither.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[15px] font-medium leading-[148%] tracking-[-0.01em] text-muted-foreground">
              Run the two-party demo, or hand your agents the x402 snippet — no account, no
              plaintext books.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a
                href="/clear"
                className="btn-light inline-flex h-12 items-center rounded-full px-7 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Start clearing session
              </a>
              <a
                href="/agents"
                className="inline-flex h-12 items-center rounded-full border border-border px-7 text-sm font-semibold transition-colors duration-200 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Agent payment demo
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
