"use client";

import { useState } from "react";
import { ArrowRight, Layers, LoaderCircle, ShieldAlert } from "lucide-react";
import { usd } from "@/lib/margin";

type RawLeg = {
  venue: string;
  instrument: string;
  bucket: string;
  side: "long" | "short" | "lend" | "borrow";
  qty: number;
  markUsd: number;
};

interface FixtureParty {
  party: string;
  label: string;
  wallet: string;
  warnings: string[];
  legs: Array<RawLeg & { party?: string }>;
}

interface BucketRow {
  bucket: string;
  exposureUsd: number;
  haircut: number;
  imUsd: number;
}

interface MultiResult {
  computationId: string;
  commitmentHash: string;
  parties: Array<{ party: string; legCount: number; warnings?: string[] }>;
  margin: {
    siloedCombinedUsd: number;
    nettedCombinedUsd: number;
    savingsUsd: number;
    grossNotionalUsd: number;
    perPartySiloedUsd: Record<string, number>;
    buckets: BucketRow[];
  };
  warnings?: string[];
}

function serializeLegs(legs: Array<RawLeg & { party?: string }>) {
  return legs.map((l) => {
    const copy = { ...l };
    delete (copy as { party?: string }).party;
    return copy;
  });
}

/**
 * N=3 judge demo (J3): load three desks whose exposures offset each other,
 * then net all three in one engine pass. Shows the honest collapse: each desk's
 * siloed margin, the combined netted margin, and the per-bucket residual.
 */
export function ThreePartyCard() {
  const [fixtures, setFixtures] = useState<FixtureParty[] | null>(null);
  const [loadingFixture, setLoadingFixture] = useState(false);
  const [netting, setNetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MultiResult | null>(null);

  async function loadFixture() {
    setLoadingFixture(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/v1/demo/fixture-three-party", { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { parties?: FixtureParty[]; message?: string }
        | null;
      if (!res.ok || !body?.parties) {
        setError(body?.message ?? "Fixture unavailable — it is gated behind DEMO_ALLOW_FIXTURES.");
        return;
      }
      setFixtures(body.parties);
    } catch {
      setError("Could not reach the demo endpoint.");
    } finally {
      setLoadingFixture(false);
    }
  }

  async function netAll() {
    if (!fixtures || fixtures.length < 3) return;
    setNetting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/v1/net-margin/multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: "solana",
          parties: fixtures.map((f) => ({
            party: f.party,
            wallet: f.wallet,
            legs: serializeLegs(f.legs),
          })),
          demoPayment: true,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { margin?: MultiResult["margin"]; parties?: MultiResult["parties"]; warnings?: string[];
            computationId?: string; commitmentHash?: string; message?: string }
        | null;
      if (!res.ok || !body?.margin) {
        setError(body?.message ?? `Netting returned ${res.status}.`);
        return;
      }
      setResult({
        computationId: body.computationId ?? "",
        commitmentHash: body.commitmentHash ?? "",
        parties: body.parties ?? [],
        margin: body.margin,
        warnings: body.warnings,
      });
    } catch {
      setError("Network error while netting all three desks.");
    } finally {
      setNetting(false);
    }
  }

  const loaded = Boolean(fixtures && fixtures.length >= 3);
  const busy = loadingFixture || netting;
  const collapsePct = result
    ? result.margin.siloedCombinedUsd > 0
      ? Math.round((result.margin.savingsUsd / result.margin.siloedCombinedUsd) * 100)
      : 0
    : null;

  return (
    <section
      aria-label="Three-desk netting demo"
      className="rounded-lg border border-border bg-card p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-primary">
            <Layers className="h-3.5 w-3.5" aria-hidden />
            <span>N = 3</span>
          </div>
          <h2 className="mt-1.5 text-lg font-semibold tracking-tight">Three desks, one residual</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Three counterparties in a netting cycle: A is long SOL, B carries the SOL short, C holds
            the offset in BTC / tAAPL. Net all three in one engine pass — no two-party pairing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadFixture}
            disabled={busy}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-secondary px-3 text-sm font-medium transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {loadingFixture ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              "Load fixture"
            )}
          </button>
          <button
            type="button"
            onClick={netAll}
            disabled={!loaded || netting}
            className="btn-light inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {netting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <>
                Net all three
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {loaded && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {fixtures!.map((f) => (
            <div key={f.party} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-primary">
                  Desk {f.party}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{f.legs.length} legs</span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground" title={f.label}>
                {f.label}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {f.legs.map((l) => (
                  <span
                    key={l.instrument}
                    className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {l.instrument}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className="mt-5 space-y-4" aria-live="polite">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Combined siloed", value: usd(result.margin.siloedCombinedUsd), strong: false },
              { label: "Combined netted", value: usd(result.margin.nettedCombinedUsd), strong: true },
              { label: "Freed margin", value: usd(result.margin.savingsUsd), strong: false },
              { label: "Collapse", value: collapsePct !== null ? `${collapsePct}%` : "–", strong: false },
            ].map((s) => (
              <div key={s.label} className="rounded-md border border-border bg-background p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </p>
                <p className={`mt-1 font-mono ${s.strong ? "text-success" : "text-foreground"}`}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Per-desk siloed margin</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 font-medium">Desk</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Siloed margin</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.margin.perPartySiloedUsd ?? {}).map(([party, val]) => (
                  <tr key={party} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{party}</td>
                    <td className="px-3 py-2 text-right font-mono">{usd(val)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full min-w-[520px] text-left text-sm">
              <caption className="sr-only">Residual exposure per risk bucket after netting</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 font-medium">Bucket</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Net exposure</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Haircut</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {result.margin.buckets.map((b) => (
                  <tr key={b.bucket} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{b.bucket}</td>
                    <td className="px-3 py-2 text-right font-mono">{usd(b.exposureUsd)}</td>
                    <td className="px-3 py-2 text-right font-mono">{Math.round(b.haircut * 100)}%</td>
                    <td className="px-3 py-2 text-right font-mono text-success">{usd(b.imUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs font-mono text-muted-foreground">
            {result.computationId && (
              <span className="text-success">
                Committed <span className="text-muted-foreground">·</span>{" "}
                {result.computationId.slice(0, 12)}…
              </span>
            )}{" "}
            {result.warnings && result.warnings.length > 0
              ? `· ${result.warnings.length} warning(s), listed in the raw API response.`
              : "· Aggregate-only output — no per-leg plaintext is returned to the room."}
          </p>
        </div>
      )}
    </section>
  );
}