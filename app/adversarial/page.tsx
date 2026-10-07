"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ShieldAlert, LoaderCircle, RotateCcw } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { BookColumn } from "@/components/book-column";
import { type PositionBook, type NetMarginResult } from "@/lib/margin";

interface AdversarialPayload {
  partyA: PositionBook;
  partyB: PositionBook;
  siloed: { siloedA: number; siloedB: number; siloedCombined: number };
  netted: NetMarginResult;
}

/**
 * Adversarial counterfactual screen. The plaintext books come ONLY from the
 * rate-limited, acknowledgment-gated demo endpoint — never baked into the
 * client bundle. Disabled deployments show an honest error state instead.
 */
export default function AdversarialPage() {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [data, setData] = useState<AdversarialPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(20);

  const siloedCombined = data?.siloed?.siloedCombined ?? 0;
  const netted = data?.netted ?? null;
  const savingsPct =
    netted && siloedCombined > 0 ? Math.round((netted.savingsUsd / siloedCombined) * 100) : 0;

  async function loadBooks() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/demo/adversarial-plaintext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iUnderstandThisLeaksBothBooks: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? `Request failed (${res.status})`);
        return;
      }
      const payload = (await res.json()) as {
        partyA: PositionBook;
        partyB: PositionBook;
        siloed: AdversarialPayload["siloed"];
        netted: NetMarginResult;
      };
      setData(payload);
    } catch {
      setError("Network error — could not reach the demo endpoint.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!confirmed) return;
    void loadBooks();
  }, [confirmed]);

  useEffect(() => {
    if (!confirmed || !data || secondsLeft === 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [confirmed, data, secondsLeft]);

  useEffect(() => {
    if (!confirmed || !data || secondsLeft !== 0) return;
    const t = setTimeout(() => router.push("/clear"), 400);
    return () => clearTimeout(t);
  }, [confirmed, data, secondsLeft, router]);

  if (!confirmed) {
    return (
      <PageShell>
        <div className="mx-auto max-w-xl py-10 text-center md:py-20">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" aria-hidden />
          <h1 className="mt-6 text-3xl font-medium tracking-tight md:text-4xl">
            Plaintext operator view
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            This screen deliberately shows <strong>both</strong> books in plaintext — what a
            centralized clearer would see. It exists only to demonstrate why that fails: whoever
            holds both books can front-run either desk. It is never the confidential path.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setConfirmed(true)}
              className="inline-flex h-12 items-center gap-2 rounded-md bg-destructive px-6 font-medium text-destructive-foreground transition-opacity duration-100 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden />
              I understand this leaks both books
            </button>
            <Link
              href="/clear"
              className="inline-flex h-12 items-center justify-center rounded-md border border-border px-6 font-medium transition-colors duration-100 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Back to confidential session
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div className="mx-auto max-w-xl py-20 text-center space-y-4">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" aria-hidden />
          <h1 className="text-2xl font-bold">Demo unavailable in this environment</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={loadBooks}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Retry
            </button>
            <Link
              href="/clear"
              className="inline-flex h-11 items-center rounded-full border border-border px-6 text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Back to confidential session
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  if (loading || !data) {
    return (
      <PageShell>
        <div className="py-24 text-center space-y-3" aria-live="polite" aria-busy="true">
          <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
          <p className="text-sm font-mono text-muted-foreground">Rendering the operator's plaintext view…</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex flex-col gap-8">
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 font-mono text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            DANGEROUS / plaintext operator view
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            A centralized clearer who saw this could reconstruct both strategies and trade against
            them. That is why single-operator clearing fails — and why self-netting one wallet does
            not need MPC.
          </p>
          {secondsLeft > 0 && (
            <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
              Auto-return to confidential session in {secondsLeft}s
            </p>
          )}
        </div>

        <section aria-label="Both books in plaintext" className="grid gap-6 lg:grid-cols-2">
          <BookColumn
            title={`Party A — ${data.partyA.label} (PLAINTEXT)`}
            wallet={data.partyA.wallet}
            legs={data.partyA.legs}
            hidden={false}
          />
          <BookColumn
            title={`Party B — ${data.partyB.label} (PLAINTEXT)`}
            wallet={data.partyB.wallet}
            legs={data.partyB.legs}
            hidden={false}
          />
        </section>

        <section aria-label="What the operator could compute" className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-medium">The operator&rsquo;s temptation</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Combined siloed margin {siloedCombined.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}{" "}
            collapses to{" "}
            {netted!.nettedCombinedUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}{" "}
            netted ({savingsPct}% freed —{" "}
            <span className="inline">
              {netted!.savingsUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}){" "}
            </span>
            — <span className="text-foreground">but the operator needed both books in plaintext to compute it.</span>{" "}
            The confidential path produces the same numbers with sealed inputs.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/clear"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity duration-100 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Return to confidential session
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
