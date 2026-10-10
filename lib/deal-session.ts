/**
 * Deal-room orchestration (pure domain logic, no HTTP).
 * Persistence goes through the SessionStore; validation of inputs happens at
 * the route boundary. Every mutation stamps updatedAt for TTL eviction.
 */

import { type PositionBook, type PositionLeg, twoPartySiloed, type BackendKind, type PartyId } from "@/lib/margin";
import { type ConfidentialNetMarginResult } from "@/lib/confidential";
import { getConfidentialBackend } from "@/lib/confidential";
import { sessionStore } from "@/lib/session-store";
import { env } from "@/lib/env";

export type SessionStatus =
  | "waiting_for_party_b"
  | "both_connected"
  | "sealed"
  | "clearing"
  | "cleared"
  | "escrow_locked"
  | "settled";

export interface SessionParty {
  partyId: "A" | "B";
  wallet: string;
  label: string;
  legs: PositionLeg[];
  isReady: boolean;
  isSealed: boolean;
  signature?: string;
  depositedAmountUsd: number;
  /** Server-side marker: the caller was NOT authorized for this party's book. */
  legsWithheld?: boolean;
}

export interface DealSession {
  sessionId: string;
  chain: "solana" | "monad";
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  backend: BackendKind;
  partyA: SessionParty;
  partyB: SessionParty | null;
  /** Full confidential result (computationId/trustModel/attestation included). */
  result: ConfidentialNetMarginResult | null;
  siloedCombinedUsd: number | null;
  escrowTxHash: string | null;
  attestationQuote: string | null;
  /**
   * INTERNAL — SHA-256 hashes of each party's capability token. Hashes are
   * stored (verifiable), the raw tokens are only ever returned once at
   * create/join and never persisted or serialized.
   */
  partyTokenHashes?: { A?: string; B?: string };
}

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateSessionId(): string {
  return `0x${randomBytes(16).toString("hex")}`;
}

/** Fresh capability token for one desk (32 random bytes, base64url). */
export function issuePartyToken(): string {
  return randomBytes(32).toString("base64url");
}

/** One-way hash of a party token — the only form persisted. */
export function hashPartyToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time check that `token` authorizes `party` on `session`. A
 * session with no stored hash for that party (e.g. pre-upgrade) denies.
 */
