import { NextRequest, NextResponse } from "next/server";
import { solanaPartyA, solanaPartyB } from "@/lib/fixtures";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const party = searchParams.get("party")?.toUpperCase() || "A";
  const wallet = searchParams.get("wallet");
  const chain = searchParams.get("chain") || "solana";

  // Return only the requested party's book
  if (party === "B") {
    return NextResponse.json({
      party: "B",
      chain,
      wallet: wallet || solanaPartyB.wallet,
      label: solanaPartyB.label,
      legs: solanaPartyB.legs,
      fetchedAt: new Date().toISOString(),
      warnings: [],
    });
  }

  return NextResponse.json({
    party: "A",
    chain,
    wallet: wallet || solanaPartyA.wallet,
    label: solanaPartyA.label,
    legs: solanaPartyA.legs,
    fetchedAt: new Date().toISOString(),
    warnings: [],
  });
}
