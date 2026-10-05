import { NextRequest, NextResponse } from "next/server";
import { createDealSession } from "@/lib/deal-session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const walletA = body.walletA || "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
    const labelA = body.labelA || "Desk A (Initiator)";
    const legsA = body.legsA || [];
    const backend = body.backend || "arcium";

    const session = createDealSession(walletA, labelA, legsA, backend);
    return NextResponse.json({ success: true, session }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create deal session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
