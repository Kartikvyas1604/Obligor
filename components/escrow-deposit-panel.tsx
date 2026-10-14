"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Link2, Lock, ShieldCheck } from "lucide-react";
import { usd as usdFmt } from "@/lib/margin";
import {
  buildInitializeEscrowTx,
  deserializeEscrowTx,
  makeConnection,
  serializeEscrowTx,
} from "@/lib/escrow-client";

interface EscrowConfig {
  programId: string;
  rpcUrl: string;
  commitment: "processed" | "confirmed" | "finalized";
  baseDecimals: number;
  clearingAuthority: string | null;
  collateralMint: string | null;
  depositEnabled: boolean;
  note: string;
}

interface SolanaSigner {
  publicKey?: { toString(): string } | null;
  signTransaction<T>(tx: T): Promise<T>;
  signAndSendTransaction?(tx: unknown): Promise<{ signature: string | Uint8Array }>;
}

function getSigner(): SolanaSigner | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    phantom?: { solana?: SolanaSigner };
    solflare?: SolanaSigner;
    solana?: SolanaSigner;
  };
  return w.phantom?.solana ?? w.solflare ?? w.solana ?? null;
}

function explorerUrl(rpcUrl: string, signature: string): string {
  if (/127\.0\.0\.1|localhost/.test(rpcUrl)) {
    return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;
  }
  return `https://explorer.solana.com/tx/${signature}`;
}

/** USD → mint base units at the collateral's decimals. */
function toBaseUnits(usd: number, decimals: number): bigint {
  return BigInt(Math.round(usd * 10 ** decimals));
}

/**
 * Real, client-signed escrow deposit. `initialize_escrow` is bilateral, so both
 * desks must sign the same transaction: Party A builds and partially signs,
 * Party B co-signs and submits. Obligor never touches a desk key, and no
 * transaction signature is shown unless the RPC actually confirms one.
 */
