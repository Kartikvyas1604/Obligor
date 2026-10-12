"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Chain = "solana" | "monad";

interface ChainContextValue {
  chain: Chain;
  setChain: (chain: Chain) => void;
}

const STORAGE_KEY = "obligor-chain";

const ChainContext = createContext<ChainContextValue>({
  chain: "solana",
  setChain: () => {},
});

export function useChain(): ChainContextValue {
  return useContext(ChainContext);
}

/**
 * Persists the selected chain across the app (localStorage). The default is
 * Solana; a page-provided chain (e.g. /monad) becomes the initial value.
 */
export function ChainProvider({
  children,
  initialChain = "solana",
}: {
  children: ReactNode;
  initialChain?: Chain;
}) {
  const [chain, setChainState] = useState<Chain>(initialChain);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === "solana" || saved === "monad") setChainState(saved);
      } catch {
        // ignore unavailable storage
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const setChain = useCallback((next: Chain) => {
    setChainState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore unavailable storage
    }
  }, []);

  return <ChainContext.Provider value={{ chain, setChain }}>{children}</ChainContext.Provider>;
}

/** Lets a server page seed the global chain (e.g. PageShell chain="monad"). */
export function ChainInitializer({ chain }: { chain?: Chain }) {
  const { chain: current, setChain } = useChain();
  useEffect(() => {
    if (chain && chain !== current) setChain(chain);
  }, [chain, current, setChain]);
  return null;
}
