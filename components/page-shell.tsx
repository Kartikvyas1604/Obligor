import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ChainInitializer } from "@/lib/chain-context";

export function PageShell({
  children,
  chain,
}: {
  children: ReactNode;
  /** Seeds the global chain switcher (e.g. the /monad page). */
  chain?: "solana" | "monad";
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {chain && <ChainInitializer chain={chain} />}
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 md:px-6 md:py-14 lg:px-8">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
