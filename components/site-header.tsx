import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";
import { ArrowUpRight } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#1F1F1F] bg-[#000000]/90 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Far Left: Logo Mark + Gold Gradient Brand Name */}
        <Link
          href="/"
          className="flex items-center gap-3.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C59A3F]"
        >
          <LogoMark width={40} height={26} className="transition-transform duration-200 group-hover:scale-105" />
          <span className="text-2xl font-semibold tracking-wide bg-gradient-to-br from-[#E8C874] via-[#C59A3F] to-[#A67C27] text-transparent bg-clip-text font-['Plus_Jakarta_Sans',sans-serif]">
            Obligor
          </span>
        </Link>

        {/* Right Side: Simple Muted Text Links & Launch Button */}
        <nav className="flex items-center gap-6 md:gap-8">
          <div className="hidden md:flex items-center gap-6 lg:gap-8 text-sm">
            <Link
              href="/clear"
              className="text-[#94A3B8] transition-colors duration-150 hover:text-white font-medium"
            >
              Clearing
            </Link>
            <Link
              href="/deal"
              className="text-[#E8C874] font-semibold transition-colors duration-150 hover:text-white flex items-center gap-1"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>P2P Deal Rooms</span>
            </Link>
            <Link
              href="/monad"
              className="text-[#94A3B8] transition-colors duration-150 hover:text-white font-medium"
            >
              Monad Parallel
            </Link>
            <Link
              href="/agents"
              className="text-[#94A3B8] transition-colors duration-150 hover:text-white font-medium"
            >
              Agents (x402)
            </Link>
            <Link
              href="/trust"
              className="text-[#94A3B8] transition-colors duration-150 hover:text-white font-medium"
            >
              Trust &amp; Honesty
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/clear"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#E8C874] via-[#C59A3F] to-[#A67C27] px-5 py-2 text-xs font-semibold text-black transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] shadow-[0_4px_20px_rgba(197,154,63,0.15)]"
            >
              Launch App
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
