/**
 * Computation registry — in-memory record of every committed confidential
 * computation. Backs the J2 verify endpoint: the record stores ONLY hashes,
 * never plaintext legs, so `verify` never even needs to read either book.
 *
 * Like the in-memory rate limiter, the registry is per-instance. A Redis /
 * Postgres store can slot in behind this interface later without touching the
 * routes.
 */

import { makeLogger } from "./logger";

const log = makeLogger("computation-registry");

export interface ComputationRecord {
  computationId: string;
  chain: "solana" | "monad";
  backendKind: string;
  commitmentHash: string;
  /** partyId -> sha256 of that party's canonical legs */
  partyLegHashes: Record<string, string>;
  /** Aggregate scalar both parties were shown — not a book, never a leg. */
  combinedNettedUsd: number;
  grossNotionalUsd: number;
  perPartySiloedUsd: Record<string, number>;
  createdAt: number;
}

const globalForRegistry = globalThis as unknown as { __obligorComputations?: Map<string, ComputationRecord> };
const registry: Map<string, ComputationRecord> =
  (globalForRegistry.__obligorComputations ??= new Map());

export function registerComputation(record: ComputationRecord): ComputationRecord {
  registry.set(record.computationId, record);
  log.debug("computation committed", {
    computationId: record.computationId,
    chain: record.chain,
    backendKind: record.backendKind,
  });
  return record;
}

export function getComputation(computationId: string): ComputationRecord | null {
  return registry.get(computationId) ?? null;
}

/** Live privacy-invariant check: confirm the registry holds no plaintext legs. */
export function registryStoresLegs(): boolean {
  for (const record of registry.values()) {
    const r = record as unknown as Record<string, unknown>;
    if ("legs" in r || "legsA" in r || "legsB" in r || Array.isArray(r.partyLegs)) {
      return true;
    }
  }
  return false;
}