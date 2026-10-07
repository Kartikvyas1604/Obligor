"use client";

import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { twoPartyNetted, twoPartySiloed, usd, type PositionBook } from "@/lib/margin";

const MAX = 250_000;
const STEP = 500;
const SOL_MARK = 142.5;

function makeBook(party: "A" | "B", notional: number): PositionBook {
  const shortSide = party === "B";
  return {
    party,
    label: party === "A" ? "Calculator A" : "Calculator B",
    wallet: party === "A" ? "demo-party-a" : "demo-party-b",
    chain: "solana",
    warnings: [],
    legs: [
      {
        party,
        venue: shortSide ? "drift" : "kamino",
        instrument: shortSide ? "SOL-PERP short" : "SOL lend",
        bucket: "SOL",
        side: shortSide ? "short" : "lend",
        qty: notional / SOL_MARK,
        notionalUsd: notional,
        signedExposureUsd: shortSide ? -notional : notional,
        haircut: shortSide ? 0.15 : 0.1,
        markUsd: SOL_MARK,
        source: "mock",
      },
    ],
  };
}

function PartyControl({
  title,
  haircutLabel,
  notional,
  text,
  im,
  onText,
}: {
  title: string;
  haircutLabel: string;
  notional: number;
  text: string;
  im: number;
  onText: (t: string) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          siloed IM {usd(im)}
        </p>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={MAX}
          step={STEP}
          value={notional}
          onChange={(e) => onText(Number(e.target.value).toLocaleString("en-US"))}
          aria-label={`${title} notional in USD`}
          aria-valuetext={usd(notional)}
          className="h-6 flex-1 cursor-pointer"
        />
        <div className="relative w-36 shrink-0">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground"
            aria-hidden
          >
            $
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={text}
            onChange={(e) => onText(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background pr-3 pl-7 text-right font-mono text-sm tabular-nums transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${title} notional in USD, typed`}
          />
        </div>
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        {haircutLabel} · {notional.toLocaleString("en-US")} notional · slider 0–250K, step 500
      </p>
    </div>
  );
}

function Bar({ pct, tone }: { pct: number; tone: "muted" | "primary" | "success" }) {
  const cls =
    tone === "primary" ? "bg-primary" : tone === "success" ? "bg-success" : "bg-muted-foreground/40";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-secondary">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-out ${cls}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export function NettingCalculator() {
  const [aText, setAText] = useState("45,000");
  const [bText, setBText] = useState("95,000");

  const parse = (t: string) => {
    const digits = t.replace(/[^0-9]/g, "").slice(0, 7);
    return Math.min(MAX, Number(digits || 0));
  };
  const aVal = parse(aText);
  const bVal = parse(bText);

  const setA = (t: string) => setAText(Number(parse(t)).toLocaleString("en-US"));
  const setB = (t: string) => setBText(Number(parse(t)).toLocaleString("en-US"));

  const books = useMemo(
    () => ({ a: makeBook("A", aVal), b: makeBook("B", bVal) }),
    [aVal, bVal],
  );

  const siloed = useMemo(
    () => twoPartySiloed(books.a, books.b),
    [books],
  );
  const netted = useMemo(() => twoPartyNetted(books.a, books.b), [books]);

  const pct =
    netted.siloedCombinedUsd > 0
      ? Math.round((netted.savingsUsd / netted.siloedCombinedUsd) * 100)
      : 0;
  const nettedPct =
    netted.siloedCombinedUsd > 0
      ? (netted.nettedCombinedUsd / netted.siloedCombinedUsd) * 100
      : 0;

  return (
    <section
      aria-label="Live netting calculator"
      className="rounded-xl border border-border bg-card p-6 md:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" aria-hidden />
          <h2 className="text-xl font-medium tracking-tight">Live netting calculator</h2>
        </div>
        <span className="rounded-full border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          simulated · same formula as the sealed path
        </span>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-7">
          <PartyControl
            title="Party A — SOL lend"
            haircutLabel="haircut 10%"
            notional={aVal}
            text={aText}
            im={siloed.siloedA}
            onText={setA}
          />
          <PartyControl
            title="Party B — SOL-PERP short"
            haircutLabel="haircut 15%"
            notional={bVal}
            text={bText}
            im={siloed.siloedB}
            onText={setB}
          />
        </div>

        <div className="rounded-lg border border-primary/30 bg-background/40 p-5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Combined net margin — live
          </p>
          <p className="mt-2 font-mono text-3xl font-medium tabular-nums md:text-4xl">
            {usd(netted.nettedCombinedUsd)}
          </p>

          <div className="mt-5 space-y-3.5">
            <div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">Siloed combined</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {usd(netted.siloedCombinedUsd)}
                </span>
              </div>
              <div className="mt-1.5">
                <Bar pct={100} tone="muted" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-foreground">Netted combined</span>
                <span className="font-mono tabular-nums text-foreground">
                  {usd(netted.nettedCombinedUsd)}
                </span>
              </div>
              <div className="mt-1.5">
                <Bar pct={nettedPct} tone="primary" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-success">Capital freed</span>
                <span className="font-mono tabular-nums text-success">
                  {usd(netted.savingsUsd)} · {pct}%
                </span>
              </div>
              <div className="mt-1.5">
                <Bar pct={pct} tone="success" />
              </div>
            </div>
          </div>

          <p className="mt-5 font-mono text-[11px] leading-relaxed text-muted-foreground tabular-nums">
            A +{aVal.toLocaleString("en-US")} · B −{bVal.toLocaleString("en-US")} → net SOL exposure{" "}
            {usd(Math.abs(netted.netExposureUsd))}
          </p>
        </div>
      </div>
    </section>
  );
}
