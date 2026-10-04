import { NextResponse } from "next/server";
import { solanaPartyA, solanaPartyB } from "@/lib/fixtures";

export async function POST() {
  return NextResponse.json({
    ok: true,
    fixture: "two_party_judge_offsetting",
    partyA: solanaPartyA,
    partyB: solanaPartyB,
    note: "Party A has live read-only Kamino SOL lend; Party B has Drift SOL-PERP short.",
  });
}
