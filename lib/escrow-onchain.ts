/**
 * On-chain escrow settlement emitter (server-only).
 *
 * Builds and sends the `settle_and_release_excess` instruction against the
 * deployed `obligor-escrow` Anchor program using @solana/web3.js. The
 * instruction is assembled from the committed IDL discriminator — the same
 * bytes the program checks — so no client codegen drift is possible.
 *
 * Enabled only when ESCROW_REAL_SETTLE=true. Any failure THROWS: the API layer
 * fails closed and never returns a fabricated transaction signature.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import idl from "./idl/obligor_escrow.json";
import { env } from "./env";
import { makeLogger } from "./logger";

const log = makeLogger("escrow-onchain");

export class EscrowOnchainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EscrowOnchainError";
  }
}

const settleIx = idl.instructions.find((i) => i.name === "settle_and_release_excess");
if (!settleIx) {
  // Compile-time-adjacent guard: the committed IDL must contain the instruction.
  throw new Error("obligor_escrow IDL is missing `settle_and_release_excess`");
}
const SETTLE_DISCRIMINATOR = Buffer.from(settleIx.discriminator);

export function escrowOnchainEnabled(): boolean {
  return env.escrow.realSettle;
}

/** Load the clearing-authority keypair from a Solana CLI JSON keypair file. */
function loadAuthority(): Keypair {
  const path = env.escrow.authorityKeypair;
  if (!path) {
    throw new EscrowOnchainError(
      "ESCROW_REAL_SETTLE is on but SOLANA_AUTHORITY_KEYPAIR is not set (path to a JSON keypair).",
    );
  }
  let bytes: number[];
  try {
    bytes = JSON.parse(readFileSync(path, "utf8")) as number[];
  } catch (err) {
    throw new EscrowOnchainError(
      `Could not read SOLANA_AUTHORITY_KEYPAIR at ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch {
    throw new EscrowOnchainError("SOLANA_AUTHORITY_KEYPAIR is not a valid 64-byte secret key array");
  }
}

/** USD (2dp) → integer cents, the on-chain unit. Rejects non-finite input. */
function usdToCents(usd: number): bigint {
  if (!Number.isFinite(usd) || usd < 0) {
    throw new EscrowOnchainError(`nettedMarginUsd must be a finite non-negative number, got ${usd}`);
  }
  return BigInt(Math.round(usd * 100));
}

/** Deterministic [u8;32] proof hash: raw 64-hex if given, else sha256(string). */
function proofHashTo32(proof: string): Buffer {
  const hex = proof.trim();
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, "hex");
  return createHash("sha256").update(hex).digest();
}

function explorerUrl(signature: string): string {
  const rpc = env.escrow.rpcUrl;
  if (/127\.0\.0\.1|localhost/.test(rpc)) {
    return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(rpc)}`;
  }
  return `https://explorer.solana.com/tx/${signature}`;
}

export interface SettlementTx {
  signature: string;
  slot: number;
  explorerUrl: string;
  programId: string;
}

/**
 * Emit a real settlement transaction. Throws on any configuration error, RPC
 * failure, or program error — callers must treat a throw as "not settled".
 */
export async function emitSettlement(params: {
  escrowAccount: string;
  nettedMarginUsd: number;
  proofHash: string;
}): Promise<SettlementTx> {
  const { escrowAccount, nettedMarginUsd, proofHash } = params;

  let escrowPk: PublicKey;
  try {
    escrowPk = new PublicKey(escrowAccount);
  } catch {
    throw new EscrowOnchainError(`escrowAccount is not a valid Solana pubkey: ${escrowAccount}`);
  }

  const authority = loadAuthority();
  const programId = new PublicKey(env.escrow.programId);
  const connection = new Connection(env.escrow.rpcUrl, env.escrow.commitment);

  const cents = usdToCents(nettedMarginUsd);
  const amount = Buffer.alloc(8);
  amount.writeBigUInt64LE(cents);
  const data = Buffer.concat([SETTLE_DISCRIMINATOR, amount, proofHashTo32(proofHash)]);

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: escrowPk, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(instruction);
  log.info("submitting escrow settlement", {
    escrowAccount,
    nettedMarginUsd,
    cents: cents.toString(),
    programId: programId.toBase58(),
    rpc: env.escrow.rpcUrl,
  });

  let signature: string;
  try {
    signature = await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: env.escrow.commitment,
    });
  } catch (err) {
    throw new EscrowOnchainError(
      `On-chain settlement failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const slot = await connection.getSlot(env.escrow.commitment).catch(() => 0);
  log.info("escrow settlement confirmed", { signature, slot });
  return { signature, slot, explorerUrl: explorerUrl(signature), programId: programId.toBase58() };
}
