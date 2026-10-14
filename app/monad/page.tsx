"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Zap,
  Upload,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { FreedCapitalColumns, PairCompareBars } from "@/components/charts";
import { type PositionLeg, type NetMarginResult, siloedIm } from "@/lib/margin";

type ImportedLeg = PositionLeg;

interface ImportedDesk {
  wallet: string;
  chain?: string;
  legs: ImportedLeg[];
  parallelLegs: Array<Pick<PositionLeg, "venue" | "instrument" | "bucket" | "side" | "qty" | "markUsd">>;
}

interface ImportedPair {
  pairId: string;
  label: string;
  warnings?: string[];
  a: ImportedDesk;
  b: ImportedDesk;
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

interface ImportError {
  row: number;
  message: string;
}

const EXAMPLE_CSV = `pair,desk,wallet,venue,instrument,bucket,side,qty,markUsd
p1,A,9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM,manual,MON lend,MON,lend,70000,1
p1,B,3BhLGpKkfirMtcC7LEmVAZ3f9sv5VMspD6MKAtd1Wq6aY,manual,MON-PERP,MON,short,75000,1
p2,A,Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS,manual,ETH long,ETH,long,20,1
p2,B,5yzwEtvhBAoVJZaWuN9MbJz2s34m5Nz3ZMiWDAfP8wkr,manual,ETH-PERP,ETH,short,20,1
p3,A,HpNfVwyTLPBmE8ibJvfFsVSCEjdE9ZjtFRennis9fPb,manual,tAAPL,AAPL,long,220,1
p3,B,8Kq1mBDtMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytX,manual,tAAPL short,AAPL,short,220,1`;

/**
 * Monad parallel clearing screen. Desk pairs arrive from a real blotter upload
 * (CSV/JSON), are oracle-priced server-side, then netted concurrently in one
 * enclave epoch. There are no preloaded fixtures and no simulated progress —
 * the busy state is backed by the actual epoch request.
 */
export default function MonadPage() {
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importRowErrors, setImportRowErrors] = useState<ImportError[]>([]);
  const [pairs, setPairs] = useState<ImportedPair[]>([]);

  const [epoch, setEpoch] = useState<"idle" | "running" | "done" | "error">("idle");
  const [stageError, setStageError] = useState<string | null>(null);
  const [pairResults, setPairResults] = useState<Map<string, EpochPairResult>>(new Map());
  const [epochDurationMs, setEpochDurationMs] = useState<number | null>(null);
  const [attestationNote, setAttestationNote] = useState<string | null>(null);
  const [attestationQuote, setAttestationQuote] = useState<string | null>(null);
  const [attestationVerified, setAttestationVerified] = useState<boolean | null>(null);
  const [epochId, setEpochId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    const content = await file.text();
    setText(content);
  }

  async function importBatch() {
    setImporting(true);
    setImportError(null);
    setImportRowErrors([]);
    try {
      const res = await fetch("/api/v1/positions/import-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "auto", chain: "monad", data: text }),
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; errors?: ImportError[]; pairs?: ImportedPair[] }
        | null;
      if (!res.ok) {
        setImportError(body?.message ?? `Import failed (${res.status})`);
        setImportRowErrors(body?.errors ?? []);
        return;
      }
      setPairs(body?.pairs ?? []);
      setEpoch("idle");
      setPairResults(new Map());
      setEpochDurationMs(null);
      setAttestationNote(null);
      setAttestationQuote(null);
      setAttestationVerified(null);
      setEpochId(null);
    } catch {
      setImportError("Network error — the batch never reached the server");
    } finally {
      setImporting(false);
    }
  }

