import type { BackendKind } from "@/lib/margin";
import type { TrustModel } from "@/lib/confidential";

const LABELS: Record<BackendKind, { text: string; cls: string; note: string }> = {
  arcium: {
    text: "MPC circuit (simulated seal)",
    cls: "border-primary/40 text-primary",
    note:
      "The Arcis MPC circuit ships in programs/obligor-mxe. Until the MXE transport is wired, this runs the exact formula in plaintext and does not claim MPC. Real MPC lands when Arcium MXE is connected.",
  },
  enclave: {
    text: "TEE path (simulated seal)",
    cls: "border-steel/40 text-steel",
    note:
      "The Rust enclave ships in enclave/obligor-enclave. Until an attested enclave transport is wired, this runs the exact formula in plaintext and never issues or claims attestation. TEE ≠ MPC and nothing here equates them.",
  },
  simulated: {
    text: "Local simulation",
    cls: "border-destructive/40 text-destructive",
    note: "SIMULATED — the exact formula runs in plaintext, no MPC, no attestation.",
  },
};

/** Trust-model chip derived from what the run actually executed. */
const TRUST_LABELS: Record<TrustModel, string> = {
  cryptographic_mpc: "Cryptographic MPC (verified)",
  hardware_attested_tee: "Attested TEE (hardware verified)",
  simulated_plaintext_compute: "Sealed-execution simulation (not MPC, not attested)",
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
        <span className="text-xs text-muted-foreground max-w-sm">{trustModel ? note : note}</span>
      )}
    </span>
  );
}
