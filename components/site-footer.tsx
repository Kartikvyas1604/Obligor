import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-foreground transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <LogoMark width={28} height={18} />
            <span className="text-lg font-medium tracking-[-0.02em]">Obligor</span>
          </Link>
          <p className="font-mono text-xs text-muted-foreground">
            Two-party clearing · MPC-ready on Solana · TEE-ready on Monad · x402 machine payments
          </p>
        </div>

        <div className="mt-8 flex flex-col justify-between gap-4 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground md:flex-row md:items-center">
          <p className="max-w-3xl">
            Obligor is confidential two-party portfolio clearing and margin risk analytics. Tokenized equity (
            <code className="font-mono text-foreground">tAAPL</code>) is reference-priced via live Pyth Hermes oracle feeds
            and adapter-ready for on-chain asset rails. Analytics compute cross-party netting without custodying venue funds.
          </p>
          <div className="flex shrink-0 gap-4 font-mono text-xs">
            <Link
              href="/clear"
              className="transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Terminal
            </Link>
            <Link
              href="/deal"
              className="transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Deal rooms
            </Link>
            <Link
              href="/agents"
              className="transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              x402 protocol
            </Link>
            <Link
              href="/security"
              className="transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Security
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
