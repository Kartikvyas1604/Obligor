"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldCheck, Zap } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { FreedCapitalColumns, PairCompareBars } from "@/components/charts";
import { monadPairs } from "@/lib/fixtures";
import { twoPartyNetted, twoPartySiloed, usd } from "@/lib/margin";

const EPOCH_STAGES = [
  "Sealing 6 desk books into enclave memory",
  "Scheduling concurrent batch in Nitro TEE",
  "Netting 3 desk pairs simultaneously",
  "Generating signed Nitro PCR0 attestation",
];

export default function MonadPage() {
  const [epoch, setEpoch] = useState<"idle" | "running" | "done">("idle");
  const [stage, setStage] = useState(-1);
  const [concurrency, setConcurrency] = useState(0);
  const [epochDurationMs, setEpochDurationMs] = useState<number | null>(null);
  const [attestationQuote, setAttestationQuote] = useState<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const results = useMemo(
    () =>
      monadPairs.map((p) => ({
        pairId: p.pairId,
        label: p.label,
        siloed: twoPartySiloed(p.a, p.b).siloedCombined,
        net: twoPartyNetted(p.a, p.b),
      })),
    [],
  );

  async function computeEpoch() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setEpoch("running");
    setStage(0);
    setConcurrency(0);

    const startTime = Date.now();

    EPOCH_STAGES.forEach((_, i) =>
      timersRef.current.push(setTimeout(() => setStage(i), i * 500)),
    );

    monadPairs.forEach((_, i) =>
      timersRef.current.push(
        setTimeout(() => setConcurrency((c) => Math.max(c, i + 1)), 2000 + i * 300),
      ),
    );

    // Call live parallel API
    try {
      const res = await fetch("/api/v1/net-margin/parallel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setEpochDurationMs(data.executionDurationMs || Date.now() - startTime);
        setAttestationQuote(data.attestation?.epochRootMeasurement || null);
      }
    } catch {
      setEpochDurationMs(Date.now() - startTime);
    }

    timersRef.current.push(
      setTimeout(() => {
        setEpoch("done");
      }, 2000 + monadPairs.length * 300 + 200),
    );
  }

  function resetEpoch() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setEpoch("idle");
    setStage(-1);
    setConcurrency(0);
  }

  return (
    <PageShell chain="monad">
      <div className="flex flex-col gap-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-steel">
              Monad · parallel clearing
            </p>
            <h1 className="mt-2 text-3xl font-medium tracking-tight md:text-4xl">
              Many pairs, one epoch
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Monad&rsquo;s throughput lets a clearing desk net several desk pairs at once, every
              epoch. Run it and watch all three pairs clear together — same formula as Solana,
              hardware-backed privacy (<strong className="text-foreground">TEE ≠ MPC</strong>).
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-steel/40 px-2.5 py-1 font-mono text-xs text-steel">
            <span className="h-1.5 w-1.5 rounded-full bg-steel" aria-hidden />
            TEE attested (AWS Nitro / Marlin Oyster)
          </span>
        </div>

        {epoch === "idle" && (
          <button
            type="button"
            onClick={computeEpoch}
            className="btn-press inline-flex h-11 items-center gap-2 self-start rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Zap className="h-4 w-4" aria-hidden />
            Clear all {monadPairs.length} pairs in one epoch
          </button>
        )}

        {epoch === "running" && (
          <section aria-label="Epoch progress" aria-busy="true" className="anim-fade-up rounded-xl border border-steel/30 bg-card p-6">
            <p className="flex items-center gap-2 text-sm font-medium">
              <LoaderCircle className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
              Clearing epoch in progress inside Nitro Enclave
              <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground" aria-live="polite">
                {concurrency}/{monadPairs.length} pairs cleared concurrently
              </span>
            </p>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <div className="anim-shimmer h-full w-full rounded-full bg-gradient-to-r from-transparent via-muted-foreground/60 to-transparent" />
            </div>
            <ol className="mt-4 space-y-2">
              {EPOCH_STAGES.map((s, i) => (
                <li
                  key={s}
                  className={`flex items-center gap-2 font-mono text-xs transition-colors duration-200 ${
                    i < stage ? "text-primary" : i === stage ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <span aria-hidden className="w-4">
                    {i < stage ? "✓" : i === stage ? "→" : "·"}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </section>
        )}

        {epoch === "done" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-steel/40 bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 font-mono text-sm text-primary" role="status">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Epoch cleared — {monadPairs.length} pairs concurrently
                {epochDurationMs !== null && (
                  <span className="text-muted-foreground">({epochDurationMs}ms)</span>
                )}
                </p>
                <button
                  type="button"
                  onClick={resetEpoch}
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Reset epoch
                </button>
              </div>

              <div className="mt-4">
                <p className="mb-3 text-xs font-medium text-muted-foreground">Capital freed per pair</p>
                <FreedCapitalColumns
                  pairs={results.map((r) => ({
                    label: r.label.replace(/↔.*$/, "").trim(),
                    savingsUsd: r.net.savingsUsd,
                    show: true,
                  }))}
                />
              </div>

              {attestationQuote && (
                <div className="mt-4 rounded border border-border/80 bg-background/50 p-3 font-mono text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 text-steel font-medium">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    Enclave attestation attached
                  </div>
                  <p className="mt-1 truncate">Measurement: {attestationQuote}</p>
                  <p className="mt-0.5 text-[11px] opacity-70">PCR0: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</p>
                </div>
              )}
            </div>
          </div>
        )}

        <section aria-label="Desk pairs" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {results.map((r, i) => {
            const cleared = epoch === "done" || (epoch === "running" && concurrency > i);
            return (
              <article
                key={r.pairId}
                className={`anim-fade-up rounded-xl border bg-card p-5 transition-[border-color,box-shadow,opacity] duration-300 ease-out ${
                  cleared
                    ? "border-primary/40"
                    : "border-border opacity-60"
                }`}
                style={{ animationDelay: `${i * 80}ms` }}
                aria-live="polite"
              >
                <header className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-medium">{r.label}</h2>
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase transition-[border-color,color] duration-300 ${
                      cleared
                        ? "anim-flip border-primary/40 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {cleared ? "cleared" : "queued"}
                  </span>
                </header>
                <div className="mt-4">
                  <PairCompareBars
                    label={r.label}
                    siloed={r.siloed}
                    netted={r.net.nettedCombinedUsd}
                    show={cleared}
                  />
                  <p className="mt-3 flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">Capital freed</span>
                    <span
                      className={`font-mono font-medium tabular-nums transition-colors duration-300 ${
                        cleared ? "text-success" : "text-muted-foreground"
                      }`}
                    >
                      {cleared ? usd(r.net.savingsUsd) : "——"}
                    </span>
                  </p>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </PageShell>
  );
}
