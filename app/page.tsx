import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  EyeOff,
  Zap,
  Lock,
  Cpu,
  Coins,
  CheckCircle2,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroMockup } from "@/components/hero-mockup";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col font-['Plus_Jakarta_Sans',sans-serif] selection:bg-[#C59A3F]/30 selection:text-[#E8C874]">
      <SiteHeader />

      <main className="flex-1">
        {/* ========================================================================= */}
        {/* HERO SECTION                                                               */}
        {/* ========================================================================= */}
        <section className="relative overflow-hidden border-b border-[#1F1F1F] pt-12 pb-24 md:pt-20 md:pb-32">
          {/* Subtle Golden Radial Glow in Background */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-40 h-[600px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(197,154,63,0.12),transparent_70%)]"
          />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
              {/* Hero Left Content */}
              <div className="lg:col-span-6 xl:col-span-6 space-y-8 text-left">
                {/* Live Protocol Status Pill */}
                <div className="inline-flex items-center gap-2.5 rounded-full border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-1.5 shadow-sm">
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E8C874] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#C59A3F]" />
                  </span>
                  <span className="font-['JetBrains_Mono',monospace] text-xs uppercase tracking-wider text-[#94A3B8]">
                    Confidential Two-Party Clearing
                  </span>
                </div>

                {/* H1 Headline */}
                <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl md:text-7xl leading-[1.05]">
                  Precision execution.{" "}
                  <span className="block bg-gradient-to-r from-[#E8C874] via-[#C59A3F] to-[#A67C27] bg-clip-text text-transparent">
                    Golden standard.
                  </span>
                </h1>

                {/* Subheadline */}
                <p className="max-w-xl text-lg font-normal leading-relaxed text-[#94A3B8] sm:text-xl">
                  Institutional-grade clearing and yield execution, enforced by code. Two desks,
                  one net initial margin — neither party sees the other&rsquo;s book.
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  {/* Primary CTA Button: Fully Pill-Shaped with Gold Glow */}
                  <Link
                    href="/clear"
                    className="group inline-flex h-14 items-center justify-center gap-3 rounded-full bg-gradient-to-r from-[#E8C874] via-[#C59A3F] to-[#A67C27] px-8 text-base font-semibold text-black transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-[0_4px_25px_rgba(197,154,63,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8C874]"
                  >
                    <span>Launch Clearing Demo</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </Link>

                  {/* Secondary CTA Button */}
                  <Link
                    href="/trust"
                    className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-[#1F1F1F] bg-[#0A0A0A] px-7 text-base font-medium text-white transition-all duration-200 hover:border-[#4A3D25] hover:bg-[#141414] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C59A3F]"
                  >
                    <span>Trust &amp; Honesty Matrix</span>
                  </Link>
                </div>

                {/* Micro Meta Features */}
                <div className="pt-2 flex flex-wrap items-center gap-6 text-xs font-['JetBrains_Mono',monospace] text-[#94A3B8]">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#C59A3F]" />
                    <span>Arcium MPC (Solana)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#C59A3F]" />
                    <span>Attested TEE (Monad)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#C59A3F]" />
                    <span>x402 V2 Settlement</span>
                  </div>
                </div>
              </div>

              {/* Hero Right Visual: Floating Institutional Mockup */}
              <div className="lg:col-span-6 xl:col-span-6">
                <HeroMockup />
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* CORE VALUE PILLARS                                                        */}
        {/* ========================================================================= */}
        <section className="border-b border-[#1F1F1F] bg-[#000000] py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl space-y-3">
              <span className="font-['JetBrains_Mono',monospace] text-xs uppercase tracking-widest text-[#C59A3F]">
                Institutional Architecture
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Engineered for mutually distrusting desks
              </h2>
              <p className="text-base leading-relaxed text-[#94A3B8]">
                Siloed protocols demand duplicate collateral. Centralized clearing exposes strategies.
                Obligor computes net portfolio obligations without revealing plaintext books.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {/* Pillar 1 */}
              <div className="group rounded-[24px] border border-[#1F1F1F] bg-[#0A0A0A] p-8 transition-all duration-300 hover:border-[#C59A3F]/40 hover:shadow-[0_10px_30px_rgba(197,154,63,0.06)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#1F1F1F] bg-[#141414] text-[#E8C874] transition-colors group-hover:border-[#C59A3F]/50 group-hover:bg-[#C59A3F]/10">
                  <EyeOff className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-xl font-bold text-white">Sealed Input Confidentiality</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#94A3B8]">
                  Both trading desks submit encrypted positions. The computation outputs a single scalar:
                  combined net initial margin. Neither counterparty nor operator ever sees individual legs.
                </p>
                <div className="mt-6 inline-flex items-center gap-1.5 font-['JetBrains_Mono',monospace] text-xs text-[#C59A3F]">
                  <span>Cryptographic MPC on Solana</span>
                </div>
              </div>

              {/* Pillar 2 */}
              <div className="group rounded-[24px] border border-[#1F1F1F] bg-[#0A0A0A] p-8 transition-all duration-300 hover:border-[#C59A3F]/40 hover:shadow-[0_10px_30px_rgba(197,154,63,0.06)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#1F1F1F] bg-[#141414] text-[#E8C874] transition-colors group-hover:border-[#C59A3F]/50 group-hover:bg-[#C59A3F]/10">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-xl font-bold text-white">Pluggable Trust Transports</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#94A3B8]">
                  Arcium MPC on Solana for multi-party cryptographic privacy; AWS Nitro Enclaves on
                  Monad for high-throughput hardware-attested clearing. Pure honesty: TEE &ne; MPC.
                </p>
                <div className="mt-6 inline-flex items-center gap-1.5 font-['JetBrains_Mono',monospace] text-xs text-[#C59A3F]">
                  <span>Labeled Trust Models</span>
                </div>
              </div>

              {/* Pillar 3 */}
              <div className="group rounded-[24px] border border-[#1F1F1F] bg-[#0A0A0A] p-8 transition-all duration-300 hover:border-[#C59A3F]/40 hover:shadow-[0_10px_30px_rgba(197,154,63,0.06)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#1F1F1F] bg-[#141414] text-[#E8C874] transition-colors group-hover:border-[#C59A3F]/50 group-hover:bg-[#C59A3F]/10">
                  <Zap className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-xl font-bold text-white">Machine-Payable x402 V2</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#94A3B8]">
                  Autonomous agents query quotes and pay $0.01 in devnet USDC directly via x402 HTTP
                  headers with disposable keys. No accounts, zero operator custody.
                </p>
                <div className="mt-6 inline-flex items-center gap-1.5 font-['JetBrains_Mono',monospace] text-xs text-[#C59A3F]">
                  <span>$0.01 per Call Developer Wedge</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* FOUR-MINUTE JUDGE WALKTHROUGH                                             */}
        {/* ========================================================================= */}
        <section className="border-b border-[#1F1F1F] bg-[#000000] py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <span className="font-['JetBrains_Mono',monospace] text-xs uppercase tracking-widest text-[#C59A3F]">
                  Demo Flow
                </span>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  The Four-Minute Judge Path
                </h2>
              </div>
              <Link
                href="/clear"
                className="inline-flex items-center gap-2 font-medium text-[#E8C874] hover:underline"
              >
                <span>Start Interactive Flow</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  step: "01",
                  icon: Lock,
                  title: "Two Sealed Books",
                  desc: "Party A & Party B submit encrypted positions into a joint session.",
                  href: "/clear",
                  tag: "Session Setup",
                },
                {
                  step: "02",
                  icon: Cpu,
                  title: "Confidential Compute",
                  desc: "MPC / Attested TEE nets the books; only aggregate scalars decrypt out.",
                  href: "/clear",
                  tag: "Hero Margin",
                },
                {
                  step: "03",
                  icon: EyeOff,
                  title: "The Dangerous Twin",
                  desc: "Experience the plaintext counterfactual to see why centralized primes fail.",
                  href: "/adversarial",
                  tag: "Threat Analysis",
                },
                {
                  step: "04",
                  icon: Coins,
                  title: "Autonomous Agents",
                  desc: "Two independent agents execute 402 challenge → pay → 200 flow.",
                  href: "/agents",
                  tag: "x402 V2 API",
                },
              ].map(({ step, icon: Icon, title, desc, href, tag }) => (
                <Link
                  key={step}
                  href={href}
                  className="group relative flex flex-col justify-between rounded-[24px] border border-[#1F1F1F] bg-[#0A0A0A] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[#C59A3F]/50 hover:bg-[#121212]"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-['JetBrains_Mono',monospace] text-xs font-bold text-[#C59A3F]">
                        {step}
                      </span>
                      <span className="rounded-full bg-[#141414] px-2.5 py-0.5 font-['JetBrains_Mono',monospace] text-[10px] text-[#94A3B8]">
                        {tag}
                      </span>
                    </div>
                    <div className="mt-6 flex h-10 w-10 items-center justify-center rounded-xl border border-[#1F1F1F] bg-[#000000] text-[#E8C874]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-[#94A3B8]">{desc}</p>
                  </div>
                  <div className="mt-6 flex items-center gap-1.5 text-xs font-semibold text-[#E8C874] opacity-0 transition-opacity group-hover:opacity-100">
                    <span>Open screen</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* CALL TO ACTION                                                            */}
        {/* ========================================================================= */}
        <section className="bg-[#000000] py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-[32px] border border-[#1F1F1F] bg-[#0A0A0A] p-10 md:p-16 text-center">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(197,154,63,0.12),transparent_70%)]"
              />
              <div className="relative mx-auto max-w-2xl space-y-6">
                <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
                  Ready to test confidential clearing?
                </h2>
                <p className="text-base text-[#94A3B8] sm:text-lg">
                  Run the live clearing engine in your browser, inspect the mathematical netting formulas,
                  or query the x402 machine-payable gateway.
                </p>
                <div className="flex flex-wrap justify-center gap-4 pt-2">
                  <Link
                    href="/clear"
                    className="inline-flex h-13 items-center justify-center rounded-full bg-gradient-to-r from-[#E8C874] via-[#C59A3F] to-[#A67C27] px-8 text-sm font-semibold text-black transition-transform hover:scale-105 shadow-[0_4px_20px_rgba(197,154,63,0.2)]"
                  >
                    Open Clearing Interface
                  </Link>
                  <Link
                    href="/monad"
                    className="inline-flex h-13 items-center justify-center rounded-full border border-[#1F1F1F] bg-[#141414] px-8 text-sm font-medium text-white transition-colors hover:border-[#C59A3F]/50"
                  >
                    Explore Monad Epochs
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
