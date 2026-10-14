/**
 * On-chain escrow settlement emitter (server-only).
 *
 * Builds and sends the `settle_and_release_excess` instruction against the
 * deployed `obligor-escrow` Anchor program using @solana/web3.js. The
 * instruction is assembled from the committed IDL discriminator — the same
 * bytes the program checks — so no client codegen drift is possible.
 *
 * The escrow is a PDA (`[b"escrow", party_a, party_b]`) and its vault is the
 * program-owned associated token account, so the program itself signs the
 * payout of freed collateral back to both desks. This module reads the escrow
 * account to resolve the mint / vault / parties and derives the party token
 * accounts (ATAs) rather than trusting caller-supplied addresses.
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

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

const ESCROW_STATUS = { Initialized: 0, Deposited: 1, Settled: 2, Liquidated: 3 } as const;

const settleIx = idl.instructions.find((i) => i.name === "settle_and_release_excess");
if (!settleIx) {
  // Compile-time-adjacent guard: the committed IDL must contain the instruction.
  throw new Error("obligor_escrow IDL is missing `settle_and_release_excess`");
}
const SETTLE_DISCRIMINATOR = Buffer.from(settleIx.discriminator);

export function escrowOnchainEnabled(): boolean {
  return env.escrow.realSettle;
}

/**
 * Public key of the configured clearing authority, or null when unset/unreadable.
 * Never exposes secret material — used only for discovery in the deposit UI.
 */
export function peekClearingAuthority(): string | null {
  try {
    return loadAuthority().publicKey.toBase58();
  } catch {
    return null;
  }
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

/** USD → integer base units at the collateral mint's decimals. Rejects bad input. */
function usdToBaseUnits(usd: number): bigint {
  if (!Number.isFinite(usd) || usd < 0) {
    throw new EscrowOnchainError(`nettedMarginUsd must be a finite non-negative number, got ${usd}`);
  }
  const decimals = env.escrow.baseDecimals;
  const scaled = usd * 10 ** decimals;
  if (!Number.isFinite(scaled) || scaled > Number.MAX_SAFE_INTEGER) {
    throw new EscrowOnchainError(`nettedMarginUsd ${usd} overflows at ${decimals} decimals`);
  }
  return BigInt(Math.round(scaled));
}

/** Deterministic [u8;32] proof hash: raw 64-hex if given, else sha256(string). */
function proofHashTo32(proof: string): Buffer {
  const hex = proof.trim();
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, "hex");
  return createHash("sha256").update(hex).digest();
}

/** Associated token account address for (owner, mint). */
function associatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export interface DecodedEscrow {
  partyA: PublicKey;
  partyB: PublicKey;
  clearingAuthority: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  partyASiloedIm: bigint;
  partyBSiloedIm: bigint;
  totalLockedUsd: bigint;
  freedCapitalUsd: bigint;
  status: number;
}

/** Decode the committed EscrowAccount layout (must mirror the Rust struct). */
function decodeEscrow(data: Buffer): DecodedEscrow {
  // 8 discriminator + 32*5 pubkeys + 1 bump + 8*4 u64 + 32 proof + 1 status + 8 created_at
  const minLen = 8 + 32 * 5 + 1 + 8 * 4 + 32 + 1 + 8;
  if (data.length < minLen) {
    throw new EscrowOnchainError(
      `escrow account data too short (${data.length} < ${minLen}) — wrong account or stale IDL`,
    );
  }
  const disc = Buffer.from((idl.accounts.find((a) => a.name === "EscrowAccount")!.discriminator));
  if (!data.subarray(0, 8).equals(disc)) {
    throw new EscrowOnchainError("escrow account discriminator mismatch — not an EscrowAccount");
  }
  let o = 8;
  const partyA = new PublicKey(data.subarray(o, (o += 32)));
  const partyB = new PublicKey(data.subarray(o, (o += 32)));
  const clearingAuthority = new PublicKey(data.subarray(o, (o += 32)));
  const mint = new PublicKey(data.subarray(o, (o += 32)));
  const vault = new PublicKey(data.subarray(o, (o += 32)));
  o += 1; // escrow_bump
  const partyASiloedIm = data.readBigUInt64LE(o);
  o += 8;
  const partyBSiloedIm = data.readBigUInt64LE(o);
  o += 8;
  const totalLockedUsd = data.readBigUInt64LE(o);
  o += 8; // total_locked_usd
  const freedCapitalUsd = data.readBigUInt64LE(o);
  o += 8; // freed_capital_usd
  o += 32; // proof_hash
  const status = data.readUInt8(o);
  return {
    partyA,
    partyB,
    clearingAuthority,
    mint,
    vault,
    partyASiloedIm,
    partyBSiloedIm,
    totalLockedUsd,
    freedCapitalUsd,
    status,
  };
}

