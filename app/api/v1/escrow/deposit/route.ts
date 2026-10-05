import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let body: {
    partyA?: string;
    partyB?: string;
    amountAUsd?: number;
    amountBUsd?: number;
    chain?: "solana" | "monad";
  } = {};

  try {
    body = await req.json();
  } catch {
    // defaults
  }

  const partyA = body.partyA || "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
  const partyB = body.partyB || "4Nd1mBQtrMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytW";
  const amountA = body.amountAUsd || 26750;
  const amountB = body.amountBUsd || 19750;
  const totalLocked = amountA + amountB;
  const chain = body.chain || "solana";

  const escrowId = `escrow_${chain}_${Date.now()}`;

  return NextResponse.json({
    ok: true,
    escrowId,
    chain,
    status: "Deposited",
    partyA,
    partyB,
    lockedAUsd: amountA,
    lockedBUsd: amountB,
    totalLockedUsd: totalLocked,
    timestamp: new Date().toISOString(),
    message: "Bilateral collateral locked in escrow vault awaiting verified netting proof.",
  });
}
