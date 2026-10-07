"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  Users,
  Copy,
  Check,
  ShieldCheck,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Cpu,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Wallet,
  ExternalLink,
  Layers,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { MarginHero } from "@/components/margin-hero";
import { PositionBuilderModal } from "@/components/position-builder-modal";
import { EscrowVaultCard } from "@/components/escrow-vault-card";
import { type DealSession, type SessionParty } from "@/lib/deal-session";
import { type PositionLeg, type PartyId, usd, siloedIm } from "@/lib/margin";

function truncate(addr: string, len = 6) {
  if (!addr || addr.length <= len * 2 + 3) return addr;
  return `${addr.slice(0, len)}...${addr.slice(-len)}`;
}

export default function LiveDealPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const [session, setSession] = useState<DealSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<"A" | "B">("A");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  // Poll session every 1.5 seconds for true real-time multi-device sync
  useEffect(() => {
    let active = true;

    async function fetchSession() {
      try {
        const res = await fetch(`/api/v1/sessions/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (active && data.session) {
            setSession(data.session);
          }
        }
      } catch {
        // network retry
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchSession();
    const interval = setInterval(fetchSession, 1500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  async function handleJoinAsPartyB() {
    setActionBusy(true);
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          walletB: "7F3P9qN2L8XwK1vE4mY5tA6bC7dE8fG9h0j1k2l3m4n5",
          labelB: "Desk B (Counterparty)",
          legsB: [
            {
              party: "B",
              venue: "drift",
              instrument: "SOL-PERP",
              bucket: "crypto_sol",
              side: "short",
              qty: 700,
              notionalUsd: 100_000,
              signedExposureUsd: -100_000,
              haircut: 0.15,
              markUsd: 142.85,
              source: "live",
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
        setMyRole("B");
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function handleAddCustomLeg(newLeg: PositionLeg) {
    if (!session) return;
    const currentLegs = myRole === "A" ? session.partyA.legs : session.partyB?.legs || [];
    const updatedLegs = [...currentLegs, { ...newLeg, party: myRole }];

    await fetch(`/api/v1/sessions/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_legs",
        partyId: myRole,
        legs: updatedLegs,
      }),
    });
  }

  async function handleDeleteLeg(index: number) {
    if (!session) return;
    const currentLegs = myRole === "A" ? session.partyA.legs : session.partyB?.legs || [];
    const updatedLegs = currentLegs.filter((_, i) => i !== index);

    await fetch(`/api/v1/sessions/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_legs",
        partyId: myRole,
        legs: updatedLegs,
      }),
    });
  }

  async function handleSealBook() {
    setActionBusy(true);
    try {
      await fetch(`/api/v1/sessions/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "seal",
          partyId: myRole,
          signature: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
        }),
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleExecuteClear() {
    setActionBusy(true);
    try {
      await fetch(`/api/v1/sessions/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
    } finally {
      setActionBusy(false);
    }
  }

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  if (loading) {
    return (
      <PageShell>
        <div className="py-24 text-center space-y-3">
          <div className="animate-spin inline-block h-8 w-8 border-2 border-foreground border-t-transparent rounded-full" />
          <p className="text-sm font-mono text-muted-foreground">Connecting to Live Real-Time Relay...</p>
        </div>
      </PageShell>
    );
  }

  if (!session) {
    return (
      <PageShell>
        <div className="py-24 text-center space-y-4">
          <h2 className="text-2xl font-bold text-foreground">Deal Session Not Found</h2>
          <p className="text-sm text-muted-foreground">This bilateral clearing session has expired or does not exist.</p>
          <Link
            href="/deal"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground"
          >
            Create New Deal Room
          </Link>
        </div>
      </PageShell>
    );
  }

  const myParty = myRole === "A" ? session.partyA : session.partyB;
  const otherParty = myRole === "A" ? session.partyB : session.partyA;
  const myIm = myParty ? siloedIm(myParty.legs) : 0;
  const otherIm = otherParty ? siloedIm(otherParty.legs) : 0;

  return (
    <PageShell>
      <div className="flex flex-col gap-8">
        {/* Top Header & Role Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="inline-flex items-center gap-2 font-mono text-xs text-foreground uppercase tracking-wider mb-1">
              <Users className="h-3.5 w-3.5" />
              <span>Live Bilateral Clearing Terminal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">
              <span>Deal Room:</span>
              <span className="font-mono text-sm sm:text-base text-foreground bg-secondary px-3 py-1 rounded-lg border border-border">
                {truncate(session.sessionId, 8)}
              </span>
            </h1>
          </div>

          {/* Role Indicator & Test Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">Viewing as:</span>
            <div className="inline-flex rounded-full border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setMyRole("A")}
                className={`rounded-full px-4 py-1 font-mono text-xs transition-colors ${
                  myRole === "A" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Desk A (Host)
              </button>
              <button
                type="button"
                onClick={() => setMyRole("B")}
                className={`rounded-full px-4 py-1 font-mono text-xs transition-colors ${
                  myRole === "B" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Desk B (Guest)
              </button>
            </div>
          </div>
        </div>

        {/* Live Multi-User Status Banner */}
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  session.partyB ? "bg-success" : "bg-foreground"
                }`} />
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  session.partyB ? "bg-success" : "bg-primary"
                }`} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {session.status === "waiting_for_party_b" && "Awaiting Counterparty Connection..."}
                  {session.status === "both_connected" && "Counterparty Connected 🟢 (Drafting Positions)"}
                  {session.status === "sealed" && "Both Portfolios Cryptographically Sealed 🔒"}
                  {session.status === "cleared" && "Confidential Clearance Finalized ✨"}
                  {session.status === "escrow_locked" && "Bilateral Escrow Secured on Smart Contract 💰"}
                </h3>
                <p className="text-xs text-muted-foreground font-mono">
                  {session.partyB
                    ? `Desk A (${truncate(session.partyA.wallet)}) ⟷ Desk B (${truncate(session.partyB.wallet)})`
                    : "Share the link below with your trading counterparty to collaborate in real-time."}
                </p>
              </div>
            </div>

            {/* Invite Links */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-4 py-2 text-xs font-semibold text-foreground hover:border-foreground transition-colors duration-150"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedLink ? "Link Copied!" : "Copy Shareable Link"}</span>
              </button>

              {!session.partyB && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={handleJoinAsPartyB}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-foreground transition-colors duration-150"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Simulate Desk B Joining</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bilateral Trade Books */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Party A Column */}
          <div className="rounded-[24px] border border-border bg-card p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    <span>{session.partyA.label}</span>
                    {myRole === "A" && <span className="text-[10px] bg-secondary px-2 py-0.5 rounded text-foreground font-mono">(You)</span>}
                  </h3>
                  <span className="font-mono text-xs text-muted-foreground">{truncate(session.partyA.wallet, 8)}</span>
                </div>
                {myRole === "A" && !session.partyA.isSealed && (
                  <button
                    type="button"
                    onClick={() => setBuilderOpen(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-xs text-foreground hover:bg-secondary font-sans font-semibold"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Custom Leg</span>
                  </button>
                )}
              </div>

              {session.partyA.legs.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">No active legs in book.</div>
              ) : (
                <ul className="space-y-2">
                  {session.partyA.legs.map((leg, i) => (
                    <li key={i} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border text-xs">
                      <div>
                        <div className="font-bold text-foreground flex items-center gap-1.5">
                          <span>{leg.instrument}</span>
                          <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground uppercase font-mono">{leg.venue}</span>
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {leg.qty} @ ${leg.markUsd} &bull; haircut {(leg.haircut * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold ${leg.signedExposureUsd < 0 ? "text-red-400" : "text-success"}`}>
                          {leg.signedExposureUsd < 0 ? "-" : "+"}${Math.abs(leg.notionalUsd).toLocaleString()}
                        </span>
                        {myRole === "A" && !session.partyA.isSealed && (
                          <button type="button" onClick={() => handleDeleteLeg(i)} className="text-muted-foreground hover:text-red-400">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border pt-3 flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Siloed Margin Requirement:</span>
              <span className="font-mono font-bold text-foreground text-sm">${siloedIm(session.partyA.legs).toLocaleString()}</span>
            </div>
          </div>

          {/* Party B Column */}
          <div className="rounded-[24px] border border-border bg-card p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-400" />
                    <span>{session.partyB?.label || "Desk B (Awaiting Invite)"}</span>
                    {myRole === "B" && <span className="text-[10px] bg-secondary px-2 py-0.5 rounded text-foreground font-mono">(You)</span>}
                  </h3>
                  <span className="font-mono text-xs text-muted-foreground">{session.partyB ? truncate(session.partyB.wallet, 8) : "Not connected"}</span>
                </div>
                {myRole === "B" && !session.partyB?.isSealed && (
                  <button
                    type="button"
                    onClick={() => setBuilderOpen(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-xs text-foreground hover:bg-secondary font-sans font-semibold"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Custom Leg</span>
                  </button>
                )}
              </div>

              {!session.partyB ? (
                <div className="py-10 text-center space-y-3">
                  <p className="text-xs text-muted-foreground">Desk B has not joined this room yet.</p>
                  <button
                    type="button"
                    onClick={handleJoinAsPartyB}
                    className="rounded-full border border-border bg-secondary px-4 py-1.5 text-xs text-foreground hover:border-foreground"
                  >
                    Join as Desk B
                  </button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {session.partyB.legs.map((leg, i) => (
                    <li key={i} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border text-xs">
                      <div>
                        <div className="font-bold text-foreground flex items-center gap-1.5">
                          <span>{leg.instrument}</span>
                          <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground uppercase font-mono">{leg.venue}</span>
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {leg.qty} @ ${leg.markUsd} &bull; haircut {(leg.haircut * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold ${leg.signedExposureUsd < 0 ? "text-red-400" : "text-success"}`}>
                          {leg.signedExposureUsd < 0 ? "-" : "+"}${Math.abs(leg.notionalUsd).toLocaleString()}
                        </span>
                        {myRole === "B" && session.partyB && !session.partyB.isSealed && (
                          <button type="button" onClick={() => handleDeleteLeg(i)} className="text-muted-foreground hover:text-red-400">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border pt-3 flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Siloed Margin Requirement:</span>
              <span className="font-mono font-bold text-foreground text-sm">
                ${session.partyB ? siloedIm(session.partyB.legs).toLocaleString() : "0"}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls: Seal & Clear */}
        <div className="rounded-2xl border border-border bg-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-foreground">Bilateral Cryptographic Actions</h4>
            <p className="text-xs text-muted-foreground">
              Both parties must sign and seal their position books before confidential clearance can run.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {myParty && !myParty.isSealed && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleSealBook}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-6 py-3 text-xs font-bold text-foreground hover:bg-secondary"
              >
                <Lock className="h-4 w-4" />
                <span>Sign &amp; Seal My Portfolio (Desk {myRole})</span>
              </button>
            )}

            {myParty?.isSealed && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-4 py-2 text-xs font-mono text-success">
                <Check className="h-3.5 w-3.5" />
                <span>Desk {myRole} Sealed</span>
              </span>
            )}

            {session.status === "sealed" && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleExecuteClear}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-bold text-primary-foreground transition-colors duration-150"
              >
                <Sparkles className="h-4 w-4" />
                <span>Execute Confidential Netting</span>
              </button>
            )}
          </div>
        </div>

        {/* Cleared Results & Bilateral Escrow */}
        {session.result && session.siloedCombinedUsd && (
          <div className="space-y-6">
            <MarginHero
              result={session.result}
              siloedCombined={session.siloedCombinedUsd}
              onReset={() => {}}
            />

            <EscrowVaultCard
              siloedMarginA={myIm}
              siloedMarginB={otherIm}
              netMargin={session.result.nettedCombinedUsd}
              savingsUsd={session.result.savingsUsd}
              backend={session.backend}
            />
          </div>
        )}

        {/* Position Builder Modal */}
        {builderOpen && (
          <PositionBuilderModal
            party={myRole}
            partyName={`Desk ${myRole}`}
            isOpen={true}
            onClose={() => setBuilderOpen(false)}
            onAddLeg={handleAddCustomLeg}
          />
        )}
      </div>
    </PageShell>
  );
}
