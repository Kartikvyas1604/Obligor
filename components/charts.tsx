"use client";

import { usd, type PositionLeg } from "@/lib/margin";

/**
 * Lightweight dependency-free SVG charts built on theme CSS variables so they
 * render correctly in light and dark mode. All animations respect
 * prefers-reduced-motion via the motion-reduce:transition-none utility.
 */

/** Donut showing how much of the combined siloed margin a netted book frees up. */
export function MarginDonut({
  siloedCombined,
  netted,
  savings,
  size = 168,
}: {
  siloedCombined: number;
  netted: number;
  savings: number;
  size?: number;
}) {
  const total = Math.max(siloedCombined, 1);
  const freedPct = Math.max(0, Math.min(1, savings / total));
  const keptPct = Math.max(0, Math.min(1, netted / total));

  const r = (size - 20) / 2;
  const c = 2 * Math.PI * r;

  // Full ring = siloed margin. Freed slice (success) + kept slice (foreground).
  const keptFrac = keptPct;
  const freedFrac = freedPct;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Of ${usd(siloedCombined, 0)} siloed margin, ${usd(netted, 0)} is still required and ${usd(savings, 0)} is freed by netting`}
      className="shrink-0"
    >
      {/* track = siloed combined */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={12}
      />
      {/* kept margin */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={12}
        strokeLinecap="butt"
        strokeDasharray={`${c * keptFrac} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
      />
      {/* freed margin */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--success)"
        strokeWidth={12}
        strokeLinecap="butt"
        strokeDasharray={`${c * freedFrac} ${c}`}
        strokeDashoffset={-c * keptFrac}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
      />
      <text
        x="50%"
        y="47%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--foreground)"
        className="font-mono"
        fontSize={size * 0.16}
        fontWeight={600}
      >
        {Math.round(freedPct * 100)}%
      </text>
      <text
        x="50%"
        y="61%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--muted-foreground)"
        className="font-mono"
        fontSize={size * 0.07}
      >
        freed
      </text>
    </svg>
  );
}

/** Diverging per-leg exposure bars. Long/lend extends right (green), short/borrow left (red). */
export function ExposureBars({ legs }: { legs: PositionLeg[] }) {
  const maxAbs = Math.max(...legs.map((l) => Math.abs(l.signedExposureUsd)), 1);
  return (
    <div
      role="img"
      aria-label="Chart of signed exposure per leg"
      className="space-y-1.5 px-4 pb-4 pt-3"
    >
      {legs.map((leg, i) => {
        const pct = (Math.abs(leg.signedExposureUsd) / maxAbs) * 50;
        const positive = leg.signedExposureUsd >= 0;
        return (
          <div key={`${leg.instrument}-${i}`} className="flex items-center gap-2 text-[11px]">
            <span className="w-24 shrink-0 truncate font-mono text-muted-foreground">
              {leg.instrument}
            </span>
            <div className="relative h-3.5 flex-1 rounded-sm bg-secondary">
              <div className="absolute left-1/2 top-0 h-full w-px bg-border" aria-hidden />
              <div
                className="absolute top-0 h-full rounded-sm transition-[left,width] duration-500 ease-out motion-reduce:transition-none"
                style={
                  positive
                    ? { left: "50%", width: `${pct}%`, background: "var(--success)" }
                    : { left: `${50 - pct}%`, width: `${pct}%`, background: "var(--destructive)" }
                }
              />
            </div>
            <span
              className="w-16 shrink-0 text-right font-mono tabular-nums"
              style={{ color: positive ? "var(--success)" : "var(--destructive)" }}
            >
              {positive ? "+" : "−"}
              {usd(Math.abs(leg.notionalUsd), 0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Two comparable bars (e.g. siloed vs netted) for one desk pair. */
export function PairCompareBars({
  label,
  siloed,
  netted,
  show,
}: {
  label: string;
  siloed: number;
  netted: number;
  show: boolean;
}) {
  const max = Math.max(siloed, netted, 1);
  return (
    <div className="space-y-2" role="img" aria-label={`${label}: siloed ${usd(siloed, 0)} vs netted ${show ? usd(netted, 0) : "pending"}`}>
      <div>
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-muted-foreground">Siloed</span>
          <span className="font-mono tabular-nums text-muted-foreground">{usd(siloed, 0)}</span>
        </div>
        <div className="mt-1 h-2.5 rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-muted-foreground/40 transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: "100%" }}
          />
        </div>
      </div>
      <div>
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="font-medium">Netted</span>
          <span className="font-mono tabular-nums">{show ? usd(netted, 0) : "· · ·"}</span>
        </div>
        <div className="mt-1 h-2.5 rounded-full bg-secondary">
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{
              width: show ? `${(netted / max) * 100}%` : "0%",
              background: "var(--success)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Column chart of freed capital per desk pair across a parallel epoch. */
export function FreedCapitalColumns({
  pairs,
}: {
  pairs: Array<{ label: string; savingsUsd: number; show: boolean }>;
}) {
  const max = Math.max(...pairs.map((p) => p.savingsUsd), 1);
  const any = pairs.some((p) => p.show);
  return (
    <div
      role="img"
      aria-label="Column chart of capital freed per desk pair"
      className="flex h-40 items-end justify-around gap-3 border-b border-border px-2"
    >
      {pairs.map((p) => (
        <div key={p.label} className="flex h-full w-14 min-w-0 flex-col items-center justify-end gap-2">
          <span
            className="font-mono text-[10px] tabular-nums"
            style={{ color: p.show ? "var(--success)" : "var(--muted-foreground)" }}
          >
            {p.show ? usd(p.savingsUsd, 0) : "—"}
          </span>
          <div
            className="w-full max-w-10 rounded-t-sm transition-[height] duration-700 ease-out motion-reduce:transition-none"
            style={{
              height: p.show ? `${Math.max((p.savingsUsd / max) * 78, 4)}%` : "3%",
              background: p.show ? "var(--success)" : "var(--muted)",
            }}
          />
          <span className="w-full truncate pb-1 text-center font-mono text-[10px] text-muted-foreground" title={p.label}>
            {p.label}
          </span>
        </div>
      ))}
      {any && <span className="sr-only">Values shown are capital freed per pair</span>}
    </div>
  );
}
