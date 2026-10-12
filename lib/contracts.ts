/**
 * Shared request/response contracts (single source of truth for route
 * validation). Imported by API routes so every endpoint validates the same
 * shapes — one more thing that can't drift between handlers.
 */

import { z } from "zod";
import { chainSchema } from "./env";

export const backendKindSchema = z.enum(["arcium", "enclave", "simulated"]);
export type BackendKindInput = z.infer<typeof backendKindSchema>;

export const rawLegSchema = z.object({
  venue: z.enum(["drift", "kamino", "mock_equity", "monad_fixture", "manual"]).default("manual"),
  instrument: z.string().trim().min(1).max(40),
  bucket: z.string().trim().min(1).max(8),
  side: z.enum(["long", "short", "lend", "borrow"]),
  qty: z.number().positive().max(1_000_000),
  markUsd: z.number().positive().max(10_000_000),
  haircut: z.number().min(0).max(1).optional(),
});

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * A wallet address on either supported chain: a Solana base58 pubkey, or an
 * EVM/Monad `0x`-prefixed 20-byte hex address. Rejects everything else.
 */
export const walletSchema = z
  .string()
  .trim()
  .refine(
    (v) => SOLANA_ADDRESS.test(v) || EVM_ADDRESS.test(v),
    "Must be a Solana base58 public key or an EVM 0x-prefixed address",
  );

export { chainSchema };
