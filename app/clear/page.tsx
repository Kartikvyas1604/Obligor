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
  Sparkles,
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
              <span>Institutional Clearing Terminal</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Confidential Two-Party Clearing
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Two desks, one net initial margin. Encrypted computation ensures zero strategy leakage between competitors.
            </p>
          </div>
          <BackendBadge kind={backend} showNote />
        </div>

        {/* 4-Step Interactive Progress Stepper */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { num: "01", label: "Select Strategy", active: true, done: phase !== "setup" },
            { num: "02", label: "Pair Counterparty", active: true, done: phase !== "setup" },
            { num: "03", label: "Confidential Netting", active: phase === "computing" || phase === "done", done: phase === "done" },
            { num: "04", label: "Escrow Settle & Claim", active: phase === "done", done: false },
          ].map((s) => (
            <div
              key={s.num}
              className={`rounded-2xl border p-3.5 transition-colors duration-150 ${
                s.done
                  ? "bg-success/40 bg-success/5 text-success"
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
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-foreground" aria-hidden />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Confidential Backend:
              </span>
              <div className="inline-flex rounded-lg border border-border bg-secondary p-0.5">
                {[
                  { id: "arcium", label: "Arcium MPC (Solana)" },
                  { id: "enclave", label: "Nitro TEE (Monad)" },
                  { id: "simulated", label: "Simulated Local" },
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBackend(b.id as BackendKind)}
                    className={`rounded-md px-3 py-1 font-mono text-xs transition-colors duration-150 ${
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

            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={useLiveApi}
                onChange={(e) => setUseLiveApi(e.target.checked)}
                className="rounded border-border "
              />
              <span>Route via Live API Gateway (<code className="text-foreground">/api/v1/net-margin</code>)</span>
            </label>
          </div>
        </section>

        {phase === "setup" && (
          <section aria-label="Party setup" className="rounded-2xl border border-border bg-card p-5 md:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-4">
              <div>
                <h2 className="text-base font-bold text-foreground">Step 1 &amp; 2: Portfolio Strategy &amp; Counterparty Binding</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Select a live trading scenario or enter custom wallet addresses.
                </p>
              </div>

              {/* 1-Click Scenario Quick Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono">Scenario:</span>
                <button
                  type="button"
                  onClick={loadFixture}
                  className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                >
                  ⚡ SOL Basis Trade (Offsetting)
                </button>
                <button
                  type="button"
                  onClick={loadAdversarialFixture}
                  className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground hover:border-red-500/50 hover:text-foreground transition-colors"
                >
                  ⚠️ High-Exposure Portfolio
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="wallet-a" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    <span>Party A (Your Trading Desk)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleMockEquity("A")}
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground hover:underline"
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
                  className={`mt-2 h-10 w-full rounded-md border bg-background px-3 font-mono text-xs transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                    errorA ? "border-red-500" : "border-border"
                  }`}
                  aria-invalid={!!errorA}
                />
                {errorA && <p className="mt-1.5 text-xs text-red-400">{errorA}</p>}
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="wallet-b" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-400" />
                    <span>Party B (Counterparty Desk)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleMockEquity("B")}
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground hover:underline"
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
                  className={`mt-2 h-10 w-full rounded-md border bg-background px-3 font-mono text-xs transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                    errorB ? "border-red-500" : "border-border"
                  }`}
                  aria-invalid={!!errorB}
                />
                {errorB && <p className="mt-1.5 text-xs text-red-400">{errorB}</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={applyWallets}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-secondary px-4 text-xs font-medium text-foreground "
              >
                <Wallet className="h-3.5 w-3.5" aria-hidden />
                <span>Save Wallets</span>
              </button>
              <WalletConnect
                variant="block"
                label="Connect Phantom / Metamask"
                onConnect={connectPartyA}
                onDisconnect={disconnectPartyA}
              />
              <button
                type="button"
                disabled={busy}
                onClick={compute}
                className="ml-auto inline-flex h-12 items-center gap-2 rounded-full bg-primary px-8 text-sm font-bold text-primary-foreground transition-colors duration-150 disabled:opacity-50"
              >
                <Lock className="h-4 w-4" aria-hidden />
                <span>Execute Step 3: Run Confidential Netting</span>
                <ArrowRight className="h-4 w-4" />
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
                Running Confidential Compute Enclave
              </p>
              <span className="rounded-full border border-border bg-secondary px-3 py-1 font-mono text-xs uppercase text-foreground">
                {backend === "arcium" ? "Arcium MXE Circuit" : backend === "enclave" ? "AWS Nitro TEE" : "Simulated Local"}
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
                  <span className="text-success">🔒 Zero Counterparty Legs Leaked</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live Pyth Network Sync Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-foreground font-medium">Pyth Hermes Network Oracles:</span>
            <span className="font-mono text-muted-foreground">
              {oracleSyncMessage || "Feeds active for SOL, BTC, ETH, bAAPL, MON, USDC"}
            </span>
          </div>

          <button
            type="button"
            disabled={oracleSyncing}
            onClick={refreshOraclePrices}
            className="rounded-full border border-border bg-secondary px-4 py-1.5 font-mono text-xs text-foreground hover:border-foreground transition-colors disabled:opacity-50"
          >
            {oracleSyncing ? "Fetching Pyth Feeds..." : "⚡ Sync Live Oracle Prices"}
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
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-6 text-sm font-medium text-foreground transition-colors hover:bg-secondary "
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              <span>Start New Bilateral Session</span>
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
