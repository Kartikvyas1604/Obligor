"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, ArrowRight } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { WalletConnect } from "@/components/wallet-connect";
import { type BackendKind } from "@/lib/margin";

export default function DealLauncherPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<string>("");
  const [label, setLabel] = useState<string>("");
  const [backend, setBackend] = useState<BackendKind>("arcium");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateSession() {
    setError(null);
    if (!wallet.trim() || wallet.trim().length < 32) {
      setError("Enter a desk wallet address (32+ characters) or connect a wallet.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/v1/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletA: wallet.trim(),
          labelA: label.trim() || "Desk A (Initiator)",
          backend,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/deal/${data.session.sessionId}`);
        return;
      }
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? `Could not create the deal room (${res.status}).`);
    } catch {
      setError("Network error — could not reach the deal room service.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl py-8 sm:py-12 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-foreground">
            <Users className="h-4 w-4" aria-hidden />
            <span>Partner clearing</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">
            Start a private deal room
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
            Create a private session, invite your counterparty with a link, and net your offsetting
            positions together — neither side can read the other&rsquo;s book.
          </p>
        </div>

        {/* Creation Card */}
        <div className="rounded-[28px] border border-border bg-card p-6 sm:p-10 space-y-6 shadow-2xl">
          {error && (
            <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {error}
            </div>
          )}
          {/* Desk Label */}
          <div className="space-y-2">
            <label htmlFor="desk-label" className="text-xs font-semibold text-muted-foreground">
              Your desk name
            </label>
            <input
              id="desk-label"
              name="desk-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Desk Alpha"
              autoComplete="organization"
              className="w-full h-11 rounded-xl border border-border bg-secondary px-4 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Wallet Address */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="desk-wallet" className="text-xs font-semibold text-muted-foreground">
                Your wallet address
              </label>
              <WalletConnect onConnect={(addr) => setWallet(addr)} />
            </div>
            <input
              id="desk-wallet"
              name="desk-wallet"
              type="text"
              inputMode="text"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="Solana or EVM address (a demo address is preloaded)"
              autoComplete="off"
              spellCheck={false}
              className="w-full h-11 rounded-xl border border-border bg-secondary px-4 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-describedby="desk-wallet-help"
            />
            <p id="desk-wallet-help" className="text-[11px] text-muted-foreground">
              Read-only — we never move funds from this wallet.
            </p>
          </div>

          {/* Confidential Engine Selection */}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-muted-foreground">
              How should the math run?
            </legend>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                {
                  id: "arcium",
                  title: "MPC (Solana) — strongest",
                  desc: "Both books stay encrypted end-to-end. Not even a single operator can read them.",
                },
                {
                  id: "enclave",
                  title: "Hardware enclave (Monad)",
                  desc: "Books are sealed inside a hardware-locked box with a verifiable receipt (attestation).",
                },
              ].map((b) => (
                <button
                  type="button"
                  key={b.id}
                  onClick={() => setBackend(b.id as BackendKind)}
                  aria-pressed={backend === b.id}
                  className={`flex flex-col text-left p-4 rounded-xl border text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    backend === b.id
                      ? "border-foreground bg-secondary text-foreground shadow-sm"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="font-bold text-sm text-foreground mb-1">{b.title}</span>
                  <span className="text-[11px] leading-relaxed text-muted-foreground">{b.desc}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* Launch Button */}
          <button
            type="button"
            disabled={creating}
            onClick={handleCreateSession}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-primary py-4 font-bold text-primary-foreground text-sm transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {creating ? (
              <span>Creating your room…</span>
            ) : (
              <>
                <span>Create room &amp; get invite link</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
        </div>
      </div>
    </PageShell>
  );
}
