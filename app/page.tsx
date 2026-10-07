import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroMockup } from "@/components/hero-mockup";
import { ProfitCalculator } from "@/components/profit-calculator";
import { HowItWorksVisual } from "@/components/how-it-works-visual";
import { StatsBand, FaqSection, CtaBand } from "@/components/landing-sections";
import { RevealSection } from "@/components/reveal-section";
import { Marquee } from "@/components/marquee";
import { Sparkle } from "@/components/sparkle";
import { SealVisual, NetVisual, EscrowVisual } from "@/components/three-ways-visuals";

const THREE_WAYS = [
  {
    index: "01",
    title: "Seal both books",
    body: "Each desk submits its portfolio encrypted, from its own device, with independent keys. Plaintext legs never touch the wire.",
    visual: <SealVisual />,
  },
  {
    index: "02",
    title: "Net in the dark",
    body: "Arcium MPC on Solana or an attested TEE on Monad computes a single scalar: the combined net initial margin.",
    visual: <NetVisual />,
  },
  {
    index: "03",
    title: "Free the collateral",
    body: "On-chain escrow settles the net obligation. Excess capital returns to both desks the moment the attestation lands.",
    visual: <EscrowVisual />,
  },
];

const COMPARISON = {
  siloed: [
    "Duplicate collateral on every venue",
    "Cross-party offsets never recognized",
    "A central operator can read both books",
    "No machine-payable interface",
  ],
  obligor: [
    "One net obligation across both desks",
    "Offsetting positions cancel cryptographically",
    "Only the aggregate is ever decrypted",
    "$0.01 per call via x402",
  ],
};

const TICKER = [
  "Confidential netting",
  "Arcium MPC",
  "Attested TEE",
  "Pyth oracles",
  "x402 settlement",
  "TEE ≠ MPC",
  "Zero plaintext leaks",
  "On-chain escrow",
];