function explorerUrl(signature: string): string {
  const rpc = env.escrow.rpcUrl;
  if (/127\.0\.0\.1|localhost/.test(rpc)) {
    return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(rpc)}`;
  }
  return `https://explorer.solana.com/tx/${signature}`;
}

export interface EscrowSnapshot {
  escrowAccount: string;
  programId: string;
  partyA: string;
  partyB: string;
  clearingAuthority: string;
  mint: string;
  vault: string;
  baseDecimals: number;
  totalLockedUsd: number;
  freedCapitalUsd: number;
  partyASiloedUsd: number;
  partyBSiloedUsd: number;
  status: "Initialized" | "Deposited" | "Settled" | "Liquidated" | "Unknown";
}

const STATUS_NAMES: Record<number, EscrowSnapshot["status"]> = {
  0: "Initialized",
  1: "Deposited",
  2: "Settled",
  3: "Liquidated",
};

/**
 * Read and decode a live escrow account. Read-only: no keypair required, so it
 * is safe to call from a verification endpoint. Throws loudly when the account
 * is missing, owned by another program, or undecodable.
 */
export async function readEscrowAccount(escrowAccount: string): Promise<EscrowSnapshot> {
  let escrowPk: PublicKey;
  try {
    escrowPk = new PublicKey(escrowAccount);
  } catch {
    throw new EscrowOnchainError(`escrowAccount is not a valid Solana pubkey: ${escrowAccount}`);
  }
  const programId = new PublicKey(env.escrow.programId);
  const connection = new Connection(env.escrow.rpcUrl, env.escrow.commitment);

  const info = await connection.getAccountInfo(escrowPk).catch((err) => {
    throw new EscrowOnchainError(
      `Could not read escrow account ${escrowAccount}: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  if (!info) {
    throw new EscrowOnchainError(`Escrow account ${escrowAccount} does not exist on ${env.escrow.rpcUrl}`);
  }
  if (!info.owner.equals(programId)) {
    throw new EscrowOnchainError(
      `Escrow account ${escrowAccount} is owned by ${info.owner.toBase58()}, not the escrow program ${programId.toBase58()}`,
    );
  }

  const escrow = decodeEscrow(Buffer.from(info.data));
  const scale = 10 ** env.escrow.baseDecimals;
  return {
    escrowAccount: escrowPk.toBase58(),
    programId: programId.toBase58(),
    partyA: escrow.partyA.toBase58(),
    partyB: escrow.partyB.toBase58(),
    clearingAuthority: escrow.clearingAuthority.toBase58(),
    mint: escrow.mint.toBase58(),
    vault: escrow.vault.toBase58(),
    baseDecimals: env.escrow.baseDecimals,
    totalLockedUsd: Number(escrow.totalLockedUsd) / scale,
    partyASiloedUsd: Number(escrow.partyASiloedIm) / scale,
    partyBSiloedUsd: Number(escrow.partyBSiloedIm) / scale,
    status: STATUS_NAMES[escrow.status] ?? "Unknown",
    freedCapitalUsd: Number(escrow.freedCapitalUsd) / scale,
  };
}

export interface SettlementTx {
  signature: string;
  slot: number;
  explorerUrl: string;
  programId: string;
  /** Release split exactly as the program computed it (USD at the mint's decimals). */
  totalLockedUsd: number;
  nettedMarginUsd: number;
  releasedToAUsd: number;
  releasedToBUsd: number;
}

/**
 * Emit a real settlement transaction. Throws on any configuration error, RPC
 * failure, or program error — callers must treat a throw as "not settled".
 */
export async function emitSettlement(params: {
  escrowAccount: string;
  nettedMarginUsd: number;
  proofHash: string;
  /** When provided, must match the on-chain locked total (fail closed otherwise). */
  expectedTotalLockedUsd?: number;
}): Promise<SettlementTx> {
  const { escrowAccount, nettedMarginUsd, proofHash, expectedTotalLockedUsd } = params;

  let escrowPk: PublicKey;
  try {
    escrowPk = new PublicKey(escrowAccount);
  } catch {
    throw new EscrowOnchainError(`escrowAccount is not a valid Solana pubkey: ${escrowAccount}`);
  }

  const authority = loadAuthority();
  const programId = new PublicKey(env.escrow.programId);
  const connection = new Connection(env.escrow.rpcUrl, env.escrow.commitment);

  const info = await connection.getAccountInfo(escrowPk).catch((err) => {
    throw new EscrowOnchainError(
      `Could not read escrow account ${escrowAccount}: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  if (!info) {
    throw new EscrowOnchainError(`Escrow account ${escrowAccount} does not exist on ${env.escrow.rpcUrl}`);
  }
  if (!info.owner.equals(programId)) {
    throw new EscrowOnchainError(
      `Escrow account ${escrowAccount} is owned by ${info.owner.toBase58()}, not the escrow program ${programId.toBase58()}`,
    );
  }

  const escrow = decodeEscrow(Buffer.from(info.data));
  if (escrow.status !== ESCROW_STATUS.Deposited) {
    throw new EscrowOnchainError(
      `Escrow ${escrowAccount} is not in Deposited status (status=${escrow.status}); refusing to settle`,
    );
  }
  if (!escrow.clearingAuthority.equals(authority.publicKey)) {
    throw new EscrowOnchainError(
      `Clearing authority mismatch: escrow expects ${escrow.clearingAuthority.toBase58()}, keypair is ${authority.publicKey.toBase58()}`,
    );
  }

  const baseUnits = usdToBaseUnits(nettedMarginUsd);
  if (baseUnits > escrow.totalLockedUsd) {
    throw new EscrowOnchainError(
      `netted margin (${baseUnits}) must not exceed total locked (${escrow.totalLockedUsd})`,
    );
  }

  if (expectedTotalLockedUsd !== undefined) {
    const expectedBase = usdToBaseUnits(expectedTotalLockedUsd);
    if (expectedBase !== escrow.totalLockedUsd) {
      throw new EscrowOnchainError(
        `totalLockedUsd mismatch: request says ${expectedBase} base units, escrow holds ${escrow.totalLockedUsd}`,
      );
    }
  }

  // Mirror the program's u128 proportional split exactly (BigInt floors like u128 division).
  const freed = escrow.totalLockedUsd - baseUnits;
  const releaseA = (freed * escrow.partyASiloedIm) / escrow.totalLockedUsd;
  const releaseB = freed - releaseA;
  const scale = 10 ** env.escrow.baseDecimals;

  const partyAToken = associatedTokenAddress(escrow.mint, escrow.partyA);
  const partyBToken = associatedTokenAddress(escrow.mint, escrow.partyB);

  const amount = Buffer.alloc(8);
  amount.writeBigUInt64LE(baseUnits);
  const data = Buffer.concat([SETTLE_DISCRIMINATOR, amount, proofHashTo32(proofHash)]);

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: escrowPk, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: escrow.mint, isSigner: false, isWritable: false },
      { pubkey: escrow.vault, isSigner: false, isWritable: true },
      { pubkey: partyAToken, isSigner: false, isWritable: true },
      { pubkey: partyBToken, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(instruction);
  log.info("submitting escrow settlement", {
    escrowAccount,
    nettedMarginUsd,
    baseUnits: baseUnits.toString(),
    partyAToken: partyAToken.toBase58(),
    partyBToken: partyBToken.toBase58(),
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
  return {
    signature,
    slot,
    explorerUrl: explorerUrl(signature),
    programId: programId.toBase58(),
    totalLockedUsd: Number(escrow.totalLockedUsd) / scale,
    nettedMarginUsd: Number(baseUnits) / scale,
    releasedToAUsd: Number(releaseA) / scale,
    releasedToBUsd: Number(releaseB) / scale,
  };
}
