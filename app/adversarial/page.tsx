"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ShieldAlert } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { BookColumn } from "@/components/book-column";
import { adversarialBooks } from "@/lib/fixtures";
import { twoPartyNetted, twoPartySiloed, usd } from "@/lib/margin";

export default function AdversarialPage() {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(20);

  const siloed = useMemo(
    () => twoPartySiloed(adversarialBooks.a, adversarialBooks.b),
    [],
  );
  const netted = useMemo(
    () => twoPartyNetted(adversarialBooks.a, adversarialBooks.b),
    [],
  );

  useEffect(() => {
    if (!confirmed || secondsLeft === 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [confirmed, secondsLeft]);

  const expired = secondsLeft === 0;

  useEffect(() => {
    if (!confirmed || !expired) return;
    const t = setTimeout(() => router.push("/clear"), 400);
    return () => clearTimeout(t);
  }, [confirmed, expired, router]);

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
          {confirmed && secondsLeft > 0 && !expired && (
            <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
              Auto-return to confidential session in {secondsLeft}s
            </p>
          )}
        </div>

        <section aria-label="Both books in plaintext" className="grid gap-6 lg:grid-cols-2">
          <BookColumn
            title={`Party A — ${adversarialBooks.a.label} (PLAINTEXT)`}
            wallet={adversarialBooks.a.wallet}
            legs={adversarialBooks.a.legs}
            hidden={false}
          />
          <BookColumn
            title={`Party B — ${adversarialBooks.b.label} (PLAINTEXT)`}
            wallet={adversarialBooks.b.wallet}
            legs={adversarialBooks.b.legs}
            hidden={false}
          />
        </section>

        <section aria-label="What the operator could compute" className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-medium">The operator&rsquo;s temptation</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Combined siloed margin {usd(siloed.siloedCombined)} collapses to{" "}
            {usd(netted.nettedCombinedUsd)} netted ({usd(netted.savingsUsd)} freed) —{" "}
            <span className="text-foreground">
              but the operator needed both books in plaintext to compute it.
            </span>{" "}
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
