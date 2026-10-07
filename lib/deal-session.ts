import { type PositionBook, type PositionLeg, type NetMarginResult, twoPartySiloed, type BackendKind } from "@/lib/margin";
import { getConfidentialBackend } from "@/lib/confidential";

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

// Global in-memory session registry with automated TTL cleanup
const sessions = new Map<string, DealSession>();

export function generateSessionId(): string {
  const randomBytes = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
  ).join("");
  return `0x${randomBytes}`;
}

export function createDealSession(
  walletA: string,
  labelA: string = "Desk A",
  legsA: PositionLeg[] = [],
  backend: BackendKind = "arcium"
): DealSession {
  const sessionId = generateSessionId();
  const session: DealSession = {
    sessionId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
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
  sessions.set(sessionId, session);
  return session;
}

export function getDealSession(sessionId: string): DealSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return session;
}

export function joinDealSession(
  sessionId: string,
  walletB: string,
  labelB: string = "Desk B",
  legsB: PositionLeg[] = []
): DealSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

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
  session.updatedAt = Date.now();
  return session;
}

export function updatePartyLegs(
  sessionId: string,
  partyId: "A" | "B",
  legs: PositionLeg[]
): DealSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  if (partyId === "A") {
    session.partyA.legs = legs;
  } else if (session.partyB) {
    session.partyB.legs = legs;
  }
  session.updatedAt = Date.now();
  return session;
}

export function sealPartyBook(
  sessionId: string,
  partyId: "A" | "B",
  signature?: string
): DealSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  if (partyId === "A") {
    session.partyA.isSealed = true;
    session.partyA.signature = signature;
  } else if (session.partyB) {
    session.partyB.isSealed = true;
    session.partyB.signature = signature;
  }

  if (session.partyA.isSealed && session.partyB?.isSealed) {
    session.status = "sealed";
  }
  session.updatedAt = Date.now();
  return session;
}

export async function clearDealSession(sessionId: string): Promise<DealSession | null> {
  const session = sessions.get(sessionId);
  if (!session || !session.partyB) return null;

  session.status = "clearing";
  session.updatedAt = Date.now();

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

  const siloed = twoPartySiloed(bookA, bookB);
  const backendInstance = getConfidentialBackend(session.backend);
  const res = await backendInstance.netTwoParty(bookA, bookB);

  session.result = res;
  session.siloedCombinedUsd = siloed.siloedCombined;
  session.attestationQuote = res.attestation?.quote || null;
  session.status = "cleared";
  session.updatedAt = Date.now();

  return session;
}

export function updateEscrowState(
  sessionId: string,
  partyId: "A" | "B",
  depositedAmountUsd: number,
  txHash?: string
): DealSession | null {
  const session = sessions.get(sessionId);
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

  session.updatedAt = Date.now();
  return session;
}

export function settleDealSession(sessionId: string): DealSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  session.status = "settled";
  session.updatedAt = Date.now();
  return session;
}
