"use client";

import { useChain, type Chain } from "@/lib/chain-context";

const OPTIONS: Array<{ id: Chain; label: string }> = [
  { id: "solana", label: "Solana" },
  { id: "monad", label: "Monad" },
];

/** Persistent chain switcher pill. Sets the default clearing chain app-wide. */
export function ChainToggle({ className = "" }: { className?: string }) {
  const { chain, setChain } = useChain();

  return (
    <div
      role="group"
      aria-label="Clearing chain"
      className={`inline-flex rounded-full border border-border bg-secondary p-0.5 text-xs ${className}`}
    >
      {OPTIONS.map((opt) => {
        const active = chain === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => setChain(opt.id)}
            aria-pressed={active}
            className={`rounded-full px-3 py-1 font-mono font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
