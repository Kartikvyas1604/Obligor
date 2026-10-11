"use client";

import { useState } from "react";
import { LoaderCircle, ShieldCheck, ShieldX } from "lucide-react";

type Leg = {
  venue: string;
  instrument: string;
  bucket: string;
  side: "long" | "short" | "lend" | "borrow";
  qty: number;
  markUsd: number;
};

interface VerifyResultChipProps {
  computationId: string | null;
  commitmentHash: string | null;
  /** Whether the server registered a commitment for this computation. */
  registered: boolean;
  /** This desk's OWN legs (Party A) — the only input the verify never needs to
   *  look at the counterparty's side to check. */
  partyLegs: Array<PositionLegLike>;
  onResult?: (verified: boolean) => void;
}

type PositionLegLike = Leg & { party?: string };

type VerifyState =
  | { status: "idle" | "verifying" }
  | { status: "verified"; recomputedHash: string }
  | { status: "rejected"; message: string }
  | { status: "error"; message: string };

function serializeOwnLegs(legs: Array<PositionLegLike>) {
  return legs.map((l) => ({
    venue: l.venue,
    instrument: l.instrument,
    bucket: l.bucket,
    side: l.side,
    qty: l.qty,
    markUsd: l.markUsd,
  }));
}

/**
 * Verifiable-output chip (J2). Sends Party A's own legs plus the
 * computationId/commitmentHash back to /net-margin/verify, which re-derives
 * this desk's leg hash and proves the computation was committed with exactly
 * these inputs. The counterparty's book is never requested or returned.
 */
export function VerifyResultChip({
  computationId,
  commitmentHash,
  registered,
  partyLegs,
  onResult,
}: VerifyResultChipProps) {
  const [state, setState] = useState<VerifyState>({ status: "idle" });

  const canVerify =
    registered && Boolean(computationId) && Boolean(commitmentHash) && partyLegs.length > 0;

  async function handleVerify() {
    if (!canVerify) return;
    setState({ status: "verifying" });
    try {
      const res = await fetch("/api/v1/net-margin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          computationId,
          commitmentHash,
          party: "A",
          legs: serializeOwnLegs(partyLegs),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { verified?: boolean; recomputedHash?: string; message?: string }
        | null;
      if (res.ok && body?.verified) {
        setState({ status: "verified", recomputedHash: body.recomputedHash ?? "" });
        onResult?.(true);
      } else if (res.ok && body) {
        setState({
          status: "rejected",
          message: body.message ?? "Hash mismatch — your legs differ from the committed output.",
        });
        onResult?.(false);
      } else {
        setState({ status: "error", message: body?.message ?? `Verify returned ${res.status}` });
      }
    } catch {
      setState({ status: "error", message: "Network error contacting the verify endpoint." });
    }
  }

  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

  if (state.status === "verified") {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-success" role="status" aria-live="polite">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        Verified — your legs hash to the committed output{" "}
        <span className="font-mono text-muted-foreground">sha256:{state.recomputedHash}</span>
      </p>
    );
  }

  if (state.status === "rejected" || state.status === "error") {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-destructive" role="alert" aria-live="assertive">
        <ShieldX className="h-3.5 w-3.5" aria-hidden />
        {state.message}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={handleVerify}
      disabled={!canVerify || state.status === "verifying"}
      className={`${base} border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30 ${
        !canVerify ? "cursor-not-allowed" : "cursor-pointer"
      }`}
      title={
        canVerify
          ? "Re-submit your own legs and prove they match the committed computation"
          : "The server did not register a commitment for this run (e.g. it was computed only in-browser)"
      }
    >
      {state.status === "verifying" ? (
        <>
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Verifying…
        </>
      ) : (
        <>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Verify this computation
        </>
      )}
    </button>
  );
}