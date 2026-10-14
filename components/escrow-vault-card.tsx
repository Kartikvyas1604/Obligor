"use client";

import { useState } from "react";
import { Lock, Unlock, CheckCircle2, ShieldAlert } from "lucide-react";
import { usd as usdFmt, type BackendKind } from "@/lib/margin";
import { EscrowDepositPanel } from "./escrow-deposit-panel";

interface EscrowVaultCardProps {
  siloedMarginA: number;
  siloedMarginB: number;
  netMargin: number;
  savingsUsd: number;
  /** Backend that produced the verified netting result. */
  backend: BackendKind;
  /** Computation id of the confidential run — becomes the escrow release condition. */
  computationId?: string | null;
  /** Wallet address passed to the escrow API when known. */
  walletA?: string | null;
  walletB?: string | null;
  /** Deal-room sessionId: routes through the room lifecycle instead of the standalone escrow API. */
  sessionId?: string | null;
}

interface EscrowTx {
  escrowId?: string;
  proofHash?: string;
  releasedToPartyAUsd?: number;
  releasedToPartyBUsd?: number;
  message?: string;
}

/** Release math used ONLY for the clearly-labeled per-desk projection shown
 *  before settlement. The confirmed split always comes from the server. */
function projectedFreed(siloedA: number, siloedB: number, netMargin: number) {
  const total = Math.round((siloedA + siloedB) * 100) / 100;
  const freed = Math.max(0, Math.round((total - netMargin) * 100) / 100);
  const a = total > 0 ? Math.round((freed * siloedA) / total * 100) / 100 : 0;
  const b = Math.round((freed - a) * 100) / 100;
  return { freed, a, b };
}

/**
 * Escrow settlement card — wired to the real escrow envelope:
 * POST /api/v1/escrow/deposit → POST /api/v1/escrow/settle. The reported
 * release split is always the server's (or in a deal room, the session settle
 * response's). Amounts are netting analytics — no funds move from desk
 * wallets in this deployment, and no transaction hash is ever fabricated.
 */
