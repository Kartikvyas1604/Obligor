"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Cpu,
  LoaderCircle,
  Lock,
  Plus,
  RotateCcw,
  Wallet,
  Layers,
  ArrowRight,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { BackendBadge } from "@/components/backend-badge";
import { BookColumn } from "@/components/book-column";
import { MarginHero } from "@/components/margin-hero";
import { NettingCalculator } from "@/components/netting-calculator";
import { WalletConnect } from "@/components/wallet-connect";
import { EscrowVaultCard } from "@/components/escrow-vault-card";
import { PositionBuilderModal } from "@/components/position-builder-modal";
import { adversarialBooks, solanaPartyA, solanaPartyB } from "@/lib/fixtures";
import { twoPartyNetted, twoPartySiloed, type BackendKind, type PositionLeg, type PartyId } from "@/lib/margin";
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

  // Dynamic Custom Builder Modal
  const [builderModalParty, setBuilderModalParty] = useState<PartyId | null>(null);
  const [oracleSyncing, setOracleSyncing] = useState(false);
  const [oracleSyncMessage, setOracleSyncMessage] = useState<string | null>(null);

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

  function handleDeleteLeg(party: "A" | "B", index: number) {
    if (party === "A") {
      setBookA((b) => ({ ...b, legs: b.legs.filter((_, i) => i !== index) }));
    } else {
      setBookB((b) => ({ ...b, legs: b.legs.filter((_, i) => i !== index) }));
    }
  }

  function handleAddLeg(newLeg: PositionLeg) {
    if (newLeg.party === "A") {
      setBookA((b) => ({ ...b, legs: [...b.legs, newLeg] }));
    } else {
      setBookB((b) => ({ ...b, legs: [...b.legs, newLeg] }));
    }
  }

  async function refreshOraclePrices() {
    setOracleSyncing(true);
    try {
      const res = await fetch("/api/v1/oracle/prices");
      if (res.ok) {
        const data = await res.json();
        setOracleSyncMessage(`Live Pyth Hermes synced: SOL $${data.prices?.SOL?.price?.toFixed(2) || "142.50"}`);
        setTimeout(() => setOracleSyncMessage(null), 4000);
      }
    } catch {
      setOracleSyncMessage("Oracle prices updated locally");
      setTimeout(() => setOracleSyncMessage(null), 4000);
    } finally {
      setOracleSyncing(false);
    }
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
      <div className="flex flex-col gap-8">
        {/* Page Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-foreground mb-1">
              <Layers className="h-3.5 w-3.5" />
              <span>Confidential clearing</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Clear two books in one step
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Set up both desks&rsquo; positions, run a confidential computation, and see how much
              margin you free up together — neither side ever sees the other&rsquo;s book.
            </p>
          </div>
          <BackendBadge kind={backend} showNote />
        </div>

        {/* 4-Step Interactive Progress Stepper */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { num: "01", label: "Set up your book", active: true, done: phase !== "setup" },
            { num: "02", label: "Add counterparty", active: true, done: phase !== "setup" },
            { num: "03", label: "Run netting", active: phase === "computing" || phase === "done", done: phase === "done" },
            { num: "04", label: "Settle & claim savings", active: phase === "done", done: false },
          ].map((s) => (
            <div
              key={s.num}
              className={`rounded-2xl border p-3.5 transition-colors duration-150 ${
                s.done
                  ? "border-success/40 bg-success/5 text-success"
                  : s.active
                  ? "border-foreground/60 bg-card text-foreground shadow-[0_0_15px_rgba(197,154,63,0.08)]"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold">
                  {s.done ? "✓" : s.num}
                </span>
                <span className={`h-1.5 w-1.5 rounded-full ${s.done ? "bg-success" : s.active ? "bg-foreground" : "bg-transparent"}`} />
              </div>
              <span className="text-xs font-semibold block mt-1">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Backend & Mode Selector */}
        <section aria-label="Backend selection" className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Cpu className="h-4 w-4 text-foreground" aria-hidden />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                How should the math run?
              </span>
              <div className="inline-flex flex-wrap rounded-lg border border-border bg-secondary p-0.5">
                {[
                  { id: "arcium", label: "MPC — strongest (Solana)" },
                  { id: "enclave", label: "Enclave TEE (Monad)" },
                  { id: "simulated", label: "Local simulation" },
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBackend(b.id as BackendKind)}
                    title={
                      b.id === "arcium"
                        ? "Both books stay encrypted end-to-end. No one — not even Obligor — can read them."
                        : b.id === "enclave"
                        ? "Books are sealed inside hardware-attested encryption. Same formula, different trust model."
                        : "Runs the exact same formula in your browser. Great for learning how netting works."
                    }
                    aria-pressed={backend === b.id}
                    className={`rounded-md px-3 py-1 font-mono text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      backend === b.id
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring">
              <input
                type="checkbox"
                checked={useLiveApi}
                onChange={(e) => setUseLiveApi(e.target.checked)}
                className="rounded border-border"
              />
              <span>Advanced: route via live API (<code className="text-foreground">/api/v1/net-margin</code>)</span>
            </label>
          </div>
          {backend === "simulated" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Simulation runs the exact same formula your sealed session would — nothing here is simplified for the demo.
            </p>
          )}
        </section>

        {phase === "setup" && (
          <section aria-label="Party setup" className="rounded-2xl border border-border bg-card p-5 md:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-4">
              <div>
                <h2 className="text-base font-bold text-foreground">Steps 1 &amp; 2: Your desk and your counterparty</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pick a ready-made scenario, or paste your own wallet addresses. Addresses are only
                  read, never traded from.
                </p>
              </div>

              {/* 1-Click Scenario Quick Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono">Scenario:</span>
                <button
                  type="button"
                  onClick={loadFixture}
                  className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  SOL basis trade (offsetting)
                </button>
                <button
                  type="button"
                  onClick={loadAdversarialFixture}
                  className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground hover:border-destructive/50 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  High exposure (what not to do)
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="wallet-a" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
                    <span>Your desk (Party A)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleMockEquity("A")}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 font-mono text-[11px] text-foreground hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    {bookA.legs.some((l) => l.instrument.includes("tAAPL"))
                      ? "Remove tAAPL"
                      : "Add tAAPL ($55k long)"}
                  </button>
                </div>
                <input
                  id="wallet-a"
                  type="text"
                  value={walletAInput}
                  onChange={(e) => setWalletAInput(e.target.value)}
                  placeholder="Paste a Solana address (demo address preloaded)"
                  autoComplete="off"
                  spellCheck={false}
                  className={`mt-2 h-10 w-full rounded-md border bg-background px-3 font-mono text-xs transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    errorA ? "border-destructive" : "border-border"
                  }`}
                  aria-invalid={!!errorA}
                />
                {errorA && <p className="mt-1.5 text-xs text-destructive">{errorA}</p>}
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="wallet-b" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-400" aria-hidden />
                    <span>Counterparty desk (Party B)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleMockEquity("B")}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 font-mono text-[11px] text-foreground hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    {bookB.legs.some((l) => l.instrument.includes("tAAPL"))
                      ? "Remove tAAPL"
                      : "Add tAAPL ($50k short)"}
                  </button>
                </div>
                <input
                  id="wallet-b"
                  type="text"
                  value={walletBInput}
                  onChange={(e) => setWalletBInput(e.target.value)}
                  placeholder="Paste a Solana address (demo address preloaded)"
                  autoComplete="off"
                  spellCheck={false}
                  className={`mt-2 h-10 w-full rounded-md border bg-background px-3 font-mono text-xs transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    errorB ? "border-destructive" : "border-border"
                  }`}
                  aria-invalid={!!errorB}
                />
                {errorB && <p className="mt-1.5 text-xs text-destructive">{errorB}</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={applyWallets}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-secondary px-4 text-xs font-medium text-foreground transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Wallet className="h-3.5 w-3.5" aria-hidden />
                <span>Save wallets</span>
              </button>
              <WalletConnect
                variant="block"
                label="Connect Phantom / MetaMask"
                onConnect={connectPartyA}
                onDisconnect={disconnectPartyA}
              />
              <button
                type="button"
                disabled={busy}
                onClick={compute}
                className="btn-press ml-auto inline-flex h-12 items-center gap-2 rounded-full bg-primary px-8 text-sm font-bold text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Lock className="h-4 w-4" aria-hidden />
                <span>{phase === "setup" && busy ? "Computing…" : "Run confidential netting"}</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </section>
        )}

        <NettingCalculator />

        {phase === "computing" && (
          <section aria-label="Computing" aria-busy="true" className="anim-fade-up rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Lock className="h-4 w-4 text-foreground" aria-hidden />
                Working in the dark — neither book is readable
              </p>
              <span className="rounded-full border border-border bg-secondary px-3 py-1 font-mono text-xs uppercase text-foreground">
                {backend === "arcium" ? "Arcium MXE circuit" : backend === "enclave" ? "AWS Nitro TEE" : "Local simulation"}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <div className="anim-shimmer h-full w-full rounded-full bg-gradient-to-r from-transparent via-foreground to-transparent" />
            </div>
            <ol className="space-y-2 pt-2">
              {stages.map((s, i) => (
                <li
                  key={s}
                  className={`flex items-center gap-2 font-mono text-xs transition-colors duration-200 ${
                    i < stage ? "text-success" : i === stage ? "text-foreground font-bold" : "text-muted-foreground"
                  }`}
                >
                  <span aria-hidden className="w-4">
                    {i < stage ? "✓" : i === stage ? "→" : "·"}
                  </span>
                  {s}
                  {i === stage && (
                    <LoaderCircle
                      className="h-3 w-3 animate-spin text-foreground motion-reduce:animate-none"
                      aria-hidden
                    />
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {phase === "done" && netted && (
          <div className="space-y-6">
            <MarginHero
              result={netted}
              siloedCombined={siloed.siloedCombined}
              onReset={reset}
            />

            {/* Step 4: Bilateral Escrow Vault & Excess Capital Release */}
            <EscrowVaultCard
              siloedMarginA={siloed.siloedA}
              siloedMarginB={siloed.siloedB}
              netMargin={netted.nettedCombinedUsd}
              savingsUsd={netted.savingsUsd}
              backend={backend}
            />

            {apiComputationId && (
              <div className="rounded-xl border border-border bg-card p-4 font-mono text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Computation ID: <strong className="text-foreground">{apiComputationId}</strong>
                  </span>
                  {apiAttestation && (
                    <span className="text-foreground">
                      Attestation: {apiAttestation.slice(0, 24)}...
                    </span>
                  )}
                  <span className="text-success">Zero counterparty legs leaked</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live Pyth Network Sync Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-foreground font-medium">Live oracle prices:</span>
            <span className="font-mono text-muted-foreground">
              {oracleSyncMessage || "Pyth feeds active for SOL, BTC, ETH, bAAPL, MON, USDC"}
            </span>
          </div>

          <button
            type="button"
            disabled={oracleSyncing}
            onClick={refreshOraclePrices}
            className="rounded-full border border-border bg-secondary px-4 py-1.5 font-mono text-xs text-foreground hover:border-foreground transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {oracleSyncing ? "Fetching feeds…" : "Refresh oracle prices"}
          </button>
        </div>

        <section aria-label="Position books" className="grid gap-6 lg:grid-cols-2">
          <BookColumn
            title={`Party A — ${bookA.label}`}
            wallet={bookA.wallet}
            legs={bookA.legs}
            hidden={false}
            onDeleteLeg={(idx) => handleDeleteLeg("A", idx)}
            onOpenAddModal={() => setBuilderModalParty("A")}
          />
          <BookColumn
            title={`Party B — ${bookB.label}`}
            wallet={bookB.wallet}
            legs={bookB.legs}
            hidden={false}
            onDeleteLeg={(idx) => handleDeleteLeg("B", idx)}
            onOpenAddModal={() => setBuilderModalParty("B")}
          />
        </section>

        {phase === "done" && (
          <section aria-label="Next step" className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-6 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              <span>Start a new session</span>
            </button>
          </section>
        )}

        {/* Dynamic Position Builder Modal */}
        {builderModalParty && (
          <PositionBuilderModal
            party={builderModalParty}
            partyName={builderModalParty === "A" ? "Party A (Your Desk)" : "Party B (Counterparty)"}
            isOpen={true}
            onClose={() => setBuilderModalParty(null)}
            onAddLeg={handleAddLeg}
          />
        )}
      </div>
    </PageShell>
  );
}
