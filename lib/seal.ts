/**
 * Deal-room book sealing (shared, client + server safe).
 *
 * A seal is a wallet signature over a canonical, human-readable message that
 * commits to (a) the session, (b) the party, (c) the chain, and (d) a SHA-256
 * commitment to the party's own legs. The server re-derives the same message
 * from the stored session and verifies the signature against the party's
 * wallet — so a "seal" is real cryptographic evidence the desk controls its
 * wallet, not a server-issued placeholder.
 *
 * Uses @noble/hashes only (no node:crypto) so the exact same message can be
 * built in the browser and verified on the server.
 */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export const SEAL_MESSAGE_PREFIX = "Obligor deal-seal v1";

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** SHA-256 commitment to a party's legs — deterministic canonical JSON. */
export function legsCommitment(legs: unknown[]): string {
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
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

/** Canonical seal message. Every party on every chain signs exactly this. */
export function sealMessage(input: {
  sessionId: string;
  partyId: "A" | "B";
  chain: "solana" | "monad";
  book: string;
}): string {
  return [
    SEAL_MESSAGE_PREFIX,
    `session:${input.sessionId}`,
    `party:${input.partyId}`,
    `chain:${input.chain}`,
    `book:${input.book}`,
  ].join("\n");
}
