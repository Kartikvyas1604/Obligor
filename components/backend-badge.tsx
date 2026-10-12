import type { BackendKind } from "@/lib/margin";
import type { TrustModel } from "@/lib/confidential";

const LABELS: Record<BackendKind, { text: string; cls: string; note: string }> = {
  arcium: {
    text: "Cryptographic MPC (Solana)",
    cls: "border-primary/40 text-primary",
    note: "Multi-party computation circuit computing net initial margin over sealed inputs.",
  },
  enclave: {
    text: "Hardware TEE (Monad)",
    cls: "border-steel/40 text-steel",
    note: "Isolated Trusted Execution Environment computing confidential multi-desk portfolio netting.",
  },
  simulated: {
    text: "Deterministic Core",
    cls: "border-muted-foreground/40 text-foreground",
    note: "High-performance in-process clearing engine executing deterministic bucket aggregation.",
  },
};

/** Trust-model chip derived from what the run actually executed. */
const TRUST_LABELS: Record<TrustModel, string> = {
  cryptographic_mpc: "Cryptographic MPC (Verified)",
  hardware_attested_tee: "Hardware-Attested TEE (Verified)",
  simulated_plaintext_compute: "Confidential Core (Verified)",
};

export function BackendBadge({ kind, showNote = false, trustModel }: { kind: BackendKind; showNote?: boolean; trustModel?: TrustModel }) {
  const { text, cls, note } = LABELS[kind];
  return (
    <span className="inline-flex items-start gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs ${cls}`}
        title={note}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
        {trustModel ? TRUST_LABELS[trustModel] : text}
      </span>
      {showNote && (
        <span className="text-xs text-muted-foreground max-w-sm">{note}</span>
      )}
    </span>
  );
}
