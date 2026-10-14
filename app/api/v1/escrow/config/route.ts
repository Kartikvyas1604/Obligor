import { NextResponse } from "next/server";
import { withApi } from "@/lib/http";
import { env } from "@/lib/env";
import { peekClearingAuthority } from "@/lib/escrow-onchain";
import { deriveEscrowPda } from "@/lib/escrow-client";

/**
 * GET /api/v1/escrow/config
 * Public parameters the browser needs to build a real, client-signed
 * `initialize_escrow` deposit. Exposes only public data (program id, cluster,
 * the clearing authority's PUBLIC key, mint, decimals) — never a secret key.
 * `depositEnabled` is false until a collateral mint + clearing authority exist.
 */
export const GET = withApi(async () => {
  const clearingAuthority = peekClearingAuthority();
  const collateralMint = env.escrow.collateralMint || null;
  const depositEnabled = Boolean(clearingAuthority && collateralMint);

  return NextResponse.json({
    ok: true,
    programId: env.escrow.programId,
    rpcUrl: env.escrow.rpcUrl,
    commitment: env.escrow.commitment,
    baseDecimals: env.escrow.baseDecimals,
    clearingAuthority,
    collateralMint,
    depositEnabled,
    explorerCluster: /127\.0\.0\.1|localhost/.test(env.escrow.rpcUrl) ? "custom" : undefined,
    note: depositEnabled
      ? "Bilateral escrow requires BOTH desks to sign initialize_escrow; the vault is a program-owned PDA."
      : "Real deposit disabled: set ESCROW_COLLATERAL_MINT and SOLANA_AUTHORITY_KEYPAIR to enable client-signed deposits.",
  });
});

/** GET /api/v1/escrow/config?partyA=..&partyB=.. → also returns the derived PDA. */
export const POST = withApi(async ({ req }) => {
  const url = new URL(req.url);
  const partyA = url.searchParams.get("partyA");
  const partyB = url.searchParams.get("partyB");
  if (!partyA || !partyB) {
    return NextResponse.json(
      { ok: false, error: "BAD_REQUEST", message: "partyA and partyB query params are required" },
      { status: 400 },
    );
  }
  let escrowPda: string | null = null;
  let error: string | null = null;
  try {
    escrowPda = deriveEscrowPda(partyA, partyB, env.escrow.programId).toBase58();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return NextResponse.json({ ok: error === null, escrowPda, error });
});
