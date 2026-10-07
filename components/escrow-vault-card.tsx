"use client";

import { useState } from "react";
import { Lock, Unlock, CheckCircle2, Sparkles } from "lucide-react";
import { usd as usdFmt } from "@/lib/margin";

interface EscrowVaultCardProps {
  siloedMarginA: number;
  siloedMarginB: number;
  netMargin: number;
  savingsUsd: number;
  backend: string;
}

export function EscrowVaultCard({
  siloedMarginA,
  siloedMarginB,
  netMargin,
  savingsUsd,
  backend,
}: EscrowVaultCardProps) {
  const [escrowState, setEscrowState] = useState<"idle" | "depositing" | "locked" | "released">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);

  const halfNetMargin = netMargin / 2;
  const deskASavings = siloedMarginA - halfNetMargin;
  const deskBSavings = siloedMarginB - halfNetMargin;

  function handleSimulateEscrow() {
    setEscrowState("depositing");
    setTimeout(() => {
      setEscrowState("locked");
      setTxHash("0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""));
    }, 1200);
  }

  function handleReleaseExcess() {
    setEscrowState("released");
  }

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
              ({backend === "arcium" ? "Solana program" : "Monad contract"})
            </span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Both desks post the net margin into escrow; whatever isn&rsquo;t needed comes straight back.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs">
          <span className={`h-2 w-2 rounded-full ${
            escrowState === "released" ? "bg-success" :
            escrowState === "locked" ? "bg-foreground" : "bg-muted-foreground"
          }`} />
          <span className="font-mono text-muted-foreground">
            Status: {
              escrowState === "idle" ? "Awaiting Deposit" :
              escrowState === "depositing" ? "Confirming on-chain..." :
              escrowState === "locked" ? "Net Margin Locked" : "Excess Capital Released"
            }
          </span>
        </div>
      </div>

      {/* Escrow Balances Matrix */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Desk A Escrow */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-foreground">Desk A Obligation</span>
            <span className="text-success font-mono">
              Freed: +${deskASavings.toLocaleString()}
            </span>
          </div>
          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between text-muted-foreground">
              <span>Solo Siloed Margin:</span>
              <span className="line-through text-red-400">${siloedMarginA.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-foreground font-bold">
              <span>Required Net Deposit:</span>
              <span className="text-foreground">${halfNetMargin.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Desk B Escrow */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-foreground">Desk B Obligation</span>
            <span className="text-success font-mono">
              Freed: +${deskBSavings.toLocaleString()}
            </span>
          </div>
          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between text-muted-foreground">
              <span>Solo Siloed Margin:</span>
              <span className="line-through text-red-400">${siloedMarginB.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-foreground font-bold">
              <span>Required Net Deposit:</span>
              <span className="text-foreground">${halfNetMargin.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Actions */}
      <div className="pt-2 space-y-3">
        {escrowState === "idle" && (
          <button
            onClick={handleSimulateEscrow}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-primary py-3.5 px-6 font-semibold text-primary-foreground transition-colors duration-150 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Lock className="h-4 w-4" aria-hidden />
            <span>Deposit net margin to escrow ({usdFmt(netMargin)} total)</span>
          </button>
        )}

        {escrowState === "depositing" && (
          <div className="w-full flex items-center justify-center gap-2 rounded-full border border-border bg-secondary py-3.5 px-6 text-sm text-foreground">
            <span className="animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
            <span>Broadcasting bilateral deposit transaction...</span>
          </div>
        )}

        {escrowState === "locked" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-xs text-success space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                <span>Net margin secured in escrow</span>
              </div>
              <p className="text-foreground">
                Both desks deposited {usdFmt(halfNetMargin)}. {usdFmt(savingsUsd)} is verified as excess margin, ready to release.
              </p>
              {txHash && (
                <div className="pt-1 font-mono text-[11px] text-muted-foreground break-all">
                  Escrow Tx: {txHash}
                </div>
              )}
            </div>

            <button
              onClick={handleReleaseExcess}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-success py-3.5 px-6 font-bold text-primary-foreground transition-colors duration-150 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Unlock className="h-4 w-4" aria-hidden />
              <span>Release freed capital ({usdFmt(savingsUsd)})</span>
            </button>
          </div>
        )}

        {escrowState === "released" && (
          <div className="rounded-xl border border-border p-5 text-center space-y-2">
            <Sparkles className="h-6 w-6 text-foreground mx-auto" aria-hidden />
            <h4 className="text-base font-bold text-foreground">Settlement complete</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {usdFmt(savingsUsd)} was released back to the desks. Capital efficiency improved by{" "}
              {Math.round((savingsUsd / (siloedMarginA + siloedMarginB)) * 100)}%.
            </p>
            <button
              onClick={() => setEscrowState("idle")}
              className="mt-2 text-xs text-foreground hover:underline font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Reset simulation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
