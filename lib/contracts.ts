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

export const walletSchema = z
  .string()
  .trim()
  .min(32)
  .max(64)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Must be a base58 / EVM-style address (no spaces, no 0/O/I/l for Solana)");

export { chainSchema };
