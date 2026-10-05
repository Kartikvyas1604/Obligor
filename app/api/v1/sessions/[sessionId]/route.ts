import { NextRequest, NextResponse } from "next/server";
import {
  getDealSession,
  joinDealSession,
  updatePartyLegs,
  sealPartyBook,
  clearDealSession,
  updateEscrowState,
  settleDealSession,
} from "@/lib/deal-session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = getDealSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
  }

  return NextResponse.json({ success: true, session });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const session = getDealSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  switch (action) {
    case "join": {
      const walletB = body.walletB || "6d8n6u6fR8P3zJ9eHwK7V4mQ2xY1tL5sA9bC3dE7fG1h";
      const labelB = body.labelB || "Desk B (Counterparty)";
      const legsB = body.legsB || [];
      const updated = joinDealSession(sessionId, walletB, labelB, legsB);
      return NextResponse.json({ success: true, session: updated });
    }

    case "update_legs": {
      const partyId = body.partyId as "A" | "B";
      const legs = body.legs || [];
      const updated = updatePartyLegs(sessionId, partyId, legs);
      return NextResponse.json({ success: true, session: updated });
    }

    case "seal": {
      const partyId = body.partyId as "A" | "B";
      const signature = body.signature;
      const updated = sealPartyBook(sessionId, partyId, signature);
      return NextResponse.json({ success: true, session: updated });
    }

    case "clear": {
      const updated = await clearDealSession(sessionId);
      return NextResponse.json({ success: true, session: updated });
    }

    case "deposit_escrow": {
      const partyId = body.partyId as "A" | "B";
      const amount = body.amount || 0;
      const txHash = body.txHash;
      const updated = updateEscrowState(sessionId, partyId, amount, txHash);
      return NextResponse.json({ success: true, session: updated });
    }

    case "settle": {
      const updated = settleDealSession(sessionId);
      return NextResponse.json({ success: true, session: updated });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
