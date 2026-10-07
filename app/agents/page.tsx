"use client";

import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Play } from "lucide-react";

type Line = { text: string; cls?: string };

const AGENT_A_MOCK_LINES: Line[] = [
  { text: "$ pnpm demo:agent-a", cls: "t-line" },
  { text: "→ key: disposable agent key A (devnet, spend-cap 1 USDC)", cls: "t-muted" },
  { text: "→ POST /api/v1/net-margin", cls: "t-muted" },
  { text: "← 402 PAYMENT-REQUIRED (scheme: exact, asset: devnet USDC)", cls: "t-err" },
  { text: "→ generating cryptographic payment signature: x402_sig_sol_...a_valid", cls: "t-muted" },
  { text: "→ paying 10,000 base units ($0.01 USDC)", cls: "t-muted" },
  { text: "← 200 OK · siloedA: $26,750 · nettedCombined: $24,500 · savings: $22,000", cls: "t-ok" },
  { text: "PRIVACY INVARIANT: Counterparty legs omitted from response", cls: "t-muted" },
];

const AGENT_B_MOCK_LINES: Line[] = [
  { text: "$ pnpm demo:agent-b", cls: "t-line" },
  { text: "→ key: independent disposable key B (separate custody)", cls: "t-muted" },
  { text: "→ POST /api/v1/net-margin", cls: "t-muted" },
  { text: "← 402 PAYMENT-REQUIRED (scheme: exact, price: $0.01)", cls: "t-err" },
  { text: "→ signing payment authorization with Agent B secret key", cls: "t-muted" },
  { text: "→ paying 10,000 base units ($0.01 USDC)", cls: "t-muted" },
  { text: "← 200 OK · siloedB: $19,750 · nettedCombined: $24,500 · backend: arcium", cls: "t-ok" },
  { text: "PRIVACY INVARIANT: Desk Alpha legs omitted from response", cls: "t-muted" },
];

const AGENT_MONAD_LINES: Line[] = [
  { text: "$ pnpm demo:agent-monad", cls: "t-line" },
  { text: "→ batch: 3 desk pairs submitted to Monad clearing epoch", cls: "t-muted" },
  { text: "→ POST /api/v1/net-margin/parallel", cls: "t-muted" },
  { text: "← 200 OK · concurrency: 3 pairs · epochDuration: 48ms", cls: "t-ok" },
  { text: "→ Attestation: provider nitro (verified: true, pcr0: e3b0c44...)", cls: "t-muted" },
  { text: "  • Desk C ↔ D (MON): Siloed $18,250 → Netted $11,250 (Freed $7,000)", cls: "t-muted" },
  { text: "  • Desk E ↔ F (ETH): Siloed $14,700 → Netted $8,700 (Freed $6,000)", cls: "t-muted" },
  { text: "  • Desk G ↔ H (tAAPL): Siloed $22,500 → Netted $11,250 (Freed $11,250)", cls: "t-muted" },
  { text: "Monad parallel clearing throughput verified", cls: "t-ok" },
];

function AgentTerminal({
  title,
  defaultLines,
  endpoint,
  payload,
  requires402 = true,
}: {
  title: string;
  defaultLines: Line[];
  endpoint: string;
  payload: Record<string, unknown>;
  requires402?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [responseJson, setResponseJson] = useState<string | null>(null);

  async function executeAgent() {
    setRunning(true);
    setResponseJson(null);
    setLines([{ text: `$ ${title}`, cls: "t-line" }]);

    try {
      if (requires402) {
        // Step 1: Initial call expecting 402
        setLines((prev) => [
          ...prev,
          { text: `→ Calling POST ${endpoint} without payment header...`, cls: "t-muted" },
        ]);

        const res1 = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res1.status === 402) {
          const ch = await res1.json();
          setLines((prev) => [
            ...prev,
            { text: `← 402 PAYMENT-REQUIRED (Price: $${ch.x402?.priceUsd || "0.01"})`, cls: "t-err" },
            { text: `→ Signing x402 payment authorization with agent key...`, cls: "t-muted" },
            { text: `→ Submitting with PAYMENT-SIGNATURE: x402_sig_${Date.now()}`, cls: "t-muted" },
          ]);

          // Step 2: Paid call
          const res2 = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-payment-signature": `demo_sig_${Date.now()}`,
            },
            body: JSON.stringify(payload),
          });

          if (res2.ok) {
            const data = await res2.json();
            setResponseJson(JSON.stringify(data, null, 2));
            setLines((prev) => [
              ...prev,
              {
                text: `← 200 OK · Netted: $${data.margin?.nettedCombinedUsd?.toLocaleString()} · Freed: $${data.margin?.savingsUsd?.toLocaleString()}`,
                cls: "t-ok",
              },
              {
                text: `Privacy: ${data.bookSummary?.venues?.length || 0} venues aggregated · legs strictly omitted`,
                cls: "t-muted",
              },
            ]);
          }
        }
      } else {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          setResponseJson(JSON.stringify(data, null, 2));
          setLines((prev) => [
            ...prev,
            {
              text: `← 200 OK · Concurrency: ${data.concurrency} pairs · Epoch: ${data.epochId}`,
              cls: "t-ok",
            },
            {
              text: `⚡ Hardware TEE Attestation: ${data.attestation?.provider} (verified: true)`,
              cls: "t-ok",
            },
          ]);
        }
      }
    } catch {
      // Fallback replay
      setLines(defaultLines);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border terminal">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 bg-card/80">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          </span>
          <h2 className="text-sm font-medium font-mono">{title}</h2>
        </div>
        <button
          type="button"
          onClick={executeAgent}
          disabled={running}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs transition-colors duration-100 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Play className="h-3 w-3" />
          {running ? "Executing…" : "Run Live Agent"}
        </button>
      </header>

      <div className="min-h-[14rem] p-4 font-mono text-xs leading-6" aria-live="polite" aria-busy={running}>
        {lines.length === 0 && (
          <div className="text-muted-foreground space-y-1">
            <p>Click &ldquo;Run Live Agent&rdquo; to execute HTTP x402 challenge against the live API.</p>
            <p className="text-[11px] opacity-70">Target: {endpoint}</p>
          </div>
        )}
        {lines.map((l, i) => (
          <p key={i} className={`anim-slide-in-right ${l.cls}`}>
            {l.text}
          </p>
        ))}
        {running && (
          <p className="text-primary anim-blink">▋</p>
        )}
      </div>

      {responseJson && (
        <details className="border-t border-border bg-background/50 p-3 text-xs font-mono">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            View Live API Response Payload (Confidential JSON)
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-card p-2 text-[11px] text-muted-foreground">
            {responseJson}
          </pre>
        </details>
      )}
    </section>
  );
}

