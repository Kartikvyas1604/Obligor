"use client";

import { useEffect, useState } from "react";
import { LogOut, Wallet } from "lucide-react";

export type ConnectChain = "solana" | "monad";

interface SolanaProvider {
  publicKey?: { toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<void | { publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

interface EvmProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

function getSolanaProvider(): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  const ext = window as unknown as {
    phantom?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
    solana?: SolanaProvider;
  };
  return ext.phantom?.solana ?? ext.solflare ?? ext.solana ?? null;
}

function getEvmProvider(): EvmProvider | null {
  if (typeof window === "undefined") return null;
  const ext = window as unknown as { ethereum?: EvmProvider };
  return ext.ethereum ?? null;
}

function short(address: string) {
  if (address.startsWith("0x")) return `${address.slice(0, 6)}…${address.slice(-4)}`;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletConnect({
  variant = "header",
  label = "Connect wallet",
  chain = "solana",
  onConnect,
  onDisconnect,
}: {
  variant?: "header" | "block";
  label?: string;
  /** Which chain family to connect: Solana (Phantom/Solflare) or Monad (EVM). */
  chain?: ConnectChain;
  onConnect?: (address: string, chain: ConnectChain) => void;
  onDisconnect?: () => void;
}) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    let active = true;
    if (chain === "monad") {
      const provider = getEvmProvider();
      if (!provider) return;
      // Silently show an already-authorised account.
      provider
        .request({ method: "eth_accounts" })
        .then((accounts) => {
          const acct = (accounts as string[])?.[0];
          if (active && acct) {
            setAddress(acct);
            onConnect?.(acct, "monad");
          }
        })
        .catch(() => {});
      const onAccountsChanged = (...args: unknown[]) => {
        const acct = (args[0] as string[])?.[0];
        if (!active) return;
        setAddress(acct ?? null);
        if (acct) onConnect?.(acct, "monad");
        else onDisconnect?.();
      };
      provider.on?.("accountsChanged", onAccountsChanged);
      return () => {
        active = false;
        provider.removeListener?.("accountsChanged", onAccountsChanged);
      };
    }

    const p = getSolanaProvider();
    if (!p) return;
    const onAccountChanged = (...args: unknown[]) => {
      if (!active) return;
      const pk = (args[0] as { toString(): string } | null)?.toString() ?? null;
      setAddress(pk);
      if (pk) onConnect?.(pk, "solana");
      else onDisconnect?.();
    };
    p.connect({ onlyIfTrusted: true })
      .then((res) => {
        const pk = res?.publicKey?.toString() ?? p.publicKey?.toString() ?? null;
        if (active && pk) {
          setAddress(pk);
          onConnect?.(pk, "solana");
        }
      })
      .catch(() => {});
    p.on?.("accountChanged", onAccountChanged);
    return () => {
      active = false;
      p.removeListener?.("accountChanged", onAccountChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain]);

  async function handleConnect() {
    setConnecting(true);
    try {
      if (chain === "monad") {
        const provider = getEvmProvider();
        if (!provider) {
          window.open("https://metamask.io/download/", "_blank", "noopener,noreferrer");
          return;
        }
        const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
        const acct = accounts?.[0] ?? null;
        if (acct) {
          setAddress(acct);
          onConnect?.(acct, "monad");
        }
        return;
      }
      const provider = getSolanaProvider();
      if (!provider) {
        window.open("https://phantom.app/", "_blank", "noopener,noreferrer");
        return;
      }
      const res = await provider.connect();
      const pk = res?.publicKey?.toString() ?? provider.publicKey?.toString() ?? null;
      if (pk) {
        setAddress(pk);
        onConnect?.(pk, "solana");
      }
    } catch {
      /* user rejected — return to idle quietly */
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (chain === "monad") {
      // EIP-1193 has no programmatic disconnect; drop local state only.
      setAddress(null);
      onDisconnect?.();
      return;
    }
    try {
      await getSolanaProvider()?.disconnect();
    } catch {
      /* ignore */
    }
    setAddress(null);
    onDisconnect?.();
  }

  if (address) {
    const connected = (
      <>
        <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
        <span className="font-mono text-xs tabular-nums" title={address}>
          {short(address)}
        </span>
        <button
          type="button"
          onClick={handleDisconnect}
          className="relative inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors duration-100 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:-inset-2"
          aria-label="Disconnect wallet"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
        </button>
      </>
    );

    return variant === "header" ? (
      <span className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3">
        {connected}
      </span>
    ) : (
      <span className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4">
        {connected}
      </span>
    );
  }

  if (variant === "header") {
    return (
      <button
        type="button"
        onClick={handleConnect}
        disabled={connecting}
        aria-busy={connecting}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-2.5 text-sm transition-colors duration-100 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none sm:px-4"
      >
        <Wallet className="h-4 w-4" aria-hidden />
        <span className={connecting ? "" : "hidden sm:inline"}>
          {connecting ? "Connecting…" : "Connect"}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleConnect}
      disabled={connecting}
      aria-busy={connecting}
      className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm transition-colors duration-100 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none"
    >
      <Wallet className="h-4 w-4" aria-hidden />
      {connecting ? "Connecting…" : label}
    </button>
  );
}
