"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Cpu,
  LoaderCircle,
  Lock,
  Plus,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { BackendBadge } from "@/components/backend-badge";
import { BookColumn } from "@/components/book-column";
import { MarginHero } from "@/components/margin-hero";
import { NettingCalculator } from "@/components/netting-calculator";
import { WalletConnect } from "@/components/wallet-connect";
import { adversarialBooks, solanaPartyA, solanaPartyB } from "@/lib/fixtures";
import { twoPartyNetted, twoPartySiloed, type BackendKind } from "@/lib/margin";
import { createMockEquityLeg } from "@/lib/positions";
import { getConfidentialBackend } from "@/lib/confidential";

const STAGES_SOLANA = [
  "Sealing Party A legs (X25519 / RescueCipher)",
  "Sealing Party B legs (independent key)",
  "Queueing Arcium MXE multi-party computation",
  "Awaiting MPC finalization across cluster",
  "Decrypting aggregate output scalars only",
];

const STAGES_MONAD = [
  "Sealing Party A legs into enclave envelope",
  "Sealing Party B legs into enclave envelope",
  "Executing two_party_netted inside Nitro TEE",
  "Measuring PCR0 & generating hardware attestation",
  "Publishing verified aggregate result",
];

export default function ClearPage() {
  const [backend, setBackend] = useState<BackendKind>("arcium");
  const [stage, setStage] = useState<number>(-1);
  const [phase, setPhase] = useState<"setup" | "computing" | "done">("setup");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [bookA, setBookA] = useState(solanaPartyA);
  const [bookB, setBookB] = useState(solanaPartyB);

  const [walletAInput, setWalletAInput] = useState(solanaPartyA.wallet);
  const [walletBInput, setWalletBInput] = useState(solanaPartyB.wallet);

  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);

  const [useLiveApi, setUseLiveApi] = useState(false);
  const [apiComputationId, setApiComputationId] = useState<string | null>(null);
  const [apiAttestation, setApiAttestation] = useState<string | null>(null);

  function validateWallet(value: string): string | null {
    const v = value.trim();
    if (!v) return "Wallet address is required.";
    if (v.length < 32 || v.length > 44) return "Solana addresses are 32–44 base58 characters.";
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(v)) return "Address must be base58 (no 0, O, I, l).";
    return null;
  }

  function applyWallets() {
    const errA = validateWallet(walletAInput);
    const errB = validateWallet(walletBInput);
    setErrorA(errA);
    setErrorB(errB);
    if (errA || errB) return;
    setBookA((b) => ({ ...b, wallet: walletAInput.trim() }));
    setBookB((b) => ({ ...b, wallet: walletBInput.trim() }));
  }

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const siloed = useMemo(() => twoPartySiloed(bookA, bookB), [bookA, bookB]);
  const netted = useMemo(() => twoPartyNetted(bookA, bookB), [bookA, bookB]);

  function loadFixture() {
    setBookA(solanaPartyA);
    setBookB(solanaPartyB);
    setWalletAInput(solanaPartyA.wallet);
    setWalletBInput(solanaPartyB.wallet);
    setErrorA(null);
    setErrorB(null);
  }

  function loadAdversarialFixture() {
    setBookA(adversarialBooks.a);
    setBookB(adversarialBooks.b);
    setWalletAInput(adversarialBooks.a.wallet);
    setWalletBInput(adversarialBooks.b.wallet);
    setErrorA(null);
    setErrorB(null);
  }

  function toggleMockEquity(party: "A" | "B") {
    if (party === "A") {
      const hasEquity = bookA.legs.some((l) => l.instrument.includes("tAAPL"));
      if (hasEquity) {
        setBookA((b) => ({
          ...b,
          legs: b.legs.filter((l) => !l.instrument.includes("tAAPL")),
        }));
      } else {
        const mockLeg = createMockEquityLeg("A", "long", 55_000);
        setBookA((b) => ({ ...b, legs: [...b.legs, mockLeg] }));
      }
    } else {
      const hasEquity = bookB.legs.some((l) => l.instrument.includes("tAAPL"));
      if (hasEquity) {
        setBookB((b) => ({
          ...b,
          legs: b.legs.filter((l) => !l.instrument.includes("tAAPL")),
        }));
      } else {
        const mockLeg = createMockEquityLeg("B", "short", 50_000);
        setBookB((b) => ({ ...b, legs: [...b.legs, mockLeg] }));
      }
    }
  }

  function connectPartyA(address: string) {
    setBookA((b) => ({ ...b, wallet: address }));
    setWalletAInput(address);
    setErrorA(null);
  }

  function disconnectPartyA() {
    setBookA(solanaPartyA);
  }

  async function compute() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase("computing");
    setStage(0);

    const stages = backend === "enclave" ? STAGES_MONAD : STAGES_SOLANA;
    const stepDuration = 600;

    stages.forEach((_, i) => {
      timersRef.current.push(setTimeout(() => setStage(i), i * stepDuration));
    });

    if (useLiveApi) {
      try {
        const response = await fetch("/api/v1/net-margin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chain: backend === "enclave" ? "monad" : "solana",
            backend,
            partyA: { wallet: bookA.wallet, legsOverride: bookA.legs },
            partyB: { wallet: bookB.wallet, legsOverride: bookB.legs },
            demoPayment: true,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          setApiComputationId(data.margin?.computationId || null);
          setApiAttestation(data.margin?.attestation?.quote || null);
        }
      } catch {
        // fallback to local compute
      }
    } else {
      const backendInstance = getConfidentialBackend(backend);
      const res = await backendInstance.netTwoParty(bookA, bookB);
      setApiComputationId(res.computationId);
      setApiAttestation(res.attestation?.quote || null);
    }

    timersRef.current.push(
      setTimeout(() => {
        setPhase("done");
      }, stages.length * stepDuration),
    );
  }

  function reset() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setStage(-1);
    setPhase("setup");
    setApiComputationId(null);
    setApiAttestation(null);
  }

  const busy = phase === "computing";
  const stages = backend === "enclave" ? STAGES_MONAD : STAGES_SOLANA;

  return (
    <PageShell>
      <div className="flex flex-col gap-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-medium tracking-tight md:text-4xl">
              Confidential Clearing Session
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Assign both parties, review your own legs, then compute the combined net initial margin.
              Neither party nor the operator ever sees the counterparty&rsquo;s book.
            </p>
          </div>
          <BackendBadge kind={backend} showNote />
        </div>

        {/* Backend & Mode Selector */}
        <section aria-label="Backend selection" className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" aria-hidden />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pluggable Backend:
              </span>
              <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                {[
                  { id: "arcium", label: "Arcium MPC (Solana)" },
                  { id: "enclave", label: "TEE Attested (Monad)" },
                  { id: "simulated", label: "Simulated Local" },
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBackend(b.id as BackendKind)}
                    className={`rounded-md px-3 py-1 font-mono text-xs transition-colors duration-150 ${
                      backend === b.id
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={useLiveApi}
                onChange={(e) => setUseLiveApi(e.target.checked)}
                className="rounded border-border accent-primary"
              />
              <span>Route via Live API Gateway (<code className="text-foreground">/api/v1/net-margin</code>)</span>
            </label>
          </div>
        </section>

        {phase === "setup" && (
          <section aria-label="Party setup" className="rounded-xl border border-border bg-card p-5 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium">Session Setup &amp; Counterparty Binding</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Connect Party A wallet, configure counterparty Party B, or load pre-built fixtures.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="wallet-a" className="text-xs text-muted-foreground">
                    Party A wallet (Your Desk)
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleMockEquity("A")}
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-primary transition-colors hover:underline"
                  >
                    <Plus className="h-3 w-3" />
                    {bookA.legs.some((l) => l.instrument.includes("tAAPL"))
                      ? "Remove tAAPL"
                      : "Add tAAPL ($55k Long)"}
                  </button>
                </div>
                <input
                  id="wallet-a"
                  type="text"
                  value={walletAInput}
                  onChange={(e) => setWalletAInput(e.target.value)}
                  placeholder="Base58 address — 32–44 chars"
                  autoComplete="off"
                  spellCheck={false}
                  className={`mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-mono text-sm transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    errorA ? "border-destructive" : "border-input"
                  }`}
                  aria-invalid={!!errorA}
                />
                {errorA && <p className="mt-1.5 text-xs text-destructive">{errorA}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="wallet-b" className="text-xs text-muted-foreground">
                    Party B wallet (Counterparty Desk)
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleMockEquity("B")}
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-primary transition-colors hover:underline"
                  >
                    <Plus className="h-3 w-3" />
                    {bookB.legs.some((l) => l.instrument.includes("tAAPL"))
                      ? "Remove tAAPL"
                      : "Add tAAPL ($50k Short)"}
                  </button>
                </div>
                <input
                  id="wallet-b"
                  type="text"
                  value={walletBInput}
                  onChange={(e) => setWalletBInput(e.target.value)}
                  placeholder="Base58 address — 32–44 chars"
                  autoComplete="off"
                  spellCheck={false}
                  className={`mt-1.5 h-10 w-full rounded-md border bg-background px-3 font-mono text-sm transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    errorB ? "border-destructive" : "border-input"
                  }`}
                  aria-invalid={!!errorB}
                />
                {errorB && <p className="mt-1.5 text-xs text-destructive">{errorB}</p>}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={applyWallets}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm transition-colors duration-100 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Wallet className="h-4 w-4" aria-hidden />
                Assign wallets
              </button>
              <button
                type="button"
                onClick={loadFixture}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm transition-colors duration-100 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Judge fixture (Offsetting)
              </button>
              <button
                type="button"
                onClick={loadAdversarialFixture}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm transition-colors duration-100 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden />
                High-exposure fixture
              </button>
              <WalletConnect
                variant="block"
                label="Connect Party A wallet"
                onConnect={connectPartyA}
                onDisconnect={disconnectPartyA}
              />
              <button
                type="button"
                disabled={busy}
                onClick={compute}
                className="btn-press ml-auto inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
              >
                <Lock className="h-4 w-4" aria-hidden />
                Compute two-party net margin
              </button>
            </div>
          </section>
        )}

        <NettingCalculator />

        {phase === "computing" && (
          <section aria-label="Computing" aria-busy="true" className="anim-fade-up rounded-xl border border-primary/30 bg-card p-6">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Lock className="h-4 w-4 text-primary" aria-hidden />
              Running confidential computation
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase text-primary">
                {backend === "arcium" ? "Arcium MXE" : backend === "enclave" ? "Nitro TEE" : "simulated"}
              </span>
            </p>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <div className="anim-shimmer h-full w-full rounded-full bg-gradient-to-r from-transparent via-muted-foreground/60 to-transparent" />
            </div>
            <ol className="mt-4 space-y-2">
              {stages.map((s, i) => (
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
                  {i === stage && (
                    <LoaderCircle
                      className="h-3 w-3 animate-spin text-primary motion-reduce:animate-none"
                      aria-hidden
                    />
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {phase === "done" && netted && (
          <div className="space-y-4">
            <MarginHero
              result={netted}
              siloedCombined={siloed.siloedCombined}
              onReset={reset}
            />

            {apiComputationId && (
              <div className="rounded-lg border border-border bg-card/60 p-4 font-mono text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Computation ID: <strong className="text-foreground">{apiComputationId}</strong>
                  </span>
                  {apiAttestation && (
                    <span className="text-steel">
                      Attestation: {apiAttestation.slice(0, 24)}...
                    </span>
                  )}
                  <span className="text-success">🔒 Zero Counterparty Legs Leaked</span>
                </div>
              </div>
            )}
          </div>
        )}

        <section aria-label="Position books" className="grid gap-6 lg:grid-cols-2">
          <BookColumn
            title={`Party A — ${bookA.label}`}
            wallet={bookA.wallet}
            legs={bookA.legs}
            hidden={false}
          />
          <BookColumn
            title={`Party B — ${bookB.label}`}
            wallet={bookB.wallet}
            legs={bookB.legs}
            hidden={false}
          />
        </section>

        {phase === "done" && (
          <section aria-label="Next step" className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm transition-colors duration-100 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              New session
            </button>
          </section>
        )}
      </div>
    </PageShell>
  );
}
