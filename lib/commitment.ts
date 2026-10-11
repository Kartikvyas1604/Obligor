/**
 * Commitment hashing — the verifiable-output invariant (J2).
 *
 * A computation is registered under `commitmentHash = sha256(canonical(A) +
 * canonical(B) + computationId + backendKind)`. Each party's own leg hash is
 * recorded separately under `hashLegs(partyLegs)` so the verify endpoint can
 * re-derive a party's contribution from ITS OWN inputs only and prove the
 * registration without ever revealing the counterparty's book.
 *
 * Server-only (node:crypto) — never import from a client component.
 */

import { createHash } from "node:crypto";

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

export function hashLegs(legs: unknown[]): string {
  const canonical = legs
    .map((leg) => leg as Record<string, unknown>)
    .map((l) => ({
      venue: l.venue,
      instrument: l.instrument,
      bucket: l.bucket,
      side: l.side,
      party: l.party,
      qty: round(Number(l.qty), 4),
      notionalUsd: round(Number(l.notionalUsd), 2),
      markUsd: round(Number(l.markUsd), 2),
      haircut: round(Number(l.haircut), 4),
      signedExposureUsd: round(Number(l.signedExposureUsd), 2),
    }))
    .sort(
      (a, b) =>
        String(a.instrument).localeCompare(String(b.instrument)) ||
        String(a.bucket).localeCompare(String(b.bucket)) ||
        String(a.side).localeCompare(String(b.side)),
    );
  return sha256hex(JSON.stringify(canonical));
}

function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function computeCommitmentHash(inputs: {
  partyLegHashes: Record<string, string>;
  computationId: string;
  backendKind: string;
}): string {
  const parts = [
    inputs.partyLegHashes["A"] ?? "",
    inputs.partyLegHashes["B"] ?? "",
    ...Object.entries(inputs.partyLegHashes)
      .filter(([p]) => p !== "A" && p !== "B")
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, h]) => h),
    inputs.computationId,
    inputs.backendKind,
  ].join("|");
  return `sha256:${sha256hex(parts)}`;
}