export function verifyPartyToken(
  session: DealSession,
  party: PartyId,
  token: string | null | undefined,
): boolean {
  if (!token) return false;
  const expected = session.partyTokenHashes?.[party];
  if (!expected) return false;
  const actual = hashPartyToken(token);
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Namespace the JSON-serialized session excludes token hashes. */
export type PublicSession = Omit<DealSession, "partyTokenHashes">;

/**
 * Clone a session for a caller with the given authorizations. A party's
 * plaintext legs are withheld (empty + legsWithheld flag) unless their token
 * was presented. Token hashes never leave the server.
 */
export function publicSession(
  session: DealSession,
  authorized: { A: boolean; B: boolean },
): PublicSession {
  const copy = structuredClone(session) as PublicSession;
  delete (copy as { partyTokenHashes?: unknown }).partyTokenHashes;
  if (copy.partyA && !authorized.A) {
    copy.partyA.legs = [];
    copy.partyA.legsWithheld = true;
  }
  if (copy.partyB && !authorized.B) {
    copy.partyB.legs = [];
    copy.partyB.legsWithheld = true;
  }
  return copy;
}

/** Evaluate which parties a (possibly comma-separated) token header authorizes. */
export function authorizedParties(
  session: DealSession,
  header: string | null,
): { A: boolean; B: boolean } {
  const out: { A: boolean; B: boolean } = { A: false, B: false };
  if (!header) return out;
  for (const token of header.split(",").map((t) => t.trim())) {
    if (token && verifyPartyToken(session, "A", token)) out.A = true;
    if (token && verifyPartyToken(session, "B", token)) out.B = true;
  }
  return out;
}

export function createDealSession(
  walletA: string,
  labelA = "Desk A",
  legsA: PositionLeg[] = [],
  backend: BackendKind = "arcium",
  chain: "solana" | "monad" = backend === "enclave" ? "monad" : "solana",
): DealSession {
  const sessionId = generateSessionId();
  const now = Date.now();
  const session: DealSession = {
    sessionId,
    chain,
    createdAt: now,
    updatedAt: now,
    status: "waiting_for_party_b",
    backend,
    partyA: {
      partyId: "A",
      wallet: walletA,
      label: labelA,
      legs: legsA,
      isReady: true,
      isSealed: false,
      depositedAmountUsd: 0,
    },
    partyB: null,
    result: null,
    siloedCombinedUsd: null,
    escrowTxHash: null,
    attestationQuote: null,
  };
  sessionStore.set(session);
  return session;
}

export function getSession(sessionId: string): DealSession | null {
  return sessionStore.get(sessionId);
}

export function deleteSession(sessionId: string): void {
  sessionStore.delete(sessionId);
}

export function saveSession(session: DealSession): void {
  session.updatedAt = Date.now();
  sessionStore.set(session);
}

export function joinDealSession(
  sessionId: string,
  walletB: string,
  labelB = "Desk B",
  legsB: PositionLeg[] = [],
): DealSession | null {
  const session = sessionStore.get(sessionId);
  if (!session || session.partyB) return null;

  session.partyB = {
    partyId: "B",
    wallet: walletB,
    label: labelB,
    legs: legsB,
    isReady: true,
    isSealed: false,
    depositedAmountUsd: 0,
  };
  session.status = "both_connected";
  saveSession(session);
  return session;
}

export function updatePartyLegs(
  sessionId: string,
  partyId: "A" | "B",
  legs: PositionLeg[],
): DealSession | null {
  const session = sessionStore.get(sessionId);
  if (!session) return null;
  if (partyId === "A") {
    session.partyA.legs = legs;
  } else if (session.partyB) {
    session.partyB.legs = legs;
  } else {
    return null;
  }
  saveSession(session);
  return session;
}

export function sealPartyBook(
  sessionId: string,
  partyId: "A" | "B",
  signature?: string,
): DealSession | null {
  const session = sessionStore.get(sessionId);
  if (!session) return null;

  if (partyId === "A") {
    session.partyA.isSealed = true;
    session.partyA.signature = signature;
  } else if (session.partyB) {
    session.partyB.isSealed = true;
    session.partyB.signature = signature;
  } else {
    return null;
  }

  if (session.partyA.isSealed && session.partyB?.isSealed) {
    session.status = "sealed";
  }
  saveSession(session);
  return session;
}

export async function clearDealSession(sessionId: string): Promise<DealSession | null> {
  const session = sessionStore.get(sessionId);
  if (!session || !session.partyB) return null;
  if (session.status !== "sealed") return null; // both books must be sealed

  session.status = "clearing";
  saveSession(session);

  const bookA: PositionBook = {
    party: "A",
    label: session.partyA.label,
    wallet: session.partyA.wallet,
    chain: session.chain,
    legs: session.partyA.legs,
    warnings: [],
  };

  const bookB: PositionBook = {
    party: "B",
    label: session.partyB.label,
    wallet: session.partyB.wallet,
    chain: session.chain,
    legs: session.partyB.legs,
    warnings: [],
  };

  try {
    const siloed = twoPartySiloed(bookA, bookB);
    const backendInstance = getConfidentialBackend(session.backend);
    const res = await backendInstance.netTwoParty(bookA, bookB);

    session.result = res;
    session.siloedCombinedUsd = siloed.siloedCombined;
    session.attestationQuote = res.attestation?.quote || null;
    session.status = "cleared";
    saveSession(session);
    return session;
  } catch (err) {
    // Fail closed: a failed confidential computation never silently falls
    // back to plaintext, and the session stays fit for retry.
    session.status = "sealed";
    saveSession(session);
    throw err;
  }
}

export function updateEscrowState(
  sessionId: string,
  partyId: "A" | "B",
  depositedAmountUsd: number,
  txHash?: string,
): DealSession | null {
  const session = sessionStore.get(sessionId);
  if (!session || !session.partyB) return null;

  if (partyId === "A") {
    session.partyA.depositedAmountUsd = depositedAmountUsd;
  } else {
    session.partyB.depositedAmountUsd = depositedAmountUsd;
  }

  if (session.partyA.depositedAmountUsd > 0 && session.partyB.depositedAmountUsd > 0) {
    session.status = "escrow_locked";
    if (txHash) session.escrowTxHash = txHash;
  }

  saveSession(session);
  return session;
}

export function settleDealSession(sessionId: string): DealSession | null {
  const session = sessionStore.get(sessionId);
  if (!session || session.status !== "escrow_locked") return null;

  session.status = "settled";
  saveSession(session);
  return session;
}

export const SESSION_TTL_MS = () => env.store.ttlMs;
