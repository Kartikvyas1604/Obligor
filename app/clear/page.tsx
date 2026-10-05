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
      <div className="flex flex-col gap-8">
        {/* Page Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 font-['JetBrains_Mono',monospace] text-xs uppercase tracking-wider text-[#C59A3F] mb-1">
              <Layers className="h-3.5 w-3.5" />
              <span>Institutional Clearing Terminal</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Confidential Two-Party Clearing
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[#94A3B8]">
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
              className={`rounded-2xl border p-3.5 transition-all ${
                s.done
                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
                  : s.active
                  ? "border-[#C59A3F]/50 bg-[#121212] text-white shadow-[0_0_15px_rgba(197,154,63,0.08)]"
                  : "border-[#1F1F1F] bg-[#0A0A0A] text-[#64748B]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-['JetBrains_Mono',monospace] text-xs font-bold">
                  {s.done ? "✓" : s.num}
                </span>
                <span className={`h-1.5 w-1.5 rounded-full ${s.done ? "bg-emerald-400" : s.active ? "bg-[#E8C874]" : "bg-transparent"}`} />
              </div>
              <span className="text-xs font-semibold block mt-1">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Backend & Mode Selector */}
        <section aria-label="Backend selection" className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-[#C59A3F]" aria-hidden />
              <span className="text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
                Confidential Backend:
              </span>
              <div className="inline-flex rounded-lg border border-[#1F1F1F] bg-[#141414] p-0.5">
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
                        ? "bg-[#C59A3F] text-black font-semibold shadow-sm"
                        : "text-[#94A3B8] hover:text-white"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#94A3B8]">
              <input
                type="checkbox"
                checked={useLiveApi}
                onChange={(e) => setUseLiveApi(e.target.checked)}
                className="rounded border-[#1F1F1F] accent-[#C59A3F]"
              />
              <span>Route via Live API Gateway (<code className="text-[#E8C874]">/api/v1/net-margin</code>)</span>
            </label>
          </div>
        </section>

        {phase === "setup" && (
          <section aria-label="Party setup" className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5 md:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#1F1F1F] pb-4">
              <div>
                <h2 className="text-base font-bold text-white">Step 1 &amp; 2: Portfolio Strategy &amp; Counterparty Binding</h2>
                <p className="mt-0.5 text-xs text-[#94A3B8]">
                  Select a live trading scenario or enter custom wallet addresses.
                </p>
              </div>

              {/* 1-Click Scenario Quick Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[#64748B] font-['JetBrains_Mono',monospace]">Scenario:</span>
                <button
                  type="button"
                  onClick={loadFixture}
                  className="rounded-full border border-[#1F1F1F] bg-[#141414] px-3 py-1 text-xs text-[#94A3B8] hover:border-[#C59A3F] hover:text-white transition-colors"
                >
                  ⚡ SOL Basis Trade (Offsetting)
                </button>
                <button
                  type="button"
                  onClick={loadAdversarialFixture}
                  className="rounded-full border border-[#1F1F1F] bg-[#141414] px-3 py-1 text-xs text-[#94A3B8] hover:border-red-500/50 hover:text-white transition-colors"
                >
                  ⚠️ High-Exposure Portfolio
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[#1F1F1F] bg-[#111111] p-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="wallet-a" className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span>Party A (Your Trading Desk)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleMockEquity("A")}
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-[#E8C874] hover:underline"
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
                  className={`mt-2 h-10 w-full rounded-md border bg-black px-3 font-mono text-xs transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C59A3F] ${
                    errorA ? "border-red-500" : "border-[#1F1F1F]"
                  }`}
                  aria-invalid={!!errorA}
                />
                {errorA && <p className="mt-1.5 text-xs text-red-400">{errorA}</p>}
              </div>

              <div className="rounded-xl border border-[#1F1F1F] bg-[#111111] p-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="wallet-b" className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-400" />
                    <span>Party B (Counterparty Desk)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleMockEquity("B")}
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-[#E8C874] hover:underline"
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
                  className={`mt-2 h-10 w-full rounded-md border bg-black px-3 font-mono text-xs transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C59A3F] ${
                    errorB ? "border-red-500" : "border-[#1F1F1F]"
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
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[#1F1F1F] bg-[#141414] px-4 text-xs font-medium text-white hover:border-[#333]"
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
                className="ml-auto inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-[#E8C874] via-[#C59A3F] to-[#A67C27] px-8 text-sm font-bold text-black transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_4px_25px_rgba(197,154,63,0.3)] disabled:opacity-50"
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
          <section aria-label="Computing" aria-busy="true" className="anim-fade-up rounded-2xl border border-[#C59A3F]/40 bg-[#0A0A0A] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-bold text-white">
                <Lock className="h-4 w-4 text-[#E8C874]" aria-hidden />
                Running Confidential Compute Enclave
              </p>
              <span className="rounded-full border border-[#C59A3F]/40 bg-[#C59A3F]/10 px-3 py-1 font-mono text-xs uppercase text-[#E8C874]">
                {backend === "arcium" ? "Arcium MXE Circuit" : backend === "enclave" ? "AWS Nitro TEE" : "Simulated Local"}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#1F1F1F]" aria-hidden>
              <div className="anim-shimmer h-full w-full rounded-full bg-gradient-to-r from-transparent via-[#E8C874] to-transparent" />
            </div>
            <ol className="space-y-2 pt-2">
              {stages.map((s, i) => (
                <li
                  key={s}
                  className={`flex items-center gap-2 font-mono text-xs transition-colors duration-200 ${
                    i < stage ? "text-emerald-400" : i === stage ? "text-white font-bold" : "text-[#64748B]"
                  }`}
                >
                  <span aria-hidden className="w-4">
                    {i < stage ? "✓" : i === stage ? "→" : "·"}
                  </span>
                  {s}
                  {i === stage && (
                    <LoaderCircle
                      className="h-3 w-3 animate-spin text-[#E8C874] motion-reduce:animate-none"
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
              <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-4 font-mono text-xs text-[#94A3B8]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Computation ID: <strong className="text-white">{apiComputationId}</strong>
                  </span>
                  {apiAttestation && (
                    <span className="text-[#C59A3F]">
                      Attestation: {apiAttestation.slice(0, 24)}...
                    </span>
                  )}
                  <span className="text-emerald-400">🔒 Zero Counterparty Legs Leaked</span>
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
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[#1F1F1F] bg-[#0A0A0A] px-6 text-sm font-medium text-white transition-colors hover:bg-[#141414] hover:border-[#333]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              <span>Start New Bilateral Session</span>
            </button>
          </section>
        )}
      </div>
    </PageShell>
  );
}