const INTEGRATIONS = ["Kamino", "Drift", "Pyth", "xStocks", "Arcium", "Monad"];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border">
          <div
            aria-hidden
            className="grid-backdrop pointer-events-none absolute inset-0 opacity-50"
          />
          <div className="relative mx-auto grid max-w-[1332px] items-center gap-12 px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:grid-cols-2 lg:gap-16 lg:px-8">
            <div className="text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
                <Sparkle size={12} className="text-gold" />
                Confidential two-party clearing
              </div>

              <h1 className="mt-8 text-[42px] font-medium leading-[108%] tracking-[-0.03em] sm:text-6xl">
                Your margin should
                <br />
                never{" "}
                <span className="text-muted-foreground">sit trapped.</span>
              </h1>

              <p className="mt-6 max-w-md text-[17px] font-medium leading-[148%] tracking-[-0.02em] text-muted-foreground">
                Obligor nets two desks&rsquo; portfolios into one confidential obligation —
                neither party, nor the operator, ever sees the other&rsquo;s book.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/clear"
                  className="btn-light inline-flex h-12 items-center gap-2 rounded-full px-7 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span>Launch clearing terminal</span>
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex h-12 items-center rounded-full border border-border px-7 text-sm font-semibold transition-colors duration-200 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span>See how it works</span>
                </Link>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
                <span className="text-foreground">Backed by live rails:</span>
                {INTEGRATIONS.map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            </div>

            <div className="relative">
              <HeroMockup />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[radial-gradient(88%_100%_at_50%_0%,transparent_55%,var(--background)_95%)]"
              />
            </div>
          </div>

          <div className="relative border-t border-border py-5">
            <Marquee duration={30}>
              {TICKER.map((item) => (
                <span
                  key={item}
                  className="flex items-center gap-8 text-[13px] font-medium uppercase tracking-[-0.01em] text-muted-foreground"
                >
                  {item}
                  <span className="h-1 w-1 rounded-full bg-border" aria-hidden />
                </span>
              ))}
            </Marquee>
          </div>
        </section>

        <StatsBand />

        <section
          aria-labelledby="what-obligor-does"
          className="border-b border-border py-20 md:py-28"
        >
          <div className="mx-auto max-w-[1332px] px-4 sm:px-6 lg:px-8">
            <RevealSection>
              <div className="max-w-xl text-left">
                <span className="flex items-center gap-1.5 text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
                  <Sparkle size={11} className="text-gold" />
                  What Obligor does
                </span>
                <h2
                  id="what-obligor-does"
                  className="mt-3 text-[32px] font-medium leading-[122%] tracking-[-0.03em] sm:text-4xl"
                >
                  Two books in.{" "}
                  <span className="text-muted-foreground">One number out.</span>
                </h2>
              </div>
            </RevealSection>

            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {THREE_WAYS.map(({ index, title, body, visual }) => (
                <RevealSection key={index} delay={100}>
                  <div className="engraved flex h-full flex-col rounded-3xl bg-card p-3 sm:p-4">
                    <div className="flex items-center justify-between px-4 pt-3">
                      <span className="font-mono text-xs text-muted-foreground">{index}</span>
                    </div>
                    <h3 className="mt-4 px-4 text-xl font-medium leading-[122%] tracking-[-0.02em]">
                      {title}
                    </h3>
                    <p className="mt-3 px-4 text-[15px] font-medium leading-[148%] tracking-[-0.01em] text-muted-foreground">
                      {body}
                    </p>
                    <div className="mt-6 flex-1 px-4 pb-4">{visual}</div>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="how-it-works-heading"
          className="border-b border-border py-20 md:py-28"
        >
          <div className="mx-auto max-w-[1332px] px-4 sm:px-6 lg:px-8">
            <RevealSection>
              <HowItWorksVisual />
            </RevealSection>
          </div>
        </section>

        <section
          aria-labelledby="why-obligor"
          className="border-b border-border py-20 md:py-28"
        >
          <div className="mx-auto max-w-[1332px] px-4 sm:px-6 lg:px-8">
            <RevealSection>
              <div className="max-w-xl text-left">
                <span className="flex items-center gap-1.5 text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
                  <Sparkle size={11} className="text-gold" />
                  Why Obligor
                </span>
                <h2
                  id="why-obligor"
                  className="mt-3 text-[32px] font-medium leading-[122%] tracking-[-0.03em] sm:text-4xl"
                >
                  Siloed clearing falls short.
                </h2>
              </div>
            </RevealSection>

            <div className="mt-14 grid gap-4 md:grid-cols-2">
              <RevealSection>
                <div className="engraved h-full rounded-3xl bg-card p-8">
                  <h3 className="text-sm font-medium uppercase tracking-[-0.01em] text-muted-foreground">
                    Siloed protocols
                  </h3>
                  <ul className="mt-6 space-y-4">
                    {COMPARISON.siloed.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-3 text-[15px] font-medium text-muted-foreground"
                      >
                        <span
                          aria-hidden
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary"
                        >
                          <span className="relative block h-2.5 w-0.5 bg-muted-foreground" />
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </RevealSection>

              <RevealSection delay={100}>
                <div className="engraved h-full rounded-3xl bg-card p-8">
                  <h3 className="text-sm font-medium uppercase tracking-[-0.01em]">
                    Obligor
                  </h3>
                  <ul className="mt-6 space-y-4">
                    {COMPARISON.obligor.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-3 text-[15px] font-medium"
                      >
                        <span
                          aria-hidden
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground"
                        >
                          <Check className="h-3 w-3 text-background" />
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </RevealSection>
            </div>
          </div>
        </section>

        <section aria-labelledby="calculator" className="border-b border-border py-20 md:py-28">
          <div className="mx-auto max-w-[1332px] px-4 sm:px-6 lg:px-8">
            <RevealSection>
              <ProfitCalculator />
            </RevealSection>
          </div>
        </section>

        <FaqSection />

        <CtaBand />

        <section
          aria-hidden
          className="overflow-hidden border-t border-border py-10 md:py-16"
        >
          <Marquee duration={60}>
            <span className="font-display whitespace-nowrap text-[120px] font-semibold leading-none tracking-[-0.03em] md:text-[220px]">
              <span className="wordmark-stroke">Obligor&nbsp;&nbsp;&nbsp;&nbsp;Obligor&nbsp;&nbsp;&nbsp;&nbsp;Obligor&nbsp;&nbsp;&nbsp;&nbsp;</span>
            </span>
          </Marquee>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