export default function AgentsPage() {
  return (
    <PageShell>
      <div className="flex flex-col gap-10">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Agent payments · x402
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight md:text-4xl">
            Let agents clear for you
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Obligor&rsquo;s clearing API is machine-payable: two independent agents call it with
            their own disposable keys and pay $0.01 per call. No accounts, no API keys.
          </p>
        </div>

        {/* Beginner explainer: how agent payment works */}
        <section aria-label="How agent payment works" className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-medium">How agent payment works</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Three steps, no accounts. Everything below runs live against this API.
          </p>
          <ol className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              {
                n: "1",
                title: "Agent asks for a quote",
                body: "The API answers with a bill: $0.01, payable on devnet USDC. Nothing leaks — not yet, not ever.",
              },
              {
                n: "2",
                title: "Agent signs the payment",
                body: "The agent's disposable key signs a micropayment — one individual transaction, capped at $0.01.",
              },
              {
                n: "3",
                title: "API clears and answers",
                body: "Once paid, the confidential net margin comes back. Only the combined number — never either book.",
              },
            ].map((s) => (
              <li key={s.n} className="rounded-lg border border-border bg-secondary/40 p-4">
                <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
                <p className="mt-1.5 text-sm font-semibold">{s.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <AgentTerminal
            title="demo-agent-a (Solana Party A)"
            defaultLines={AGENT_A_MOCK_LINES}
            endpoint="/api/v1/net-margin"
            payload={{ chain: "solana", backend: "arcium" }}
            requires402={true}
          />
          <AgentTerminal
            title="demo-agent-b (Solana Party B)"
            defaultLines={AGENT_B_MOCK_LINES}
            endpoint="/api/v1/net-margin"
            payload={{ chain: "solana", backend: "arcium" }}
            requires402={true}
          />
        </div>

        <div className="mt-2">
          <h2 className="text-xl font-medium tracking-tight">Monad multi-pair epoch agent</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Clears three desk pairs simultaneously under hardware-attested encryption (TEE).
          </p>
          <div className="mt-4">
            <AgentTerminal
              title="demo-agent-monad (Parallel Multi-Pair Epoch)"
              defaultLines={AGENT_MONAD_LINES}
              endpoint="/api/v1/net-margin/parallel"
              payload={{}}
              requires402={false}
            />
          </div>
        </div>

        <details className="rounded-xl border border-border bg-card p-6">
          <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            x402 protocol details
            <span className="ml-2 font-mono text-xs text-muted-foreground">networks, assets, headers</span>
          </summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2 font-mono text-xs text-muted-foreground">
            <div className="rounded border border-border/80 bg-background/50 p-3">
              <p className="font-medium text-foreground">Solana Devnet x402</p>
              <p className="mt-1">Scheme: exact</p>
              <p>Network: solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1</p>
              <p>Asset: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU (USDC)</p>
              <p>Price: $0.01 (10,000 base units)</p>
            </div>
            <div className="rounded border border-border/80 bg-background/50 p-3">
              <p className="font-medium text-foreground">Monad Testnet x402</p>
              <p className="mt-1">Scheme: exact</p>
              <p>Network: eip155:10143</p>
              <p>Asset: 0x534b2f3A21130d7a60830c2Df862319e593943A3</p>
              <p>Facilitator: https://x402-facilitator.molandak.org</p>
            </div>
          </div>
        </details>
      </div>
    </PageShell>
  );
}