export function EscrowDepositPanel({
  walletA,
  walletB,
  amountAUsd,
  amountBUsd,
}: {
  walletA?: string | null;
  walletB?: string | null;
  amountAUsd: number;
  amountBUsd: number;
}) {
  const [config, setConfig] = useState<EscrowConfig | null>(null);
  const [role, setRole] = useState<"A" | "B">("A");
  const [partyB, setPartyB] = useState(walletB ?? "");
  const [blob, setBlob] = useState("");
  const [pastedBlob, setPastedBlob] = useState("");
  const [escrowPda, setEscrowPda] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [verified, setVerified] = useState<{ status: string; totalLockedUsd: number; partyA: string; partyB: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/escrow/config")
      .then((r) => r.json())
      .then((d: EscrowConfig) => {
        if (alive) setConfig(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const connected = getSigner()?.publicKey?.toString() ?? null;

  const verify = useCallback(async (escrowAccount: string) => {
    try {
      const res = await fetch("/api/v1/escrow/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escrowAccount }),
      });
      const data = await res.json();
      if (res.ok && data?.escrow) {
        setVerified({
          status: data.escrow.status,
          totalLockedUsd: data.escrow.totalLockedUsd,
          partyA: data.escrow.partyA,
          partyB: data.escrow.partyB,
        });
      }
    } catch {
      // Verification is best-effort; the on-chain signature is the proof.
    }
  }, []);

  async function createDeposit() {
    setError(null);
    setSignature(null);
    setVerified(null);
    const signer = getSigner();
    if (!config || !signer?.publicKey) {
      setError("Connect Party A's wallet first.");
      return;
    }
    if (!partyB.trim()) {
      setError("Enter Party B's wallet address.");
      return;
    }
    if (amountAUsd <= 0 && amountBUsd <= 0) {
      setError("At least one desk must deposit a non-zero amount.");
      return;
    }
    setBusy(true);
    try {
      const feePayer = signer.publicKey.toString();
      const { transaction, escrowPda: pda } = buildInitializeEscrowTx(
        {
          partyA: feePayer,
          partyB: partyB.trim(),
          mint: config.collateralMint!,
          clearingAuthority: config.clearingAuthority!,
          partyAAmountBaseUnits: toBaseUnits(amountAUsd, config.baseDecimals),
          partyBAmountBaseUnits: toBaseUnits(amountBUsd, config.baseDecimals),
        },
        feePayer,
      );
      const connection = makeConnection(config.rpcUrl);
      const { blockhash } = await connection.getLatestBlockhash(config.commitment);
      transaction.recentBlockhash = blockhash;
      const signedByA = await signer.signTransaction(transaction);
      setBlob(serializeEscrowTx(signedByA));
      setEscrowPda(pda.toBase58());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the deposit transaction");
    } finally {
      setBusy(false);
    }
  }

  async function cosignAndSend() {
    setError(null);
    setSignature(null);
    const signer = getSigner();
    if (!config || !signer?.publicKey) {
      setError("Connect Party B's wallet first.");
      return;
    }
    if (!pastedBlob.trim()) {
      setError("Paste the partially-signed transaction from Party A.");
      return;
    }
    setBusy(true);
    try {
      const tx = deserializeEscrowTx(pastedBlob.trim());
      const signed = await signer.signTransaction(tx);
      const connection = makeConnection(config.rpcUrl);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: config.commitment,
      });
      await connection.confirmTransaction(sig, config.commitment);
      setSignature(sig);
      const pda = escrowPda ?? tx.instructions[0]?.keys[0]?.pubkey.toBase58() ?? null;
      if (pda) await verify(pda);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Co-sign / send failed");
    } finally {
      setBusy(false);
    }
  }

  if (!config) {
    return (
      <div className="rounded-xl border border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
        Loading on-chain deposit configuration…
      </div>
    );
  }

  if (!config.depositEnabled) {
    return (
      <div className="rounded-xl border border-border bg-secondary/40 p-4 text-xs text-muted-foreground space-y-1">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden />
          On-chain deposit not configured
        </p>
        <p>{config.note}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Lock className="h-4 w-4" aria-hidden />
            Real on-chain escrow deposit
          </p>
          <p className="text-[11px] text-muted-foreground">
            Locks collateral into the program-owned vault via the deployed obligor-escrow program.
            Both desks sign; Obligor never holds a key.
          </p>
        </div>
        <div className="inline-flex rounded-full border border-border overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setRole("A")}
            className={`px-3 py-1.5 font-mono ${role === "A" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            Party A
          </button>
          <button
            type="button"
            onClick={() => setRole("B")}
            className={`px-3 py-1.5 font-mono ${role === "B" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            Party B
          </button>
        </div>
      </div>

      <div className="text-[11px] font-mono text-muted-foreground grid gap-1">
        <span>program: {config.programId}</span>
        <span>mint: {config.collateralMint}</span>
        <span>clearing authority: {config.clearingAuthority}</span>
        {walletA ? <span>run party A: {walletA}</span> : null}
        {connected ? <span>connected: {connected}</span> : <span>connected: — (connect a wallet)</span>}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
          <span className="text-muted-foreground">{error}</span>
        </div>
      )}

      {role === "A" ? (
        <div className="space-y-3">
          <label className="block text-xs">
            <span className="text-muted-foreground">Party B wallet</span>
            <input
              value={partyB}
              onChange={(e) => setPartyB(e.target.value)}
              placeholder={walletB ?? "counterparty wallet"}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <p className="text-[11px] text-muted-foreground">
            Deposit: A {usdFmt(amountAUsd)} · B {usdFmt(amountBUsd)} (from the verified run)
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={createDeposit}
            className="w-full rounded-full bg-primary py-3 px-6 text-sm font-semibold text-primary-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {busy ? "Building & signing…" : "Build deposit & sign as Party A"}
          </button>
          {blob && (
            <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
              <p className="text-xs font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
                Party A signed. Send this to Party B to co-sign &amp; submit:
              </p>
              {escrowPda && (
                <p className="text-[11px] font-mono text-muted-foreground break-all">escrow PDA: {escrowPda}</p>
              )}
              <textarea
                readOnly
                value={blob}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground break-all"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(blob)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-foreground"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden /> Copy transaction
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-xs">
            <span className="text-muted-foreground">Partially-signed transaction (base64 from Party A)</span>
            <textarea
              value={pastedBlob}
              onChange={(e) => setPastedBlob(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1 font-mono text-[10px] text-foreground break-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={cosignAndSend}
            className="w-full rounded-full bg-success py-3 px-6 text-sm font-bold text-primary-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {busy ? "Signing & sending…" : "Co-sign as Party B & submit"}
          </button>
        </div>
      )}

      {signature && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs space-y-1">
          <p className="flex items-center gap-2 font-bold text-success">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Deposited on-chain
          </p>
          <a
            href={explorerUrl(config.rpcUrl, signature)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-foreground hover:underline break-all"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            {signature}
          </a>
          {verified && (
            <p className="text-muted-foreground">
              Verified on RPC: {verified.status} · locked {usdFmt(verified.totalLockedUsd)} · {verified.partyA.slice(0, 4)}…/{verified.partyB.slice(0, 4)}…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