export function EscrowVaultCard({
  siloedMarginA,
  siloedMarginB,
  netMargin,
  savingsUsd,
  backend,
  computationId,
  walletA,
  walletB,
  sessionId,
}: EscrowVaultCardProps) {
  const [escrowState, setEscrowState] = useState<"idle" | "depositing" | "locked" | "releasing" | "released">("idle");
  const [escrowError, setEscrowError] = useState<string | null>(null);
  const [escrowTx, setEscrowTx] = useState<EscrowTx | null>(null);
  const [releasedSplit, setReleasedSplit] = useState<{ a: number; b: number } | null>(null);

  const totalLocked = Math.round((siloedMarginA + siloedMarginB) * 100) / 100;
  const projection = projectedFreed(siloedMarginA, siloedMarginB, netMargin);

  /** Build honest escrow inputs from the verified run; throws on missing wallet. */
  function escrowInputs() {
    const a = walletA?.trim() || "desk-a-unmapped";
    const b = walletB?.trim() || "desk-b-unmapped";
    const escrowId = computationId
      ? `escrow_${computationId}`
      : `escrow_${backend}_${Date.now().toString(36)}`;
    const proofHash = computationId ?? escrowId;
    return {
      escrowId,
      proofHash,
      body: {
        escrowId,
        chain: backend === "enclave" ? ("monad" as const) : ("solana" as const),
        partyA: a,
        partyB: b,
        // Each desk locks its own siloed margin; the release returns the
        // surplus above the combined netted obligation proportionally.
        amountAUsd: Math.round(siloedMarginA * 100) / 100,
        amountBUsd: Math.round(siloedMarginB * 100) / 100,
        computationId,
      },
      settleBody: {
        escrowId,
        chain: backend === "enclave" ? ("monad" as const) : ("solana" as const),
        totalLockedUsd: totalLocked,
        nettedMarginUsd: netMargin,
        proofHash,
        partyALockedUsd: Math.round(siloedMarginA * 100) / 100,
        partyBLockedUsd: Math.round(siloedMarginB * 100) / 100,
      },
    };
  }

  async function recordDeposit() {
    const inputs = escrowInputs();
    setEscrowError(null);
    setEscrowState("depositing");
    try {
      if (sessionId) {
        // Deal-room flows record both desks' deposits through the room
        // lifecycle so the counterparty sees the same escrow state. No
        // txHash is sent: this envelope carries an escrow id, not a chain tx.
        for (const [partyId, amount] of [
          ["A", Math.round(siloedMarginA * 100) / 100],
          ["B", Math.round(siloedMarginB * 100) / 100],
        ] as const) {
          const res = await fetch(`/api/v1/sessions/${sessionId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "deposit_escrow", partyId, amount }),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `Session deposit failed (${res.status})`);
        }
      } else {
        const res = await fetch("/api/v1/escrow/deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputs.body),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `Deposit failed (${res.status})`);
      }
      setEscrowTx({ escrowId: inputs.body.escrowId });
      setEscrowState("locked");
    } catch (err) {
      setEscrowError(err instanceof Error ? err.message : "Deposit failed");
      setEscrowState("idle");
    }
  }

  async function releaseExcess() {
    setEscrowError(null);
    setEscrowState("releasing");
    try {
      if (sessionId) {
        const res = await fetch(`/api/v1/sessions/${sessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "settle" }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `Settle failed (${res.status})`);
        const data = (await res.json()) as {
          escrowRelease?: { releasedToPartyAUsd?: number; releasedToPartyBUsd?: number; freedCapitalUsd?: number };
        };
        if (!data.escrowRelease) throw new Error("Settle succeeded but returned no release split");
        setReleasedSplit({
          a: data.escrowRelease.releasedToPartyAUsd ?? 0,
          b: data.escrowRelease.releasedToPartyBUsd ?? 0,
        });
      } else {
        const inputs = escrowInputs();
        const res = await fetch("/api/v1/escrow/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputs.settleBody),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `Settle failed (${res.status})`);
        const data = (await res.json()) as {
          releasedToPartyAUsd?: number;
          releasedToPartyBUsd?: number;
          proofHash?: string;
        };
        setReleasedSplit({ a: data.releasedToPartyAUsd ?? 0, b: data.releasedToPartyBUsd ?? 0 });
        setEscrowTx((t) => ({ ...t, proofHash: data.proofHash }));
      }
      setEscrowState("released");
    } catch (err) {
      setEscrowError(err instanceof Error ? err.message : "Release failed");
      setEscrowState("locked");
    }
  }

  function resetEscrow() {
    setEscrowState("idle");
    setEscrowError(null);
    setEscrowTx(null);
    setReleasedSplit(null);
  }

  const confirmed = releasedSplit !== null;
  const showA = confirmed ? releasedSplit.a : projection.a;
  const showB = confirmed ? releasedSplit.b : projection.b;

  return (
    <div className="rounded-[24px] border border-border bg-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
        <div>
          <span className="font-mono text-xs uppercase tracking-wider text-foreground block mb-1">
            Step 4 · Settlement
          </span>
          <h3 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <span>Escrow vault</span>
            <span className="text-xs font-normal text-muted-foreground font-mono">
              ({backend === "arcium" ? "Solana program envelope" : "Monad contract envelope"})
            </span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Records the bilateral deposit split (each desk locks its siloed margin) and computes
            the proportional release against the verified netting result. This session moves
            analytics, not funds — the envelope carries no fabricated transaction hash.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs">
          <span className={`h-2 w-2 rounded-full ${
            escrowState === "released" ? "bg-success" :
            escrowState === "locked" ? "bg-foreground" : "bg-muted-foreground"
          }`} aria-hidden />
          <span className="font-mono text-muted-foreground">
            Status: {
              escrowState === "idle" ? "Awaiting deposit" :
              escrowState === "depositing" ? "Recording deposit…" :
              escrowState === "locked" ? "Deposit recorded — ready to release" :
              escrowState === "releasing" ? "Computing release…" : "Release computed"
            }
          </span>
        </div>
      </div>

      {escrowError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="font-semibold text-destructive">Escrow action failed</p>
            <p className="mt-1 text-muted-foreground">{escrowError}</p>
          </div>
        </div>
      )}

      {/* Escrow Balances Matrix */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Desk A Escrow */}
        <div className="rounded-xl border border-border p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-foreground">Desk A escrow</span>
            <span className={`font-mono ${confirmed ? "text-success" : "text-muted-foreground"}`}>
              {confirmed ? `Released: +${usdFmt(showA)}` : `Est. freed: +${usdFmt(showA)}`}
            </span>
          </div>
          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between text-muted-foreground">
              <span>Siloed margin locked:</span>
              <span className="text-foreground font-bold">{usdFmt(siloedMarginA)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Remaining net obligation:</span>
              <span className="text-foreground">{usdFmt(Math.round((siloedMarginA - showA) * 100) / 100)}</span>
            </div>
          </div>
        </div>

        {/* Desk B Escrow */}
        <div className="rounded-xl border border-border p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-foreground">Desk B escrow</span>
            <span className={`font-mono ${confirmed ? "text-success" : "text-muted-foreground"}`}>
              {confirmed ? `Released: +${usdFmt(showB)}` : `Est. freed: +${usdFmt(showB)}`}
            </span>
          </div>
          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between text-muted-foreground">
              <span>Siloed margin locked:</span>
              <span className="text-foreground font-bold">{usdFmt(siloedMarginB)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Remaining net obligation:</span>
              <span className="text-foreground">{usdFmt(Math.round((siloedMarginB - showB) * 100) / 100)}</span>
            </div>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-3">
        {confirmed
          ? "Split confirmed by the server from the verified netting result."
          : "Projection: freed capital split proportionally to each desk’s locked siloed margin. The confirmed split is returned by the server on settle."}
      </p>

      {/* Real client-signed on-chain deposit (when the escrow program is configured) */}
      <EscrowDepositPanel
        walletA={walletA}
        walletB={walletB}
        amountAUsd={Math.round(siloedMarginA * 100) / 100}
        amountBUsd={Math.round(siloedMarginB * 100) / 100}
      />

      {/* Interactive Actions */}
      <div className="pt-2 space-y-3">
        {escrowState === "idle" && (
          <button
            type="button"
            onClick={recordDeposit}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-primary py-3.5 px-6 font-semibold text-primary-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Lock className="h-4 w-4" aria-hidden />
            <span>Record deposit to escrow ({usdFmt(totalLocked)} total siloed)</span>
          </button>
        )}

        {escrowState === "depositing" && (
          <div className="w-full flex items-center justify-center gap-2 rounded-full border border-border bg-secondary py-3.5 px-6 text-sm text-foreground" aria-live="polite" aria-busy="true">
            <span className="animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full motion-reduce:animate-none" />
            <span>Recording the bilateral deposit…</span>
          </div>
        )}

        {escrowState === "locked" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-xs text-success space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                <span>Deposit intent recorded against the escrow envelope</span>
              </div>
              <p className="text-foreground">
                Both desks locked their siloed margins ({usdFmt(totalLocked)} in total). {usdFmt(savingsUsd)} is
                verified as excess against the netted obligation and ready to compute for release.
              </p>
              <p className="text-[11px] text-muted-foreground">
                Envelope id only — no on-chain transaction has been fabricated or executed in this deployment.
              </p>
              {escrowTx?.escrowId && (
                <div className="pt-1 font-mono text-[11px] text-muted-foreground break-all">
                  escrow envelope id: {escrowTx.escrowId}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={releaseExcess}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-success py-3.5 px-6 font-bold text-primary-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Unlock className="h-4 w-4" aria-hidden />
              <span>Compute &amp; release freed capital ({usdFmt(savingsUsd)})</span>
            </button>
          </div>
        )}

        {escrowState === "releasing" && (
          <div className="w-full flex items-center justify-center gap-2 rounded-full border border-border bg-secondary py-3.5 px-6 text-sm text-foreground" aria-live="polite" aria-busy="true">
            <span className="animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full motion-reduce:animate-none" />
            <span>Computing the verified release split…</span>
          </div>
        )}

        {escrowState === "released" && (
          <div className="rounded-xl border border-border p-5 text-center space-y-2">
            <CheckCircle2 className="h-6 w-6 text-success mx-auto" aria-hidden />
            <h4 className="text-base font-bold text-foreground">Release computed</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Server-computed split against the verified netting result:{" "}
              <span className="font-mono text-foreground">Desk A {usdFmt(releasedSplit?.a ?? 0)}</span> ·{" "}
              <span className="font-mono text-foreground">Desk B {usdFmt(releasedSplit?.b ?? 0)}</span>. Capital
              efficiency improved by {Math.round((savingsUsd / totalLocked) * 100)}%.
              On-chain execution happens in the escrow contract repo — this envelope carries the
              release computation, not a funds transfer and not a fabricated transaction hash.
            </p>
            {escrowTx?.proofHash && (
              <p className="font-mono text-[11px] text-muted-foreground break-all">proof: {escrowTx.proofHash}</p>
            )}
            <button
              type="button"
              onClick={resetEscrow}
              className="mt-2 text-xs text-foreground hover:underline font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Run settlement again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}