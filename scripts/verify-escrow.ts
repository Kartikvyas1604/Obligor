/**
 * Opt-in end-to-end escrow integration test (localnet / devnet).
 *
 *   set -a; . ./.escrow-local.env; set +a   # from scripts/escrow-local.sh
 *   npm run verify:escrow
 *
 * Drives the REAL obligor-escrow program: initializes a bilateral vault with
 * SPL collateral into the escrow PDA, settles net margin via the exact
 * instruction the API emits, then decodes on-chain state AND token balances to
 * prove the release actually moved funds. If the RPC is unreachable the test
 * SKIPS (exit 0) so it is safe in default CI.
 *
 * It never runs against mainnet — a non-local RPC must opt in explicitly.
 */

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import idl from "../lib/idl/obligor_escrow.json";

const RPC = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const PROGRAM_ID = new PublicKey(
  process.env.ESCROW_PROGRAM_ID ?? "94YmMnGjq2U8zpsLMSuk9fMwnfcHqrft3CtmwuZidMkZ",
);
const AUTH_PATH = process.env.SOLANA_AUTHORITY_KEYPAIR ?? "";
const DECIMALS = 6;

const ESCROW_STATUS = { Initialized: 0, Deposited: 1, Settled: 2, Liquidated: 3 } as const;

function disc(name: string): Buffer {
  const ix = idl.instructions.find((i) => i.name === name);
  if (!ix) throw new Error(`IDL missing instruction ${name}`);
  return Buffer.from(ix.discriminator);
}
function u64(n: number | bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}
function load(path: string, label: string): Keypair {
  if (!path) throw new Error(`${label} path not set`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}
function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

function escrowPda(partyA: PublicKey, partyB: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), partyA.toBuffer(), partyB.toBuffer()],
    PROGRAM_ID,
  )[0];
}

