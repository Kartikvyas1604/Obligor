/**
 * Client-side escrow builder tests: PDA/ATA derivation, instruction layout
 * (must match the committed Anchor IDL), and the partial-sign round trip used
 * by the two-party co-sign deposit flow.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ESCROW_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  associatedTokenAddress,
  buildInitializeEscrowIx,
  buildInitializeEscrowTx,
  deriveEscrowPda,
  deserializeEscrowTx,
  serializeEscrowTx,
} from "../lib/escrow-client";
import idl from "../lib/idl/obligor_escrow.json";

const partyA = Keypair.generate();
const partyB = Keypair.generate();
const clearing = Keypair.generate();
const mint = Keypair.generate().publicKey.toBase58();
const INIT_DISC = Buffer.from(idl.instructions.find((i) => i.name === "initialize_escrow")!.discriminator);

function params(aAmount = BigInt(1_000_000), bAmount = BigInt(2_000_000)) {
  return {
    partyA: partyA.publicKey.toBase58(),
    partyB: partyB.publicKey.toBase58(),
    mint,
    clearingAuthority: clearing.publicKey.toBase58(),
    partyAAmountBaseUnits: aAmount,
    partyBAmountBaseUnits: bAmount,
  };
}

test("deriveEscrowPda matches the [b'escrow', a, b] program address", () => {
  const pda = deriveEscrowPda(partyA.publicKey.toBase58(), partyB.publicKey.toBase58());
  const [expected] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), partyA.publicKey.toBuffer(), partyB.publicKey.toBuffer()],
    ESCROW_PROGRAM_ID,
  );
  assert.equal(pda.toBase58(), expected.toBase58());
});

test("deriveEscrowPda is order-sensitive (A,B ≠ B,A)", () => {
  const ab = deriveEscrowPda(partyA.publicKey.toBase58(), partyB.publicKey.toBase58());
  const ba = deriveEscrowPda(partyB.publicKey.toBase58(), partyA.publicKey.toBase58());
  assert.notEqual(ab.toBase58(), ba.toBase58());
});

test("associatedTokenAddress derives under the ATA program", () => {
  const ata = associatedTokenAddress(partyA.publicKey.toBase58(), mint);
  const [expected] = PublicKey.findProgramAddressSync(
    [partyA.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), new PublicKey(mint).toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  assert.equal(ata.toBase58(), expected.toBase58());
});

test("buildInitializeEscrowIx encodes the exact IDL discriminator + args", () => {
  const { instruction, escrowPda } = buildInitializeEscrowIx(params(BigInt(1_000_000), BigInt(2_000_000)));
  assert.equal(instruction.programId.toBase58(), ESCROW_PROGRAM_ID.toBase58());
  // data: 8 discriminator + 32 clearing + 8 + 8
  assert.equal(instruction.data.length, 56);
  assert.ok(instruction.data.subarray(0, 8).equals(INIT_DISC));
  assert.ok(instruction.data.subarray(8, 40).equals(clearing.publicKey.toBuffer()));
  assert.equal(instruction.data.readBigUInt64LE(40), BigInt(1_000_000));
  assert.equal(instruction.data.readBigUInt64LE(48), BigInt(2_000_000));
  assert.equal(instruction.keys[0].pubkey.toBase58(), escrowPda.toBase58());
});

test("buildInitializeEscrowIx orders accounts as the program expects", () => {
  const { instruction } = buildInitializeEscrowIx(params());
  const named = instruction.keys.map((k) => k.pubkey.toBase58());
  assert.equal(named[1], partyA.publicKey.toBase58());
  assert.equal(named[2], partyB.publicKey.toBase58());
  assert.equal(instruction.keys[1].isSigner, true);
  assert.equal(instruction.keys[2].isSigner, true);
  assert.equal(instruction.keys[7].pubkey.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  assert.equal(instruction.keys[8].pubkey.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
});

test("buildInitializeEscrowIx rejects a zero-collateral escrow", () => {
  assert.throws(() => buildInitializeEscrowIx(params(BigInt(0), BigInt(0))), /non-zero collateral/);
});

test("serialize/deserialize round trip preserves the instruction (partial-sign)", () => {
  const { transaction } = buildInitializeEscrowTx(params(), partyA.publicKey.toBase58());
  transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
  transaction.partialSign(partyA);
  const blob = serializeEscrowTx(transaction);
  const restored = deserializeEscrowTx(blob);
  assert.equal(restored.instructions.length, 1);
  assert.ok(restored.instructions[0].data.equals(transaction.instructions[0].data));
  assert.equal(restored.instructions[0].keys[0].pubkey.toBase58(), transaction.instructions[0].keys[0].pubkey.toBase58());
});
