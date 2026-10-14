/**
 * Client-side builder for the obligor-escrow `initialize_escrow` instruction.
 *
 * Browser-safe (no Node APIs): it derives the escrow PDA + vault, assembles the
 * instruction from the committed IDL discriminator, and produces a legacy
 * Transaction for the desks' own wallets to sign. Obligor never holds a desk
 * key. Bilateral escrow needs BOTH parties' signatures, so this module supports
 * a two-step co-sign flow: Party A partially signs and hands off the serialized
 * transaction; Party B adds their signature and submits.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import idl from "./idl/obligor_escrow.json";

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
export const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

export const ESCROW_PROGRAM_ID = new PublicKey(idl.address);

const initIx = idl.instructions.find((i) => i.name === "initialize_escrow");
if (!initIx) throw new Error("obligor_escrow IDL is missing `initialize_escrow`");
const INIT_DISCRIMINATOR = Buffer.from(initIx.discriminator);

export class EscrowClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EscrowClientError";
  }
}

export interface EscrowParties {
  partyA: string;
  partyB: string;
  mint: string;
  /** Pubkey of the clearing authority allowed to settle this escrow. */
  clearingAuthority: string;
  /** Collateral in the mint's base units (integer). */
  partyAAmountBaseUnits: bigint;
  partyBAmountBaseUnits: bigint;
  programId?: string;
}

function pk(value: string, field: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new EscrowClientError(`${field} is not a valid Solana pubkey: ${value}`);
  }
}

/** Escrow PDA: `[b"escrow", party_a, party_b]` under the escrow program. */
export function deriveEscrowPda(
  partyA: string,
  partyB: string,
  programId: string = ESCROW_PROGRAM_ID.toBase58(),
): PublicKey {
  const a = pk(partyA, "partyA");
  const b = pk(partyB, "partyB");
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), a.toBuffer(), b.toBuffer()],
    pk(programId, "programId"),
  )[0];
}

/** Vault: the escrow PDA's associated token account for the collateral mint. */
export function deriveVault(escrowPda: PublicKey, mint: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [escrowPda.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), pk(mint, "mint").toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/** Associated token account address for (owner, mint). */
export function associatedTokenAddress(owner: string, mint: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [pk(owner, "owner").toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), pk(mint, "mint").toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

function writeU64LE(value: bigint): Buffer {
  if (value < BigInt(0)) throw new EscrowClientError("collateral amount must be non-negative");
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

/** Assemble the `initialize_escrow` instruction with all accounts resolved. */
export function buildInitializeEscrowIx(params: EscrowParties): {
  instruction: TransactionInstruction;
  escrowPda: PublicKey;
  vault: PublicKey;
} {
  if (params.partyAAmountBaseUnits <= BigInt(0) && params.partyBAmountBaseUnits <= BigInt(0)) {
    throw new EscrowClientError("at least one party must deposit a non-zero collateral amount");
  }
  const programIdPk = pk(params.programId ?? ESCROW_PROGRAM_ID.toBase58(), "programId");
  const partyAPk = pk(params.partyA, "partyA");
  const partyBPk = pk(params.partyB, "partyB");
  const clearing = pk(params.clearingAuthority, "clearingAuthority");
  const mintPk = pk(params.mint, "mint");

  const escrowPda = deriveEscrowPda(params.partyA, params.partyB, programIdPk.toBase58());
  const vault = deriveVault(escrowPda, params.mint);
  const partyAToken = associatedTokenAddress(params.partyA, params.mint);
  const partyBToken = associatedTokenAddress(params.partyB, params.mint);

  const data = Buffer.concat([
    INIT_DISCRIMINATOR,
    clearing.toBuffer(),
    writeU64LE(params.partyAAmountBaseUnits),
    writeU64LE(params.partyBAmountBaseUnits),
  ]);

  const instruction = new TransactionInstruction({
    programId: programIdPk,
    keys: [
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: partyAPk, isSigner: true, isWritable: true },
      { pubkey: partyBPk, isSigner: true, isWritable: true },
      { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: partyAToken, isSigner: false, isWritable: true },
      { pubkey: partyBToken, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  return { instruction, escrowPda, vault };
}

/** Build a legacy Transaction (fee payer = Party A) awaiting both signatures. */
export function buildInitializeEscrowTx(
  params: EscrowParties,
  feePayer: string,
): { transaction: Transaction; escrowPda: PublicKey; vault: PublicKey } {
  const { instruction, escrowPda, vault } = buildInitializeEscrowIx(params);
  const tx = new Transaction().add(instruction);
  tx.feePayer = pk(feePayer, "feePayer");
  return { transaction: tx, escrowPda, vault };
}

/**
 * Serialize a (possibly partially signed) transaction to base64 so it can be
 * handed to the counterparty for co-signing. Signatures are collected, not
 * required, at this stage.
 */
export function serializeEscrowTx(tx: Transaction): string {
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}

export function deserializeEscrowTx(base64: string): Transaction {
  return Transaction.from(Buffer.from(base64, "base64"));
}

export function makeConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, "confirmed");
}
