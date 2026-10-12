import { z } from "zod";
import { generatePayerKey, signObligorReceipt } from "@/lib/x402";
import { parseBody, rateLimitFor, readJsonBody, withApi, ok } from "@/lib/http";

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
export const POST = withApi(async ({ req }) => {
  const headers = rateLimitFor("compute", req);
  const bodyRaw = await readJsonBody(req);
  const body = parseBody(signRequestSchema, bodyRaw);

  const payer = generatePayerKey();
  const paymentSignature = signObligorReceipt(
    {
      scheme: body.scheme,
      network: body.network,
      asset: body.asset,
      payTo: body.payTo,
      baseUnits: body.baseUnits,
    },
    payer,
    body.amount,
  );

  return ok(
    {
      signer: payer.signer,
      paymentSignature,
      scheme: body.scheme,
      network: body.network,
    },
    { headers },
  );
});
