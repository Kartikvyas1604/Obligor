import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";

export function SiteFooter() {
  return (
    <footer className="border-t border-[#1F1F1F] bg-[#000000] py-12 text-[#94A3B8]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Link
            href="/"
            className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C59A3F]"
          >
            <LogoMark width={36} height={24} className="transition-transform duration-200 group-hover:scale-105" />
            <span className="text-xl font-semibold tracking-wide bg-gradient-to-br from-[#E8C874] via-[#C59A3F] to-[#A67C27] text-transparent bg-clip-text font-['Plus_Jakarta_Sans',sans-serif]">
              Obligor
            </span>
          </Link>
          <p className="font-['JetBrains_Mono',monospace] text-xs text-[#94A3B8]">
            Two-Party Clearing · MPC on Solana · Attested TEE on Monad · x402 Machine Payments
          </p>
        </div>

        <div className="mt-8 border-t border-[#141414] pt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs leading-relaxed text-[#94A3B8]">
          <p className="max-w-3xl">
            Obligor is confidential clearing and portfolio margin analytics. Mock equity (<code className="text-[#E8C874]">tAAPL</code>) is fixture-driven and adapter-ready for tokenized asset rails. Cryptographic MPC on Solana vs hardware-attested TEE on Monad delivers honest, labeled confidentiality — <strong className="text-white">TEE ≠ MPC</strong>. Analytics never custody funds.
          </p>
          <div className="flex gap-4 font-mono text-xs shrink-0">
            <Link href="/trust" className="hover:text-white transition-colors">
              Trust Matrix
            </Link>
            <Link href="/agents" className="hover:text-white transition-colors">
              x402 Protocol
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
