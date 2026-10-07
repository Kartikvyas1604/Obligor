import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export function PageShell({
  children,
}: {
  children: ReactNode;
  chain?: "solana" | "monad";
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 md:px-6 md:py-14 lg:px-8">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
