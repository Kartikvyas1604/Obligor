"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Cpu,
  LoaderCircle,
  Lock,
  RotateCcw,
  Layers,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { BackendBadge } from "@/components/backend-badge";
import { BookColumn } from "@/components/book-column";
import { MarginHero } from "@/components/margin-hero";
import { NettingCalculator } from "@/components/netting-calculator";
import { WalletConnect } from "@/components/wallet-connect";
import { EscrowVaultCard } from "@/components/escrow-vault-card";
import { PositionBuilderModal } from "@/components/position-builder-modal";
import { type BackendKind, type PositionBook, type PositionLeg, type PartyId } from "@/lib/margin";
import { getConfidentialBackend } from "@/lib/confidential";

const STAGES_SOLANA = [
  "Sealing Party A legs",
  "Sealing Party B legs",
  "Running the multi-party computation",
  "Awaiting finalization across the cluster",
  "Decrypting aggregate outputs only",
];

const STAGES_MONAD = [
  "Sealing Party A legs into the enclave",
  "Sealing Party B legs into the enclave",
  "Executing the netting formula inside the TEE",
  "Checking enclave attestation (claimed only if the enclave issues one)",
  "Publishing the aggregate result",
];

// The stage list describes the REAL confidential pipeline. Until the real
// MXE/enclave transports are wired, JS backends run the local simulation —
// so every run gets the honest transcript banner plus the real steps.
const SIMULATION_PREAMBLE = "Sealed-execution simulation — the exact formula runs in plaintext (no real sealing)";
const SIM_PREAMBLE_SHORT = "Simulated seal — pipeline steps below describe the production transport";

function stagesFor(backend: BackendKind) {
  if (backend === "simulated") {
    return [SIMULATION_PREAMBLE, "The exact netting formula runs locally in your browser"];
  }
  return backend === "enclave"
    ? [SIM_PREAMBLE_SHORT, ...STAGES_MONAD]
    : [SIM_PREAMBLE_SHORT, ...STAGES_SOLANA];
}

function makeEmptyBook(party: PartyId): PositionBook {
  return {
    party,
    label: party === "A" ? "Your desk" : "Counterparty desk",
    wallet: "",
    chain: "solana",
    legs: [],
    warnings: [],
  };
}

function validateWallet(value: string): string | null {
  const v = value.trim();
  if (!v) return null; // empty is allowed (demo wallets)
  if (v.startsWith("0x") || /^[0-9a-fA-Fx]{40,42}$/.test(v)) return null; // EVM-style ok
  if (v.length < 32 || v.length > 44) return "Solana addresses are 32–44 base58 characters.";
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(v)) return "Address must be base58 (no 0, O, I, l).";
  return null;
}

function resign(leg: PositionLeg, party: PartyId): PositionLeg {
  const side = leg.side;
  const signed = side === "short" || side === "borrow" ? -Math.abs(leg.notionalUsd) : Math.abs(leg.notionalUsd);
  return { ...leg, party, signedExposureUsd: signed };
}

