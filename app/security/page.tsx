import { PageShell } from "@/components/page-shell";
import { buildSecurityAudit } from "@/lib/security-audit";
import type { AuditStatus } from "@/lib/security-audit";

const STATUS_STYLES: Record<AuditStatus, string> = {
  pass: "border-success/40 bg-success/5 text-success",
  warn: "border-muted bg-muted text-muted-foreground",
  fail: "border-destructive/40 bg-destructive/5 text-destructive",
};

export default function SecurityPage() {
  const audit = buildSecurityAudit();
  const failCount = audit.checks.filter((c) => c.status === "fail").length;

  return (
    <PageShell>
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Security &amp; self-audit
            </p>
            <h1 className="mt-2 text-3xl font-medium tracking-tight md:text-4xl">Audit this deployment</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Every check below is computed from the <em>actually-loaded</em> configuration and live
              state of this deployment — not from a README. The same builder powers
              <code className="mx-1 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-xs">GET /api/v1/security/self-audit</code>,
              so this page can never show a sweeter verdict than the API returns.
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 rounded-lg border border-border bg-card p-4">
            <span
              className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs uppercase ${
                audit.verdict === "pass" ? STATUS_STYLES.pass : STATUS_STYLES.warn
              }`}
            >
              {audit.verdict === "pass" ? "Pass" : "Review"}
            </span>
            <dl className="space-y-1 text-xs text-muted-foreground">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-mono uppercase tracking-widest">Env</dt>
                <dd className="font-mono">{audit.environment}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-mono uppercase tracking-widest">Production</dt>
                <dd className="font-mono">{audit.production ? "yes" : "no"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-mono uppercase tracking-widest">Failing</dt>
                <dd className="font-mono">{failCount}</dd>
              </div>
            </dl>
          </div>
        </div>

        <section aria-label="Audit checks" className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Live security self-audit checks</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-4 py-3 font-medium">Invariant</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {audit.checks.map((check) => (
                  <tr key={check.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 align-top">
                      <p className="font-mono text-xs text-muted-foreground">{check.id}</p>
                      <p className="mt-0.5 font-medium">{check.title}</p>
                      <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
                        {check.detail}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${STATUS_STYLES[check.status]}`}
                      >
                        {check.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <code className="font-mono text-xs text-muted-foreground">{check.evidence}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs font-mono text-muted-foreground">
          Generated {new Date(audit.generatedAt).toLocaleString()}. {audit.disclaimer}
        </p>

        <section
          aria-label="Probe commands"
          className="rounded-lg border border-border bg-card p-6"
        >
          <h2 className="text-sm font-medium">Probe it yourself</h2>
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">
            Read-only commands that exercise the guards above. Set{" "}
            <code className="font-mono">ORIGIN</code> to this deployment&apos;s origin.
          </p>
          <ul className="mt-3 space-y-2">
            {audit.probeCommands.map((cmd) => (
              <li key={cmd}>
                <code className="block overflow-x-auto rounded border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                  {cmd}
                </code>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-label="What a production audit would add"
          className="rounded-lg border border-border bg-card p-6"
        >
          <h2 className="text-sm font-medium">A real audit would add</h2>
          <ul className="mt-3 max-w-prose list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">Coinbase x402 &quot;exact&quot; interop</strong> — Obligor
              already cryptographically verifies its own ed25519 receipts over the exact challenge terms;
              the tracked follow-up is on-chain settlement via the @x402 SDK.
            </li>
            <li>
              <strong className="text-foreground">Third-party penetration test</strong> — this self-audit
              covers the demo surface, not an adversarial engagement.
            </li>
            <li>
              <strong className="text-foreground">Attestation verification hardening</strong> — the host
              already ignores a bare enclave boolean and requires an expected-measurement (and optional
              PCR0) match; a genuine Nitro/Oyster NSM producer is the tracked follow-up.
            </li>
            <li>
              <strong className="text-foreground">TLS/cert hygiene</strong> — HSTS is asserted here; the
              terminating edge (proxy/CDN) does the real enforcement in production.
            </li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}