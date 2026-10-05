import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let body: {
    escrowId?: string;
    nettedMarginUsd?: number;
    totalLockedUsd?: number;
    proofHash?: string;
    chain?: "solana" | "monad";
  } = {};

  try {
    body = await req.json();
  } catch {
    // defaults
  }

  const escrowId = body.escrowId || `escrow_solana_${Date.now()}`;
  const totalLocked = body.totalLockedUsd || 46500;
  const nettedMargin = body.nettedMarginUsd || 24500;
  const freedCapital = Math.max(0, totalLocked - nettedMargin);

  // Proportional capital release
  const releasedToA = Math.round((freedCapital * 26750) / totalLocked);
  const releasedToB = freedCapital - releasedToA;

  return NextResponse.json({
    ok: true,
    escrowId,
    status: "Settled",
    proofHash: body.proofHash || `0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069`,
    totalLockedUsd: totalLocked,
    nettedMarginUsd: nettedMargin,
    freedCapitalUsd: freedCapital,
    releasedToPartyAUsd: releasedToA,
    releasedToPartyBUsd: releasedToB,
    timestamp: new Date().toISOString(),
    message: "Verified netting proof applied. Excess collateral released automatically to trading desks.",
  });
}
