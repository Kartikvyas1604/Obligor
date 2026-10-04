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
    <div className="min-h-screen bg-[#000000] text-white flex flex-col font-['Plus_Jakarta_Sans',sans-serif] selection:bg-[#C59A3F]/30 selection:text-[#E8C874]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 md:px-6 md:py-14 lg:px-8">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
