"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Users, ShieldAlert, Check, Copy, Plus, Trash2, Lock } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { MarginHero } from "@/components/margin-hero";
import { PositionBuilderModal } from "@/components/position-builder-modal";
import { EscrowVaultCard } from "@/components/escrow-vault-card";
import { ExposureBars } from "@/components/charts";
import { type DealSession } from "@/lib/deal-session";
import { type PositionLeg, type PartyId, usd, siloedIm } from "@/lib/margin";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function makeDemoWalletB(): string {
  const bytes = new Uint8Array(44);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => B58[b % B58.length]).join("");
}

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
  const [builderOpen, setBuilderOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [sealError, setSealError] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);

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
          // Simulated guest gets a runtime-generated demo wallet; its book
          // starts EMPTY — the host builds positions for it after joining.
          walletB: makeDemoWalletB(),
          labelB: "Desk B (Counterparty)",
          legsB: [],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
        setMyRole("B");
      } else {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setJoinError(body?.message ?? `Could not join (${res.status})`);
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
    setSealError(null);
    try {
      // Faithful demo seal: derives a fresh digest of the leg book (never a
      // fabricated transaction). The real seal comes from wallet signature.
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(myParty?.legs ?? [])),
      );
      const signature = "sig_" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
      const res = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seal", partyId: myRole, signature }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setSealError(body?.message ?? `Sealing failed (${res.status})`);
      }
    } catch {
      setSealError("Network error while sealing your book");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleExecuteClear() {
    setActionBusy(true);
    setClearError(null);
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setClearError(body?.message ?? `Clearing failed (${res.status})`);
      }
    } catch {
      setClearError("Network error while running the confidential netting");
    } finally {
      setActionBusy(false);
    }
  }

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  if (loading) {
    return (
      <PageShell>
        <div className="py-24 text-center space-y-3">
          <div className="animate-spin inline-block h-8 w-8 border-2 border-foreground border-t-transparent rounded-full motion-reduce:animate-none" />
          <p className="text-sm font-mono text-muted-foreground">Creating your deal room…</p>
        </div>
      </PageShell>
    );
  }

  if (!session) {
    return (
      <PageShell>
        <div className="py-24 text-center space-y-4">
        <h2 className="text-2xl font-bold text-foreground">This deal room is gone</h2>
        <p className="text-sm text-muted-foreground">It may have expired, or the link doesn&rsquo;t exist. Start a fresh one below.</p>
        <Link
          href="/deal"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Create a new deal room
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
              <Users className="h-3.5 w-3.5" aria-hidden />
              <span>Private deal room</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">
              <span>Clear together</span>
              <span className="font-mono text-sm sm:text-base text-foreground bg-secondary px-3 py-1 rounded-lg border border-border">
                {truncate(session.sessionId, 8)}
              </span>
            </h1>
          </div>

          {/* Role Indicator & Test Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">Viewing as:</span>
            <div className="inline-flex rounded-full border border-border bg-card p-0.5">
              {(["A", "B"] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setMyRole(role)}
                  aria-pressed={myRole === role}
                  className={`rounded-full px-4 py-1 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    myRole === role ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Desk {role} ({role === "A" ? "host" : "guest"})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live Multi-User Status Banner */}
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 motion-reduce:animate-none ${
                  session.partyB ? "bg-success" : "bg-foreground"
                }`} />
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  session.partyB ? "bg-success" : "bg-primary"
                }`} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {session.status === "waiting_for_party_b" && "Invite sent — waiting for the other desk to join"}
                  {session.status === "both_connected" && "Both desks connected — drafting positions"}
                  {session.status === "sealed" && "Both books sealed — ready to net"}
                  {session.status === "cleared" && "Netting complete — see your result below"}
                  {session.status === "escrow_locked" && "Escrow secured — settle to claim savings"}
                </h3>
                <p className="text-xs text-muted-foreground font-mono">
                  {session.partyB
                    ? `Desk A (${truncate(session.partyA.wallet)}) ⟷ Desk B (${truncate(session.partyB.wallet)})`
                    : "Share the link below with your counterparty — it syncs live."}
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
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-4 py-2 text-xs font-semibold text-foreground hover:border-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                <span>{copiedLink ? "Link copied" : "Copy invite link"}</span>
              </button>

              {!session.partyB && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={handleJoinAsPartyB}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  <span>Simulate Desk B joining</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bilateral Trade Books */}
        <div className="grid gap-6 lg:grid-cols-2">
          {(
            [
              { role: "A" as const, party: session.partyA, exists: true, dot: "bg-success" },
              { role: "B" as const, party: session.partyB ?? undefined, exists: !!session.partyB, dot: "bg-blue-400" },
            ] satisfies Array<{ role: PartyId; party?: DealSession["partyA"]; exists: boolean; dot: string }>
          ).map(({ role, party, exists, dot }) => {
            const isMe = myRole === role;
            const canEdit = isMe && !!party && !party.isSealed;
            const legs = party?.legs ?? [];
            return (
              <div key={role} className="rounded-[24px] border border-border bg-card p-6 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
                        <span>{party?.label || `Desk ${role}`}</span>
                        {isMe && <span className="text-[10px] bg-secondary px-2 py-0.5 rounded text-foreground font-mono">(you)</span>}
                      </h3>
                      <span className="font-mono text-xs text-muted-foreground">
                        {party ? truncate(party.wallet, 8) : "Not connected"}
                      </span>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setBuilderOpen(true)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Plus className="h-3 w-3" aria-hidden />
                        <span>Add position</span>
                      </button>
                    )}
                  </div>

                  {!exists ? (
                    <div className="py-10 text-center space-y-3">
                      <p className="text-xs text-muted-foreground">Desk {role} has not joined yet.</p>
                      <button
                        type="button"
                        onClick={handleJoinAsPartyB}
                        className="rounded-full border border-border bg-secondary px-4 py-1.5 text-xs text-foreground hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Join as Desk {role}
                      </button>
                    </div>
                  ) : legs.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      {isMe ? "Add your first position to get started." : "This desk has no positions."}
                    </div>
                  ) : (
                    <div>
                      <ExposureBars legs={legs} />
                      <ul className="border-t border-border">
                        {legs.map((leg, i) => (
                          <li key={i} className="flex items-center justify-between gap-3 border-b border-border last:border-0 px-1 py-3 text-xs">
                            <div className="min-w-0">
                              <div className="font-bold text-foreground flex items-center gap-1.5">
                                <span>{leg.instrument}</span>
                                <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground uppercase font-mono">{leg.venue}</span>
                              </div>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {leg.qty} @ ${leg.markUsd} · haircut {(leg.haircut * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`font-mono font-bold ${leg.signedExposureUsd < 0 ? "text-destructive" : "text-success"}`}>
                                {leg.signedExposureUsd < 0 ? "−" : "+"}${Math.abs(leg.notionalUsd).toLocaleString()}
                              </span>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLeg(i)}
                                  aria-label={`Remove ${leg.instrument} position`}
                                  className="p-1 rounded text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {party && (
                  <div className="border-t border-border pt-3 flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Margin held alone (siloed):</span>
                    <span className="font-mono font-bold text-foreground text-sm">{usd(siloedIm(party.legs))}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {(joinError || sealError || clearError) && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div className="text-sm space-y-2">
              <p className="font-semibold text-destructive">Room action failed</p>
              <p className="text-muted-foreground">{joinError ?? sealError ?? clearError ?? ""}</p>
              {clearError && (
                <button type="button" onClick={() => void handleExecuteClear()} className="text-xs font-semibold text foreground underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Retry confidential netting
                </button>
              )}
            </div>
          </div>
        )}

        {/* Action Controls: Seal & Clear */}
        <div className="rounded-2xl border border-border bg-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-foreground">Three quick steps</h4>
            <p className="text-xs text-muted-foreground">
              1. Set your positions · 2. Both desks seal · 3. Net and see your savings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {myParty && !myParty.isSealed && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleSealBook}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-6 py-3 text-xs font-bold text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Lock className="h-4 w-4" aria-hidden />
                <span>Seal my book (Desk {myRole})</span>
              </button>
            )}

            {myParty?.isSealed && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-4 py-2 text-xs font-mono text-success">
                <Check className="h-3.5 w-3.5" aria-hidden />
                <span>Desk {myRole} sealed</span>
              </span>
            )}

            {session.status === "sealed" && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleExecuteClear}
                className="btn-press inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-bold text-primary-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
              >
                <Lock className="h-4 w-4" aria-hidden />
                <span>Run confidential netting</span>
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
              computationId={session.result.computationId}
              walletA={session.partyA.wallet}
              walletB={session.partyB?.wallet ?? null}
              sessionId={session.sessionId}
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
