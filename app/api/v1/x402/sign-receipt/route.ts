import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePayerKey, signObligorReceipt } from "@/lib/x402";
import { rateLimitCheck } from "@/lib/http";

const signRequestSchema = z.object({
  scheme: z.string().min(1),
  network: z.string().min(1),
  asset: z.string().min(1),
  payTo: z.string().min(1),
  baseUnits: z.string().min(1),
  amount: z.string().optional(),
});

/**
 * Agent helper endpoint: signs an x402 payment challenge with a fresh,
 * ephemeral ed25519 keypair. This allows browser-driven agent runs to
 * participate in full cryptographic receipt verification without exposing
 * private keys or relying on unverified headers.
 */
export async function POST(req: Request) {
  const rateLimitResponse = rateLimitCheck(req, "compute");
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = signRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid challenge parameters", details: parsed.error.issues },
      { status: 422 },
    );
  }

  const payer = generatePayerKey();
  const paymentSignature = signObligorReceipt(
    {
      scheme: parsed.data.scheme,
      network: parsed.data.network,
      asset: parsed.data.asset,
      payTo: parsed.data.payTo,
      baseUnits: parsed.data.baseUnits,
    },
    payer,
    parsed.data.amount,
  );

  return NextResponse.json({
    ok: true,
    signer: payer.signer,
    paymentSignature,
    scheme: parsed.data.scheme,
    network: parsed.data.network,
  });
}
