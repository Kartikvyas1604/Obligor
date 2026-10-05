"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, ShieldCheck, Cpu, ArrowRight, Sparkles, Layers, Wallet } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { WalletConnect } from "@/components/wallet-connect";
import { solanaPartyA } from "@/lib/fixtures";
import { type BackendKind } from "@/lib/margin";

export default function DealLauncherPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<string>(solanaPartyA.wallet);
  const [label, setLabel] = useState<string>("My Trading Desk");
  const [backend, setBackend] = useState<BackendKind>("arcium");
  const [creating, setCreating] = useState(false);

  async function handleCreateSession() {
    setCreating(true);
    try {
      const res = await fetch("/api/v1/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletA: wallet,
          labelA: label,
          legsA: solanaPartyA.legs,
          backend,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/deal/${data.session.sessionId}`);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl py-8 sm:py-12 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 font-['JetBrains_Mono',monospace] text-xs uppercase tracking-wider text-[#C59A3F]">
            <Users className="h-4 w-4" />
            <span>P2P Confidential Clearing</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Create a Live Bilateral Deal Room
          </h1>
          <p className="text-sm sm:text-base text-[#94A3B8] max-w-xl mx-auto">
            Initiate a private, cryptographically sealed session. Invite an institutional counterparty to clear offsetting positions without leaking trading books.
          </p>
        </div>

        {/* Creation Card */}
        <div className="rounded-[28px] border border-[#1F1F1F] bg-[#0A0A0A] p-6 sm:p-10 space-y-6 shadow-2xl">
          {/* Desk Label */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#94A3B8]">Your Desk Name</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Wintermute Desk Alpha"
              className="w-full h-11 rounded-xl border border-[#1F1F1F] bg-[#141414] px-4 font-mono text-sm text-white focus-visible:outline-none focus-visible:border-[#C59A3F]"
            />
          </div>

          {/* Wallet Address */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#94A3B8]">Your Wallet Address</label>
              <WalletConnect onConnect={(addr) => setWallet(addr)} />
            </div>
            <input
              type="text"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="Base58 / EVM Address"
              className="w-full h-11 rounded-xl border border-[#1F1F1F] bg-[#141414] px-4 font-mono text-xs text-white focus-visible:outline-none focus-visible:border-[#C59A3F]"
            />
          </div>

          {/* Confidential Engine Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#94A3B8]">Confidential Clearing Engine</label>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                {
                  id: "arcium",
                  title: "Arcium MPC (Solana)",
                  desc: "Multi-party cryptographic circuit. Zero single point of failure.",
                },
                {
                  id: "enclave",
                  title: "Nitro TEE (Monad)",
                  desc: "Hardware-isolated enclave with verifiable PCR0 attestation.",
                },
              ].map((b) => (
                <button
                  type="button"
                  key={b.id}
                  onClick={() => setBackend(b.id as BackendKind)}
                  className={`flex flex-col text-left p-4 rounded-xl border text-xs transition-all ${
                    backend === b.id
                      ? "border-[#C59A3F] bg-[#C59A3F]/10 text-white shadow-sm"
                      : "border-[#1F1F1F] bg-[#141414] text-[#94A3B8] hover:text-white"
                  }`}
                >
                  <span className="font-bold text-sm text-white mb-1">{b.title}</span>
                  <span className="text-[11px] leading-relaxed text-[#94A3B8]">{b.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Launch Button */}
          <button
            type="button"
            disabled={creating}
            onClick={handleCreateSession}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#E8C874] via-[#C59A3F] to-[#A67C27] py-4 font-bold text-black text-sm shadow-[0_4px_25px_rgba(197,154,63,0.3)] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {creating ? (
              <span>Initializing Real-Time Session...</span>
            ) : (
              <>
                <span>Launch Deal Room &amp; Invite Counterparty</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </PageShell>
  );
}
