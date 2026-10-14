"use client";

/**
 * Browser-side wallet signing for deal seals.
 *
 * - Solana: Phantom / Solflare / injected `solana` provide `signMessage`, which
 *   returns an ed25519 signature over the raw message bytes.
 * - Monad / EVM: an injected EIP-1193 provider (`window.ethereum`) signs via
 *   `personal_sign` (EIP-191).
 *
 * This module never fabricates a signature: if no wallet is present or the
 * user rejects, it throws and the caller surfaces the failure.
 */

import { base58Encode } from "./base58";

export type WalletChain = "solana" | "monad";

interface SolanaSignProvider {
  publicKey?: { toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey?: { toString(): string } } | void>;
  signMessage?(message: Uint8Array): Promise<{ signature: Uint8Array }>;
}

interface EvmProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export class WalletSignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletSignError";
  }
}

function solanaProvider(): SolanaSignProvider | null {
  if (typeof window === "undefined") return null;
  const ext = window as unknown as {
    phantom?: { solana?: SolanaSignProvider };
    solflare?: SolanaSignProvider;
    solana?: SolanaSignProvider;
  };
  return ext.phantom?.solana ?? ext.solflare ?? ext.solana ?? null;
}

function evmProvider(): EvmProvider | null {
  if (typeof window === "undefined") return null;
  const ext = window as unknown as { ethereum?: EvmProvider };
  return ext.ethereum ?? null;
}

function utf8(message: string): Uint8Array {
  return new TextEncoder().encode(message);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isWalletAvailable(chain: WalletChain): boolean {
  if (chain === "monad") return evmProvider() !== null;
  const p = solanaProvider();
  return p !== null && typeof p.signMessage === "function";
}

/** Current address for the requested chain, prompting connection if needed. */
export async function getConnectedAddress(chain: WalletChain): Promise<string | null> {
  if (chain === "monad") {
    const provider = evmProvider();
    if (!provider) return null;
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    return accounts?.[0] ?? null;
  }
  const provider = solanaProvider();
  if (!provider) return null;
  const res = await provider.connect();
  return res?.publicKey?.toString() ?? provider.publicKey?.toString() ?? null;
}

/**
 * Sign the canonical seal message with the connected wallet and return the
 * signature in the transport format the server verifies (base58 for Solana,
 * 0x-hex for EVM).
 */
export async function signSealMessage(chain: WalletChain, message: string): Promise<string> {
  if (chain === "monad") {
    const provider = evmProvider();
    if (!provider) throw new WalletSignError("No EVM wallet detected — connect MetaMask to seal on Monad");
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    const from = accounts?.[0];
    if (!from) throw new WalletSignError("EVM wallet returned no account");
    const hexMessage = "0x" + bytesToHex(utf8(message));
    const signature = (await provider.request({
      method: "personal_sign",
      params: [hexMessage, from],
    })) as string;
    if (typeof signature !== "string" || !signature.startsWith("0x")) {
      throw new WalletSignError("EVM wallet returned an unexpected signature");
    }
    return signature;
  }

  const provider = solanaProvider();
  if (!provider) throw new WalletSignError("No Solana wallet detected — connect Phantom or Solflare to seal");
  if (typeof provider.signMessage !== "function") {
    throw new WalletSignError("This Solana wallet does not support message signing");
  }
  const { signature } = await provider.signMessage(utf8(message));
  if (!(signature instanceof Uint8Array)) {
    throw new WalletSignError("Solana wallet returned an unexpected signature");
  }
  return base58Encode(signature);
}