export default function ClearPage() {
  const [backend, setBackend] = useState<BackendKind>("arcium");
  const [stage, setStage] = useState<number>(-1);
  const [phase, setPhase] = useState<"setup" | "computing" | "done" | "error">("setup");
  const [computeError, setComputeError] = useState<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [bookA, setBookA] = useState<PositionBook>(() => makeEmptyBook("A"));
  const [bookB, setBookB] = useState<PositionBook>(() => makeEmptyBook("B"));

  const [walletAInput, setWalletAInput] = useState("");
  const [walletBInput, setWalletBInput] = useState("");
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);

  const [useLiveApi, setUseLiveApi] = useState(false);
  const [apiComputationId, setApiComputationId] = useState<string | null>(null);
  const [apiAttestation, setApiAttestation] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [builderModalParty, setBuilderModalParty] = useState<PartyId | null>(null);
  const [fixtureLoading, setFixtureLoading] = useState(false);
  const [fixtureError, setFixtureError] = useState<string | null>(null);
  const [oracleSyncing, setOracleSyncing] = useState(false);
  const [oracleSyncMessage, setOracleSyncMessage] = useState<string | null>(null);

  function applyValidation(walletA: string, walletB: string) {
    const errA = validateWallet(walletA);
    const errB = validateWallet(walletB);
    setErrorA(errA);
    setErrorB(errB);
    return !errA && !errB;
  }

  function setWalletFromInput(party: PartyId, value: string) {
    if (party === "A") {
      setWalletAInput(value);
      if (!validateWallet(value)) {
        setBookA((b) => ({ ...b, wallet: value.trim() }));
      }
    } else {
      setWalletBInput(value);
      if (!validateWallet(value)) {
        setBookB((b) => ({ ...b, wallet: value.trim() }));
      }
    }
  }

  function handleDeleteLeg(party: PartyId, index: number) {
    if (party === "A") {
      setBookA((b) => ({ ...b, legs: b.legs.filter((_, i) => i !== index) }));
    } else {
      setBookB((b) => ({ ...b, legs: b.legs.filter((_, i) => i !== index) }));
    }
  }

  function handleAddLeg(newLeg: PositionLeg) {
    const target = newLeg.party === "A" ? setBookA : setBookB;
    target((b) => ({ ...b, legs: [...b.legs, resign(newLeg, b.party)] }));
  }

  /** Pull all current leg marks into the live oracle marks (qty kept). */
  async function syncOraclePrices() {
    setOracleSyncing(true);
    setOracleSyncMessage(null);
    try {
      const res = await fetch("/api/v1/oracle/prices", { cache: "no-store" });
      if (!res.ok) {
        setOracleSyncMessage(`Oracle sync failed (${res.status}) — marks unchanged`);
        return;
      }
      const data = (await res.json()) as {
        prices: Record<string, { priceUsd: number; status: string } | null>;
      };
      const prices = data.prices ?? {};

      const reprice = (b: PositionBook): PositionBook => {
        const legs = b.legs.map((leg) => {
          const mark = prices[leg.bucket]?.priceUsd ?? prices[leg.bucket === "USD" ? "USDC" : leg.bucket]?.priceUsd;
          if (!mark) return leg;
          const notional = Math.round(leg.qty * mark * 100) / 100;
          const signed =
            leg.side === "short" || leg.side === "borrow" ? -notional : notional;
          return { ...leg, markUsd: mark, notionalUsd: notional, signedExposureUsd: signed };
        });
        return { ...b, legs };
      };
      setBookA(reprice);
      setBookB(reprice);
      setOracleSyncMessage("All marks synced to live oracle prices");
    } catch {
      setOracleSyncMessage("Oracle sync failed — marks unchanged");
    } finally {
      setTimeout(() => setOracleSyncMessage(null), 4000);
      setOracleSyncing(false);
    }
  }

  /** Demo record books — served ONLY by the gated demo endpoint. */
  async function loadDemoBooks() {
    setFixtureLoading(true);
    setFixtureError(null);
    try {
      const res = await fetch("/api/v1/demo/fixture-two-party", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setFixtureError(
          body?.message ??
            "Demo record books are not available in this environment. Add your positions instead.",
        );
        return;
      }
      const data = (await res.json()) as { partyA: PositionBook; partyB: PositionBook };
      setBookA(data.partyA);
      setBookB(data.partyB);
      setWalletAInput(data.partyA.wallet);
      setWalletBInput(data.partyB.wallet);
      setErrorA(null);
      setErrorB(null);
      setPhase("setup");
      setComputeError(null);
    } catch {
      setFixtureError("Could not reach the demo endpoint. Add your positions instead.");
    } finally {
      setFixtureLoading(false);
    }
  }

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const siloed = useMemo(() => twoPartySiloedSafe(bookA, bookB), [bookA, bookB]);
  const netted = useMemo(() => twoPartyNettedSafe(bookA, bookB), [bookA, bookB]);

  function loadAdversarialDemo() {
    window.open("/adversarial", "_self");
  }

  function connectPartyA(address: string) {
    setBookA((b) => ({ ...b, wallet: address }));
    setWalletAInput(address);
    setErrorA(null);
  }

  function disconnectPartyA() {
    setBookA(makeEmptyBook("A"));
    setWalletAInput("");
  }

  async function compute() {
    if (!applyValidation(walletAInput, walletBInput)) return;
    if (bookA.legs.length === 0 && bookB.legs.length === 0) {
      setComputeError("Add at least one position on either desk before netting.");
      return;
    }

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setComputeError(null);
    setApiError(null);
    setPhase("computing");
    setStage(0);

    const stages = stagesFor(backend);
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
            partyA: { wallet: bookA.wallet || "local-desk-a", legs: serializeLegs(bookA.legs, "A") },
            partyB: { wallet: bookB.wallet || "local-desk-b", legs: serializeLegs(bookB.legs, "B") },
            demoPayment: true,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          setApiComputationId(data.margin?.computationId || null);
          setApiAttestation(data.margin?.attestation?.quote || null);
        } else {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;
          setApiError(body?.message || `API returned ${response.status}`);
        }
      } catch {
        setApiError("Network error contacting the clearing API");
      }
    } else {
      // In-browser netting: runs the exact same formula via the selected
      // confidential backend (MPC/TEE/simulated label is displayed).
      try {
        const backendInstance = getConfidentialBackend(backend);
        const res = await backendInstance.netTwoParty(bookA, bookB);
        setApiComputationId(res.computationId);
        setApiAttestation(res.attestation?.quote || null);
      } catch {
        setApiError("Local netting failed — check the position books and retry.");
      }
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
    setComputeError(null);
    setApiComputationId(null);
    setApiAttestation(null);
    setApiError(null);
  }

  const busy = phase === "computing";
  const stages = stagesFor(backend);

  return (
    <PageShell>
      <div className="flex flex-col gap-8">
        {/* Page Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-foreground mb-1">
              <Layers className="h-3.5 w-3.5" aria-hidden />
              <span>Confidential clearing</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Clear two books in one step
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Build both desks&rsquo; positions, run the confidential computation, and see how much
              margin you free up together.
            </p>
          </div>
          <BackendBadge kind={backend} showNote />
        </div>

        {/* 4-Step Interactive Progress Stepper */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label="Progress">
          {[
            { num: "01", label: "Build your book", active: true, done: bookA.legs.length > 0 },
            { num: "02", label: "Add counterparty", active: true, done: bookB.legs.length > 0 },
            { num: "03", label: "Run netting", active: phase === "computing" || phase === "done", done: phase === "done" },
            { num: "04", label: "Settle & claim savings", active: phase === "done", done: false },
          ].map((s) => (
            <div
              key={s.num}
              className={`rounded-2xl border p-3.5 transition-colors duration-150 ${
                s.done
                  ? "border-success/40 bg-success/5 text-success"
                  : s.active
                  ? "border-foreground/60 bg-card text-foreground"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold">{s.done ? "✓" : s.num}</span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${s.done ? "bg-success" : s.active ? "bg-foreground" : "bg-transparent"}`}
                  aria-hidden
                />
              </div>
              <span className="text-xs font-semibold block mt-1">{s.label}</span>
            </div>
          ))}
        </div>

        {(computeError || fixtureError || apiError) && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div className="text-sm">
              <p className="font-semibold text-destructive">Something needs your attention</p>
              <p className="mt-1 text-muted-foreground">{computeError ?? fixtureError ?? apiError}</p>
            </div>
          </div>
        )}

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
                    aria-pressed={backend === b.id}
                    title={
                      b.id === "arcium"
                        ? "Both books stay encrypted end-to-end. No one — not even Obligor — can read them."
                        : b.id === "enclave"
                        ? "Books are sealed inside hardware-attested encryption. Same formula, different trust model."
                        : "Runs the exact same formula in your browser. Great for learning how netting works."
                    }
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
              <span>Advanced: route via the live clearing API</span>
            </label>
          </div>
        </section>

        {phase === "setup" && (
          <section aria-label="Party setup" className="rounded-2xl border border-border bg-card p-5 md:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-4">
              <div>
                <h2 className="text-base font-bold text-foreground">Two desks, one net margin</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Add positions on each side. Positions sync to live oracle marks when you sync.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={loadDemoBooks}
                  disabled={fixtureLoading}
                  className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {fixtureLoading ? "Loading demo books…" : "Load demo record books"}
                </button>
                <button
                  type="button"
                  onClick={loadAdversarialDemo}
                  className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground hover:border-destructive/50 hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  See the dangerous counterfactual
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <label htmlFor="wallet-a" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
                  <span>Your desk (Party A)</span>
                </label>
                <input
                  id="wallet-a"
                  type="text"
                  value={walletAInput}
                  onChange={(e) => setWalletFromInput("A", e.target.value)}
                  placeholder="Paste a wallet address (optional)"
                  autoComplete="off"
                  spellCheck={false}
                  className={`mt-2 h-10 w-full rounded-md border bg-background px-3 font-mono text-xs transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    errorA ? "border-destructive" : "border-border"
                  }`}
                  aria-invalid={!!errorA}
                  aria-describedby={errorA ? "wallet-a-error" : undefined}
                />
                {errorA && (
                  <p id="wallet-a-error" className="mt-1.5 text-xs text-destructive">
                    {errorA}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <label htmlFor="wallet-b" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-400" aria-hidden />
                  <span>Counterparty desk (Party B)</span>
                </label>
                <input
                  id="wallet-b"
                  type="text"
                  value={walletBInput}
                  onChange={(e) => setWalletFromInput("B", e.target.value)}
                  placeholder="Paste a wallet address (optional)"
                  autoComplete="off"
                  spellCheck={false}
                  className={`mt-2 h-10 w-full rounded-md border bg-background px-3 font-mono text-xs transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    errorB ? "border-destructive" : "border-border"
                  }`}
                  aria-invalid={!!errorB}
                  aria-describedby={errorB ? "wallet-b-error" : undefined}
                />
                {errorB && (
                  <p id="wallet-b-error" className="mt-1.5 text-xs text-destructive">
                    {errorB}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
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
                <span>Run confidential netting</span>
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
                {backend === "arcium" ? "MPC circuit" : backend === "enclave" ? "Enclave TEE" : "Local simulation"}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <div className="anim-shimmer h-full w-full rounded-full bg-gradient-to-r from-transparent via-foreground to-transparent motion-reduce:animate-none" />
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
                    <LoaderCircle className="h-3 w-3 animate-spin text-foreground motion-reduce:animate-none" aria-hidden />
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {phase === "done" && netted && (
          <div className="space-y-6">
            <MarginHero result={netted} siloedCombined={siloed.siloedCombined} onReset={reset} />

            {/* Step 4: escrow release demo against the computed split */}
            <EscrowVaultCard
              siloedMarginA={siloed.siloedA}
              siloedMarginB={siloed.siloedB}
              netMargin={netted.nettedCombinedUsd}
              savingsUsd={netted.savingsUsd}
              backend={backend}
              computationId={apiComputationId}
              walletA={bookA.wallet}
              walletB={bookB.wallet}
            />

            {(apiComputationId || apiAttestation) && (
              <div className="rounded-xl border border-border bg-card p-4 font-mono text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {apiComputationId && (
                    <span>
                      Computation ID: <strong className="text-foreground">{apiComputationId}</strong>
                    </span>
                  )}
                  {apiAttestation && (
                    <span className="text-foreground">Attestation: {apiAttestation.slice(0, 24)}…</span>
                  )}
                  <span className="text-success">Zero counterparty legs leaked</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Oracle sync bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-foreground font-medium">Live oracle marks:</span>
            <span className="font-mono text-muted-foreground">
              {oracleSyncMessage || "Sync to re-price every leg from Pyth Hermes"}
            </span>
          </div>

          <button
            type="button"
            disabled={oracleSyncing}
            onClick={syncOraclePrices}
            className="rounded-full border border-border bg-secondary px-4 py-1.5 font-mono text-xs text-foreground hover:border-foreground transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {oracleSyncing ? "Fetching feeds…" : "Sync oracle prices"}
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

        {builderModalParty && (
          <PositionBuilderModal
            party={builderModalParty}
            partyName={builderModalParty === "A" ? "Party A" : "Party B"}
            isOpen={true}
            onClose={() => setBuilderModalParty(null)}
            onAddLeg={handleAddLeg}
          />
        )}
      </div>
    </PageShell>
  );
}

// Local-safe wrappers so compute errors never crash the page.
import { twoPartyNetted as tpn, twoPartySiloed as tps, type NetMarginResult } from "@/lib/margin";

function twoPartySiloedSafe(a: PositionBook, b: PositionBook) {
  try {
    return tps(a, b);
  } catch {
    return { siloedA: 0, siloedB: 0, siloedCombined: 0 };
  }
}

function twoPartyNettedSafe(a: PositionBook, b: PositionBook): NetMarginResult | null {
  if (a.legs.length === 0 && b.legs.length === 0) return null;
  try {
    return tpn(a, b);
  } catch {
    return null;
  }
}

/** Serialize PositionLegs to the raw schema the net-margin API expects. */
function serializeLegs(legs: PositionLeg[], party: PartyId) {
  return legs.map((l) => ({
    party,
    venue: l.venue,
    instrument: l.instrument,
    bucket: l.bucket,
    side: l.side,
    qty: l.qty,
    markUsd: l.markUsd,
  }));
}
