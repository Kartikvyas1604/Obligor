"use client";

import { useState } from "react";
import { Lock, Unlock, CheckCircle2, ShieldCheck, ArrowRight, Wallet, Sparkles, ExternalLink } from "lucide-react";

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
    <div className="rounded-[24px] border border-[#1F1F1F] bg-[#0A0A0A] p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1F1F1F] pb-4">
        <div>
          <span className="font-['JetBrains_Mono',monospace] text-xs uppercase tracking-wider text-[#C59A3F] block mb-1">
            Smart Contract Settlement
          </span>
          <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Bilateral Escrow Vault</span>
            <span className="text-xs font-normal text-[#94A3B8] font-['JetBrains_Mono',monospace]">
              ({backend === "arcium" ? "Solana Anchor Program" : "Monad EVM Contract"})
            </span>
          </h3>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-[#1F1F1F] bg-[#141414] px-3 py-1 text-xs">
          <span className={`h-2 w-2 rounded-full ${
            escrowState === "released" ? "bg-emerald-400" :
            escrowState === "locked" ? "bg-[#E8C874]" : "bg-[#64748B]"
          }`} />
          <span className="font-['JetBrains_Mono',monospace] text-[#94A3B8]">
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
        <div className="rounded-xl border border-[#1F1F1F] bg-[#111111] p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-white">Desk A Obligation</span>
            <span className="text-emerald-400 font-['JetBrains_Mono',monospace]">
              Freed: +${deskASavings.toLocaleString()}
            </span>
          </div>
          <div className="space-y-1 text-xs font-['JetBrains_Mono',monospace]">
            <div className="flex justify-between text-[#94A3B8]">
              <span>Solo Siloed Margin:</span>
              <span className="line-through text-red-400">${siloedMarginA.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-white font-bold">
              <span>Required Net Deposit:</span>
              <span className="text-[#E8C874]">${halfNetMargin.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Desk B Escrow */}
        <div className="rounded-xl border border-[#1F1F1F] bg-[#111111] p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-white">Desk B Obligation</span>
            <span className="text-emerald-400 font-['JetBrains_Mono',monospace]">
              Freed: +${deskBSavings.toLocaleString()}
            </span>
          </div>
          <div className="space-y-1 text-xs font-['JetBrains_Mono',monospace]">
            <div className="flex justify-between text-[#94A3B8]">
              <span>Solo Siloed Margin:</span>
              <span className="line-through text-red-400">${siloedMarginB.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-white font-bold">
              <span>Required Net Deposit:</span>
              <span className="text-[#E8C874]">${halfNetMargin.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Actions */}
      <div className="pt-2 space-y-3">
        {escrowState === "idle" && (
          <button
            onClick={handleSimulateEscrow}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#E8C874] via-[#C59A3F] to-[#A67C27] py-3.5 px-6 font-semibold text-black transition-all hover:scale-[1.01] active:scale-[0.99] shadow-md text-sm"
          >
            <Lock className="h-4 w-4" />
            <span>Deposit Net Margin to Escrow Vault (${netMargin.toLocaleString()} Total)</span>
          </button>
        )}

        {escrowState === "depositing" && (
          <div className="w-full flex items-center justify-center gap-2 rounded-full border border-[#C59A3F]/40 bg-[#141414] py-3.5 px-6 text-sm text-[#E8C874]">
            <span className="animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
            <span>Broadcasting bilateral deposit transaction...</span>
          </div>
        )}

        {escrowState === "locked" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Net Margin Secured in Escrow!</span>
              </div>
              <p className="text-[#CBD5E1]">
                Both counterparties deposited ${halfNetMargin.toLocaleString()}. A total of ${savingsUsd.toLocaleString()} is verified as excess margin.
              </p>
              {txHash && (
                <div className="pt-1 font-['JetBrains_Mono',monospace] text-[11px] text-[#94A3B8] break-all">
                  Escrow Tx: {txHash}
                </div>
              )}
            </div>

            <button
              onClick={handleReleaseExcess}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-emerald-500 py-3.5 px-6 font-bold text-black hover:bg-emerald-400 transition-all text-sm shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              <Unlock className="h-4 w-4" />
              <span>Claim &amp; Release Freed Capital (+${savingsUsd.toLocaleString()})</span>
            </button>
          </div>
        )}

        {escrowState === "released" && (
          <div className="rounded-xl border border-[#C59A3F]/40 bg-gradient-to-br from-[#17140E] to-[#0A0A0A] p-5 text-center space-y-2">
            <Sparkles className="h-6 w-6 text-[#E8C874] mx-auto" />
            <h4 className="text-base font-bold text-white">Settlement Complete!</h4>
            <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
              ${savingsUsd.toLocaleString()} has been unlocked and credited back to the desks. Capital efficiency increased by {Math.round((savingsUsd / (siloedMarginA + siloedMarginB)) * 100)}%.
            </p>
            <button
              onClick={() => setEscrowState("idle")}
              className="mt-2 text-xs text-[#C59A3F] hover:underline font-['JetBrains_Mono',monospace]"
            >
              Reset Simulation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