  async function computeEpoch() {
    setStageError(null);
    setEpoch("running");
    setPairResults(new Map());
    setEpochDurationMs(null);

    try {
      const res = await fetch("/api/v1/net-margin/parallel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: "monad",
          pairs: pairs.map((p) => ({
            pairId: p.pairId,
            label: p.label,
            a: { wallet: p.a.wallet, legs: p.a.parallelLegs },
            b: { wallet: p.b.wallet, legs: p.b.parallelLegs },
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
      setAttestationVerified(data.attestation?.verified ?? null);
      setEpoch("done");
    } catch {
      setStageError("Network error — the epoch never reached the enclave backend");
      setEpoch("error");
    }
  }

  function resetEpoch() {
    setEpoch("idle");
    setStageError(null);
    setPairResults(new Map());
    setEpochDurationMs(null);
    setAttestationNote(null);
    setAttestationQuote(null);
    setAttestationVerified(null);
    setEpochId(null);
  }

  const canRun = pairs.length >= 3 && epoch !== "running";

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
              Upload a blotter of desk pairs. Monad&rsquo;s throughput lets a clearing desk net
              several pairs at once, every epoch. Same formula as Solana, hardware-backed privacy (
              <strong className="text-foreground">TEE ≠ MPC</strong>).
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs ${
              attestationVerified ? "border-primary/40 text-primary" : "border-steel/40 text-steel"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {attestationVerified
              ? "TEE attested"
              : epoch === "done"
                ? "TEE · not attested in this run"
                : "TEE · simulation"}
          </span>
        </div>

        {/* Batch upload */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Upload className="h-4 w-4" aria-hidden />
                Batch upload
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                CSV or JSON blotter. Each row: pair, desk (A/B), wallet, venue, instrument, bucket,
                side, qty, markUsd. At least three complete pairs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.json,text/csv,application/json"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden />
                Choose file
              </button>
              <button
                type="button"
                onClick={() => setText(EXAMPLE_CSV)}
                className="inline-flex h-9 items-center rounded-full border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Paste example
              </button>
            </div>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={EXAMPLE_CSV}
            aria-label="Batch blotter contents"
            className="w-full rounded-lg border border-border bg-secondary p-3 font-mono text-[11px] leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={importing || text.trim() === ""}
              onClick={() => void importBatch()}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none"
            >
              {importing ? (
                <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Upload className="h-4 w-4" aria-hidden />
              )}
              {importing ? "Pricing batch…" : "Parse & price batch"}
            </button>
            {pairs.length > 0 && (
              <span className="font-mono text-xs text-muted-foreground">
                {pairs.length} pair{pairs.length === 1 ? "" : "s"} loaded
              </span>
            )}
          </div>

          {(importError || importRowErrors.length > 0) && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-2">
              <p className="font-semibold text-destructive">{importError ?? "Batch rejected"}</p>
              {importRowErrors.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-auto font-mono text-muted-foreground">
                  {importRowErrors.map((e, i) => (
                    <li key={i}>
                      {e.row > 0 ? `row ${e.row}: ` : ""}
                      {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {(stageError || (pairs.length > 0 && pairs.length < 3)) && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div className="text-sm space-y-2">
              <p className="font-semibold text-destructive">Parallel clearing needs desk pairs</p>
              <p className="text-muted-foreground">
                {stageError ?? `Only ${pairs.length} pair(s) loaded — an epoch requires at least 3.`}
              </p>
              {stageError && (
                <button
                  type="button"
                  onClick={() => void computeEpoch()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden />
                  Retry epoch
                </button>
              )}
            </div>
          </div>
        )}

        {canRun && epoch === "idle" && (
          <button
            type="button"
            onClick={() => void computeEpoch()}
            className="btn-press inline-flex h-11 w-fit items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Zap className="h-4 w-4" aria-hidden />
            Clear all {pairs.length} pairs in one epoch
          </button>
        )}

        {epoch === "running" && (
          <section
            aria-label="Epoch progress"
            aria-busy="true"
            className="anim-fade-up rounded-xl border border-steel/30 bg-card p-6"
          >
            <p className="flex items-center gap-2 text-sm font-medium">
              <LoaderCircle className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
              Netting {pairs.length} pairs concurrently inside the enclave
            </p>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <div className="anim-shimmer h-full w-full rounded-full bg-gradient-to-r from-transparent via-muted-foreground/60 to-transparent motion-reduce:animate-none" />
            </div>
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
                      {cleared ? "cleared" : "queued"}
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
