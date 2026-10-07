"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { usd, type NetMarginResult } from "@/lib/margin";
import { useCountUp } from "@/hooks/use-count-up";
import { MarginDonut } from "@/components/charts";

function Bar({ target, tone, delay = 0 }: { target: number; tone: "primary" | "success" | "muted"; delay?: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(target), 30);
    return () => clearTimeout(t);
  }, [target]);
  const cls =
    tone === "primary" ? "bg-primary" : tone === "success" ? "bg-success" : "bg-muted-foreground/40";
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out ${cls}`}
        style={{ width: `${w}%`, transitionDelay: `${delay}ms` }}
      />
    </div>
  );
}

export function MarginHero({
  result,
  siloedCombined,
  onReset,
}: {
  result: NetMarginResult;
  siloedCombined: number;
  onReset: () => void;
}) {
  const pct = useMemo(
    () => (siloedCombined > 0 ? Math.round((result.savingsUsd / siloedCombined) * 100) : 0),
    [result.savingsUsd, siloedCombined],
  );

  const nettedValue = useCountUp(result.nettedCombinedUsd, true);
  const savingsValue = useCountUp(result.savingsUsd, true, 1100);

  const nettedPct = siloedCombined > 0 ? (result.nettedCombinedUsd / siloedCombined) * 100 : 100;
  const savingsPct = siloedCombined > 0 ? (result.savingsUsd / siloedCombined) * 100 : 0;

  const [announced, setAnnounced] = useState(false);

  return (
    <section
      aria-label="Two-party margin result"
      className="anim-fade-up rounded-xl border border-primary/40 bg-card p-6 md:p-8"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Combined net margin
          </p>
          <p
            className={`mt-2 font-mono text-4xl font-medium tabular-nums md:text-5xl ${
              announced ? "" : "flash-accent"
            }`}
            onAnimationEnd={() => setAnnounced(true)}
          >
            {usd(nettedValue)}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground tabular-nums">
            net exposure {usd(Math.abs(result.netExposureUsd))}
          </p>
          <div className="mt-5 max-w-sm text-right md:text-left">
            <p className="text-xs text-muted-foreground">Capital freed by netting</p>
            <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-success">
              {usd(savingsValue)}
            </p>
            <p className="font-mono text-xs tabular-nums text-success">{pct}% vs siloed</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 self-center">
          <MarginDonut
            siloedCombined={result.siloedCombinedUsd}
            netted={result.nettedCombinedUsd}
            savings={result.savingsUsd}
          />
          <div className="flex items-center gap-4 font-mono text-[11px] text-muted-foreground" aria-hidden>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success" />
              freed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-foreground" />
              kept
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">Siloed combined</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {usd(result.siloedCombinedUsd)}
            </span>
          </div>
          <div className="mt-1.5">
            <Bar target={100} tone="muted" />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-foreground">Netted combined</span>
            <span className="font-mono tabular-nums text-foreground">
              {usd(result.nettedCombinedUsd)}
            </span>
          </div>
          <div className="mt-1.5">
            <Bar target={nettedPct} tone="primary" delay={200} />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-success">Savings</span>
            <span className="font-mono tabular-nums text-success">{usd(result.savingsUsd)}</span>
          </div>
          <div className="mt-1.5">
            <Bar target={savingsPct} tone="success" delay={400} />
          </div>
        </div>
      </div>

      <details className="group mt-6 rounded-lg border border-border bg-background/50 px-4 py-3 transition-colors duration-150 open:border-primary/40">
        <summary className="cursor-pointer text-sm font-medium transition-colors duration-150 group-open:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Bucket breakdown
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            {result.buckets.length} risk buckets
          </span>
        </summary>
        <ul className="mt-3 divide-y divide-border/60">
          {result.buckets.map((b, i) => (
            <li
              key={b.bucket}
              className="anim-fade-up flex items-center justify-between gap-3 py-2.5 text-sm"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span className="w-16 font-mono text-xs uppercase text-muted-foreground">{b.bucket}</span>
              <span className="flex-1">
                <Bar
                  target={
                    result.siloedCombinedUsd > 0
                      ? (b.imUsd / result.siloedCombinedUsd) * 100
                      : 0
                  }
                  tone="primary"
                />
              </span>
              <span className="w-24 text-right font-mono text-sm tabular-nums">{usd(b.imUsd)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Simplified bucket-haircut sketch — not SPAN/SIMM/CCP waterfall.
        </p>
      </details>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onReset}
          className="btn-press inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          New session
        </button>
        <Link
          href="/adversarial"
          className="group inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Show the dangerous counterfactual
          <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
