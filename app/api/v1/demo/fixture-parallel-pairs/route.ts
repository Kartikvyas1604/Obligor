import { NextResponse } from "next/server";
import { monadPairs } from "@/lib/fixtures";

export async function POST() {
  return NextResponse.json({
    ok: true,
    fixture: "monad_parallel_pairs",
    count: monadPairs.length,
    pairs: monadPairs,
    note: "Three concurrent desk pairs configured for Monad epoch parallel execution.",
  });
}