async function main(): Promise<void> {
  const connection = new Connection(RPC, "confirmed");

  try {
    await connection.getVersion();
  } catch {
    console.log(`SKIP verify:escrow — no reachable RPC at ${RPC}`);
    process.exit(0);
  }

  const isLocal = /127\.0\.0\.1|localhost/.test(RPC);
  if (!isLocal && process.env.ESCROW_ALLOW_REMOTE !== "true") {
    console.log(`SKIP verify:escrow — refusing non-local RPC ${RPC} (set ESCROW_ALLOW_REMOTE=true to override)`);
    process.exit(0);
  }

  console.log(`▸ RPC          ${RPC}`);
  console.log(`▸ program      ${PROGRAM_ID.toBase58()}`);

  const authority = load(AUTH_PATH, "SOLANA_AUTHORITY_KEYPAIR");
  const payer = authority;

  const deployed = await connection.getAccountInfo(PROGRAM_ID);
  ok(deployed !== null && deployed.executable, `program is deployed & executable`);

  // --- fund two desks -------------------------------------------------------
  const partyA = Keypair.generate();
  const partyB = Keypair.generate();
  for (const [label, kp] of [["party A", partyA], ["party B", partyB]] as const) {
    const sig = await connection.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    console.log(`  ✓ funded ${label} ${kp.publicKey.toBase58()}`);
  }

  // --- SPL collateral (6 decimals, USDC-like) -------------------------------
  const mint = await createMint(connection, authority, authority.publicKey, null, DECIMALS);
  const ataA = await getOrCreateAssociatedTokenAccount(connection, payer, mint, partyA.publicKey);
  const ataB = await getOrCreateAssociatedTokenAccount(connection, payer, mint, partyB.publicKey);

  // Amounts in base units: A locks 100, B locks 50 (USD at 6dp), net 30.
  const partyAAmount = 100_000_000;
  const partyBAmount = 50_000_000;
  const totalLocked = partyAAmount + partyBAmount;
  await mintTo(connection, payer, mint, ataA.address, authority, totalLocked * 2);
  await mintTo(connection, payer, mint, ataB.address, authority, totalLocked * 2);
  console.log(`  ✓ minted collateral (mint ${mint.toBase58()}, ${DECIMALS}dp)`);

  const escrow = escrowPda(partyA.publicKey, partyB.publicKey);
  const vault = await getAssociatedTokenAddress(mint, escrow, true);
  console.log(`  ✓ escrow PDA   ${escrow.toBase58()}`);
  console.log(`  ✓ vault ATA    ${vault.toBase58()}`);

  // --- initialize_escrow ----------------------------------------------------
  const initData = Buffer.concat([
    disc("initialize_escrow"),
    authority.publicKey.toBuffer(),
    u64(partyAAmount),
    u64(partyBAmount),
  ]);
  const initTx = new Transaction().add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: escrow, isSigner: false, isWritable: true },
        { pubkey: partyA.publicKey, isSigner: true, isWritable: true },
        { pubkey: partyB.publicKey, isSigner: true, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: ataA.address, isSigner: false, isWritable: true },
        { pubkey: ataB.address, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: initData,
    }),
  );
  const initSig = await sendAndConfirmTransaction(connection, initTx, [authority, partyA, partyB]);
  console.log(`  ✓ initialize_escrow  ${initSig}`);

  const vaultAfterInit = await getAccount(connection, vault);
  ok(vaultAfterInit.amount === BigInt(totalLocked), `vault holds ${totalLocked} locked collateral`);

  // Seed-only mode: leave a fresh Deposited escrow behind for API testing.
  if (process.env.ESCROW_SEED_ONLY === "true") {
    console.log(`\n🔑 seeded escrow (status=Deposited): ${escrow.toBase58()}`);
    console.log(`   POST /api/v1/escrow/settle with escrowAccount=${escrow.toBase58()}`);
    return;
  }

  // --- settle_and_release_excess -------------------------------------------
  const nettedMarginUsd = 30_000_000; // base units (30 USD at 6dp)
  const proofHash = randomBytes(32);
  const settleTx = new Transaction().add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: escrow, isSigner: false, isWritable: true },
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: ataA.address, isSigner: false, isWritable: true },
        { pubkey: ataB.address, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([disc("settle_and_release_excess"), u64(nettedMarginUsd), proofHash]),
    }),
  );
  const ataABefore = (await getAccount(connection, ataA.address)).amount;
  const ataBBefore = (await getAccount(connection, ataB.address)).amount;
  const settleSig = await sendAndConfirmTransaction(connection, settleTx, [authority]);
  console.log(`  ✓ settle_and_release_excess  ${settleSig}`);

  const conf = await connection.getTransaction(settleSig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  ok(conf !== null && conf.meta !== null && conf.meta.err === null, "settle tx confirmed with no error");

  // Expected proportional split (u128 in-program, mirrored here).
  const freed = totalLocked - nettedMarginUsd;
  const expectedReleaseA = Math.floor((freed * partyAAmount) / totalLocked);
  const expectedReleaseB = freed - expectedReleaseA;

  // --- decode + assert on-chain state --------------------------------------
  const info = await connection.getAccountInfo(escrow);
  ok(info !== null, "escrow account exists");
  const d = info!.data;
  let o = 8; // skip anchor discriminator
  const partyAOnchain = new PublicKey(d.subarray(o, o + 32));
  o += 32;
  const partyBOnchain = new PublicKey(d.subarray(o, o + 32));
  o += 32;
  o += 32; // clearing_authority
  o += 32; // mint
  const vaultOnchain = new PublicKey(d.subarray(o, o + 32));
  o += 32;
  o += 1; // escrow_bump
  const siloedA = d.readBigUInt64LE(o);
  o += 8;
  const siloedB = d.readBigUInt64LE(o);
  o += 8;
  const totalOnchain = d.readBigUInt64LE(o);
  o += 8;
  const freedOnchain = d.readBigUInt64LE(o);
  o += 8;
  o += 32; // proof_hash
  const status = d.readUInt8(o);
  o += 1;

  ok(partyAOnchain.equals(partyA.publicKey), "party A pubkey round-trips");
  ok(partyBOnchain.equals(partyB.publicKey), "party B pubkey round-trips");
  ok(vaultOnchain.equals(vault), "vault PDA round-trips");
  ok(siloedA === BigInt(partyAAmount) && siloedB === BigInt(partyBAmount), "siloed margin recorded");
  ok(totalOnchain === BigInt(totalLocked), "total locked recorded");
  ok(status === ESCROW_STATUS.Settled, "status == Settled");
  ok(freedOnchain === BigInt(freed), `freed capital == ${freed}`);

  // --- assert funds actually moved -----------------------------------------
  const vaultAfter = await getAccount(connection, vault);
  const ataAAfter = await getAccount(connection, ataA.address);
  const ataBAfter = await getAccount(connection, ataB.address);
  ok(vaultAfter.amount === BigInt(nettedMarginUsd), `vault retains netted margin ${nettedMarginUsd}`);
  ok(
    ataAAfter.amount - ataABefore === BigInt(expectedReleaseA),
    `party A received released excess ${expectedReleaseA}`,
  );
  ok(
    ataBAfter.amount - ataBBefore === BigInt(expectedReleaseB),
    `party B received released excess ${expectedReleaseB}`,
  );

  const explorer = isLocal
    ? `https://explorer.solana.com/tx/${settleSig}?cluster=custom&customUrl=${encodeURIComponent(RPC)}`
    : `https://explorer.solana.com/tx/${settleSig}`;
  console.log(`\n✅ verify:escrow PASSED\n   settle: ${settleSig}\n   ${explorer}`);
}

main().catch((err) => {
  console.error(`\n✗ verify:escrow FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
