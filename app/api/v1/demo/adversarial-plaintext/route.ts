import { NextRequest, NextResponse } from "next/server";
import { adversarialBooks } from "@/lib/fixtures";
import { twoPartyNetted, twoPartySiloed } from "@/lib/margin";

export async function POST(req: NextRequest) {
  let body: { iUnderstandThisLeaksBothBooks?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty
  }

  if (!body.iUnderstandThisLeaksBothBooks) {
    return NextResponse.json(
      {
        error: "CONFIRMATION_REQUIRED",
        message:
          "Adversarial counterfactual endpoint requires explicit acknowledgment: 'iUnderstandThisLeaksBothBooks: true'. This endpoint deliberately exposes both books to demonstrate why centralized clearing fails.",
      },
      { status: 400 },
    );
  }

  const siloed = twoPartySiloed(adversarialBooks.a, adversarialBooks.b);
  const netted = twoPartyNetted(adversarialBooks.a, adversarialBooks.b);

  return NextResponse.json({
    danger: "DANGEROUS / plaintext operator view",
    demonstrationPurpose:
      "Shows why single-operator centralized clearing creates a fatal privacy liability: operator sees both books and can front-run strategies.",
    partyA: adversarialBooks.a,
    partyB: adversarialBooks.b,
    siloed,
    netted,
    operatorThreatVector:
      "Operator learns Desk A is long $120k SOL and Desk B is short $120k SOL. Operator can liquidate, front-run or copy-trade before releasing margin.",
    timestamp: new Date().toISOString(),
  });
}
