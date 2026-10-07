import { PageShell } from "@/components/page-shell";

const REAL_VS_MOCKED: Array<[string, string, "real" | "mock" | "partial"]> = [
  ["Two-party netting formula", "Pure TS, single source of truth, runs on every path", "real"],
  ["Position books (Solana demo)", "Kamino lend leg marked live read-only; rest labeled mock", "partial"],
  ["Mock equity tAAPL", "Fixture price; adapter-ready for xStocks/Backed — never custody", "mock"],
  ["Arcium MPC path", "UI replays the flow locally; wire backend ships separately", "mock"],
  ["TEE attestation (Monad)", "Badge shown for fixture demo; enclave code ships separately", "mock"],
  ["Parallel multi-pair", "Three concurrent pair cards clear per epoch — the Monad differentiator", "real"],
  ["x402 payment flow", "Recorded call flow replayed; agent scripts ship with the API", "partial"],
  ["Liquidation / capital movement", "Not built — numbers only, no venue withdrawals", "mock"],
];

const STATUS_STYLES = {
  real: "border-primary/40 bg-primary/10 text-primary",
  partial: "border-muted bg-muted text-muted-foreground",
  mock: "border-border text-muted-foreground",
} as const;

export default function TrustPage() {
  return (
    <PageShell>
      <div className="flex flex-col gap-10">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Trust &amp; honesty
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight md:text-4xl">
            What is real, what is labeled
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Obligor&rsquo;s product claim is two-party confidentiality: both desks seal inputs, only
            the combined net margin leaves the computation. This frontend demo runs that exact
            formula in your browser on labeled fixtures — the confidential backends live in the
            repo, not in this window.
          </p>
        </div>

        <section aria-label="Trust models" className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-primary">
              Solana — cryptographic MPC
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Arcium MXE computes the net over encrypted inputs. No single operator — including
              Obligor — can read either book. This is the primary Colosseum path.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-steel">
              Monad — hardware-attested TEE
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Nitro/Oyster enclave runs the identical formula with hardware attestation. Real
              confidentiality, a different trust model: <strong className="text-foreground">TEE ≠ MPC</strong>,
              and nothing here pretends otherwise.
            </p>
          </div>
        </section>

        <section aria-label="Real versus mocked" className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="sr-only">Real versus mocked components</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 font-medium">Piece</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {REAL_VS_MOCKED.map(([piece, note, status]) => (
                <tr key={piece} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{piece}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${STATUS_STYLES[status]}`}>
                      {status === "partial" ? "partial" : status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>

        <section aria-label="What production still needs" className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-medium">Production still needs</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
            Legal netting enforceability, venue-specific initial margin, oracle adversity
            assumptions, a default fund, and hardened attestation verification. The per-call fee
            is a demo wedge — the durable value is the mutually-distrusting two-party case, not
            revenue multiplied by invented agent counts.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
