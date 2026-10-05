import { NextResponse } from "next/server";
import { fetchAllOraclePrices } from "@/lib/adapters/pyth";

export async function GET() {
  try {
    const prices = await fetchAllOraclePrices();
    return NextResponse.json({
      ok: true,
      provider: "pyth_network_hermes",
      timestamp: new Date().toISOString(),
      prices,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
