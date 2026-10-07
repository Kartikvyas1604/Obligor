/**
 * Deal-room orchestration (pure domain logic, no HTTP).
 * Persistence goes through the SessionStore; validation of inputs happens at
 * the route boundary. Every mutation stamps updatedAt for TTL eviction.
 */

import { type PositionBook, type PositionLeg, type NetMarginResult, twoPartySiloed, type BackendKind } from "@/lib/margin";
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
}

export interface DealSession {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  backend: BackendKind;
  partyA: SessionParty;
  partyB: SessionParty | null;
  result: NetMarginResult | null;
  siloedCombinedUsd: number | null;
  escrowTxHash: string | null;
  attestationQuote: string | null;
}

import { randomBytes } from "node:crypto";

export function generateSessionId(): string {
  return `0x${randomBytes(16).toString("hex")}`;
}

export function createDealSession(
  walletA: string,
  labelA = "Desk A",
  legsA: PositionLeg[] = [],
  backend: BackendKind = "arcium",
): DealSession {
  const sessionId = generateSessionId();
  const now = Date.now();
  const session: DealSession = {
    sessionId,
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
    chain: "solana",
    legs: session.partyA.legs,
    warnings: [],
  };

  const bookB: PositionBook = {
    party: "B",
    label: session.partyB.label,
    wallet: session.partyB.wallet,
    chain: "solana",
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
