"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Zap,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { FreedCapitalColumns, PairCompareBars } from "@/components/charts";
import { type PositionBook, type NetMarginResult, siloedIm } from "@/lib/margin";

const EPOCH_STAGES = [
  "Sealing desk pairs into enclave envelopes",
  "Scheduling the concurrent batch",
  "Netting 3+ desk pairs simultaneously",
  "Generating signed attestation",
];

interface DemoPair {
  pairId: string;
  label: string;
  a: PositionBook;
  b: PositionBook;
}

interface EpochPairResult {
  pairId: string;
  label: string;
  margin: NetMarginResult;
  warnings?: string[];
}

interface EpochResponse {
  ok: boolean;
  epochId: string;
  concurrency: number;
  executionDurationMs: number;
  pairs: EpochPairResult[];
  attestation: {
    provider: string;
    quote?: string;
    verified: boolean;
    note?: string;
  } | null;
  message?: string;
}

/**
 * Monad parallel clearing screen. Pairs come from the gated demo endpoint,
 * netting happens on the server (where the enclave backend lives), and every
 * failure mode has an honest error state with retry.
 */
export default function MonadPage() {
  const [epoch, setEpoch] = useState<"idle" | "running" | "done" | "error">("idle");
  const [stage, setStage] = useState(-1);
  const [stageError, setStageError] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [pairs, setPairs] = useState<DemoPair[]>([]);
  const [pairResults, setPairResults] = useState<Map<string, EpochPairResult>>(new Map());
  const [epochDurationMs, setEpochDurationMs] = useState<number | null>(null);
  const [attestationNote, setAttestationNote] = useState<string | null>(null);
  const [attestationQuote, setAttestationQuote] = useState<string | null>(null);
  const [epochId, setEpochId] = useState<string | null>(null);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  async function loadDemoPairs(): Promise<DemoPair[] | null> {
    const res = await fetch("/api/v1/demo/fixture-parallel-pairs", { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setDemoError(body?.message ?? `Demo endpoint returned ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { pairs: DemoPair[] };
    setDemoError(null);
    setPairs(data.pairs);
    return data.pairs;
  }

  async function preloadPairs() {
    setEpoch("running");
    setStage(0);
    setStageError(null);
    await loadDemoPairs();
    setEpoch("idle");
  }

  useEffect(() => {
    const t = setTimeout(() => void preloadPairs(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function computeEpoch() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    setStageError(null);
    setEpoch("running");
    setStage(0);
    setPairResults(new Map());
    setEpochDurationMs(null);

    EPOCH_STAGES.forEach((_, i) =>
      timersRef.current.push(setTimeout(() => setStage(i), i * 500)),
    );

    try {
      const pairsToClear = pairs.length > 0 ? pairs : (await loadDemoPairs());
      if (!pairsToClear) {
        setStageError(demoError ?? "Demo pairs unavailable");
        setEpoch("error");
        return;
      }

      const res = await fetch("/api/v1/net-margin/parallel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: "monad",
          pairs: pairsToClear.map((p) => ({
            pairId: p.pairId,
            label: p.label,
            a: {
              wallet: p.a.wallet || "demo-desa-a",
              legs: p.a.legs.map((l) => ({
                venue: l.venue === "monad_fixture" ? "monad_fixture" : l.venue,
                instrument: l.instrument,
                bucket: l.bucket,
                side: l.side,
                qty: l.qty,
                markUsd: l.markUsd,
              })),
            },
            b: {
              wallet: p.b.wallet || "demo-desk-b",
              legs: p.b.legs.map((l) => ({
                venue: l.venue === "monad_fixture" ? "monad_fixture" : l.venue,
                instrument: l.instrument,
                bucket: l.bucket,
                side: l.side,
                qty: l.qty,
                markUsd: l.markUsd,
              })),
            },
          })),
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setStageError(body?.message ?? `Epoch failed (${res.status})`);
        setEpoch("error");
        return;
      }

      const data = (await res.json()) as EpochResponse;
      setEpochId(data.epochId);
      setEpochDurationMs(data.executionDurationMs);
      setPairResults(new Map(data.pairs.map((p) => [p.pairId, p])));
      setAttestationQuote(data.attestation?.quote ?? null);
      setAttestationNote(data.attestation?.note ?? null);
    } catch {
      setStageError("Network error — the epoch never reached the enclave backend");
      setEpoch("error");
      return;
    }

    timersRef.current.push(
      setTimeout(() => {
        setEpoch("done");
      }, EPOCH_STAGES.length * 500 + 200),
    );
  }

  function resetEpoch() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setEpoch("idle");
    setStage(-1);
    setStageError(null);
    setPairResults(new Map());
    setEpochDurationMs(null);
    setAttestationNote(null);
    setAttestationQuote(null);
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
              epoch. Same formula as Solana, hardware-backed privacy (
              <strong className="text-foreground">TEE ≠ MPC</strong>).
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-steel/40 px-2.5 py-1 font-mono text-xs text-steel">
            <span className="h-1.5 w-1.5 rounded-full bg-steel" aria-hidden />
            TEE attested
          </span>
        </div>

        {(demoError || stageError || (pairs.length > 0 && pairs.length < 3)) && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div className="text-sm space-y-2">
              <p className="font-semibold text-destructive">Parallel clearing needs desk pairs</p>
              <p className="text-muted-foreground">
                {demoError ??
                  stageError ??
                  `Only ${pairs.length} pair(s) available — the epoch requires at least 3.`}
              </p>
              <button
                type="button"
                onClick={() => void preloadPairs()}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                Retry loading pairs
              </button>
            </div>
          </div>
        )}

        {epoch === "idle" && pairs.length >= 3 && (
          <button
            type="button"
            onClick={computeEpoch}
            className="btn-press inline-flex h-11 w-fit items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Zap className="h-4 w-4" aria-hidden />
            Clear all {pairs.length} pairs in one epoch
          </button>
        )}

        {epoch === "running" && (
          <section aria-label="Epoch progress" aria-busy="true" className="anim-fade-up rounded-xl border border-steel/30 bg-card p-6">
            <p className="flex items-center gap-2 text-sm font-medium">
              <LoaderCircle className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
              Clearing epoch in progress inside the enclave
              {pairResults.size > 0 && (
                <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground" aria-live="polite">
                  {pairResults.size}/3 pairs cleared concurrently
                </span>
              )}
            </p>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <div className="anim-shimmer h-full w-full rounded-full bg-gradient-to-r from-transparent via-muted-foreground/60 to-transparent motion-reduce:animate-none" />
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
                  Epoch cleared — {pairResults.size} pairs concurrently
                  {epochDurationMs !== null && (
                    <span className="text-muted-foreground">({epochDurationMs}ms)</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={resetEpoch}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden />
                  Reset epoch
                </button>
              </div>

              <div className="mt-4">
                <p className="mb-3 text-xs font-medium text-muted-foreground">Capital freed per pair</p>
                <FreedCapitalColumns
                  pairs={pairs.map((p) => ({
                    label: p.label.replace(/↔.*$/, "").trim(),
                    savingsUsd: pairResults.get(p.pairId)?.margin.savingsUsd ?? 0,
                    show: pairResults.has(p.pairId),
                  }))}
                />
              </div>

              {attestationNote && (
                <p className="mt-3 rounded border border-steel/30 bg-steel/5 p-2 text-[11px] leading-relaxed text-muted-foreground">
                  {attestationNote}
                </p>
              )}

              {attestationQuote && (
                <div className="mt-4 rounded border border-border/80 bg-background/50 p-3 font-mono text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 text-steel font-medium">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    Enclave attestation metadata attached
                  </div>
                  <p className="mt-1 truncate">{attestationQuote}</p>
                </div>
              )}

              {epochId && (
                <p className="mt-3 font-mono text-[11px] text-muted-foreground">epoch {epochId}</p>
              )}
            </div>
          </div>
        )}

        {pairs.length > 0 && (
          <section aria-label="Desk pairs" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pairs.map((p, i) => {
              const result = pairResults.get(p.pairId);
              const cleared = Boolean(result);
              const siloed = siloedIm([...p.a.legs, ...p.b.legs]);
              const showDemoHint = !cleared && epoch === "done";
              return (
                <article
                  key={p.pairId}
                  className={`anim-fade-up rounded-xl border bg-card p-5 transition-[border-color,box-shadow,opacity] duration-300 ease-out ${
                    cleared ? "border-primary/40" : "border-border opacity-60"
                  }`}
                  style={{ animationDelay: `${i * 80}ms` }}
                  aria-live="polite"
                >
                  <header className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-medium">{p.label}</h2>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase transition-[border-color,color] duration-300 ${
                        cleared ? "anim-flip border-primary/40 text-primary" : "border-border text-muted-foreground"
                      }`}
                    >
                      {showDemoHint ? "not cleared" : cleared ? "cleared" : "queued"}
                    </span>
                  </header>
                  <div className="mt-4">
                    <PairCompareBars
                      label={p.label}
                      siloed={cleared ? result!.margin.siloedCombinedUsd : siloed}
                      netted={result?.margin.nettedCombinedUsd ?? 0}
                      show={cleared}
                    />
                    <p className="mt-3 flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground">Capital freed</span>
                      <span
                        className={`font-mono font-medium tabular-nums transition-colors duration-300 ${
                          cleared ? "text-success" : "text-muted-foreground"
                        }`}
                      >
                        {cleared
                          ? result!.margin.savingsUsd.toLocaleString("en-US", {
                              style: "currency",
                              currency: "USD",
                              maximumFractionDigits: 0,
                            })
                          : "——"}
                      </span>
                    </p>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </PageShell>
  );
}
