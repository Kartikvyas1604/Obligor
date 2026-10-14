"use client";

import { useMemo } from "react";
import { Activity, Info } from "lucide-react";
import { usd, type PositionLeg } from "@/lib/margin";
import { analyzeRisk, stressPortfolio } from "@/lib/risk";

function pct(n: number, decimals = 1) {
  return `${(n * 100).toFixed(decimals)}%`;
}

function signedUsd(n: number, decimals = 0) {
  const s = usd(Math.abs(n), decimals);
  return n < 0 ? `−${s}` : `+${s}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Desk-book risk analytics. Every figure is deterministic and derived from the
 * priced legs on screen; the stress rows are explicit mark shocks and haircut
 * multipliers, not a probabilistic VaR. Not investment advice.
 */
export function RiskPanel({ legs, label = "Book" }: { legs: PositionLeg[]; label?: string }) {
  const report = useMemo(() => analyzeRisk(legs), [legs]);
  const stress = useMemo(() => stressPortfolio(legs), [legs]);

  if (!report) return null;

  const biasLabel =
    Math.abs(report.directionalBias) < 0.05
      ? "balanced"
      : report.directionalBias > 0
        ? "net long"
        : "net short";

  return (
    <section aria-label={`${label} risk analytics`} className="rounded-2xl border border-border bg-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Activity className="h-4 w-4" aria-hidden />
            {label} risk analytics
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Deterministic metrics from priced legs. Stress rows are explicit shocks, not VaR. Not advice.
          </p>
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
          {report.legCount} leg{report.legCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Gross notional" value={usd(report.grossNotionalUsd, 0)} />
        <Stat label="Net exposure" value={signedUsd(report.netExposureUsd)} hint={biasLabel} />
        <Stat label="Margin (IM)" value={usd(report.imUsd, 0)} hint={`blended ${pct(report.weightedHaircut)}`} />
        <Stat
          label="Gross / margin"
          value={report.grossToMargin > 0 ? `${report.grossToMargin.toFixed(1)}×` : "—"}
          hint="capital per $1 margin"
        />
        <Stat
          label="Concentration"
          value={pct(report.concentrationHhi, 0)}
          hint={`~${report.effectiveBuckets.toFixed(1)} effective buckets`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Exposure by bucket</p>
          <ul className="space-y-1.5">
            {report.buckets.map((b) => (
              <li key={b.bucket} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-mono text-foreground">
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {b.bucketClass}
                    </span>
                    {b.bucket}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {signedUsd(b.netExposureUsd)} net · {pct(b.share, 0)}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
                  <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.round(b.share * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">
            Venues: {report.venues.map((v) => `${v.venue} ${pct(v.share, 0)}`).join(" · ")}
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Stress scenarios</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase text-muted-foreground">
                  <th className="pb-2 font-normal">Scenario</th>
                  <th className="pb-2 text-right font-normal">P&amp;L</th>
                  <th className="pb-2 text-right font-normal">Margin Δ</th>
                </tr>
              </thead>
              <tbody>
                {stress.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-2 pr-2">
                      <span className="font-medium text-foreground">{s.name}</span>
                      <span className="block text-[10px] text-muted-foreground">{s.description}</span>
                    </td>
                    <td
                      className={`py-2 text-right font-mono tabular-nums ${s.pnlUsd < 0 ? "text-destructive" : "text-success"}`}
                    >
                      {signedUsd(s.pnlUsd)}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {s.imDeltaUsd >= 0 ? "+" : "−"}
                      {usd(Math.abs(s.imDeltaUsd), 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[10px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            Mark shocks scale each bucket&rsquo;s notional; the margin spiral widens haircuts. Same inputs always
            produce the same output.
          </p>
        </div>
      </div>
    </section>
  );
}
