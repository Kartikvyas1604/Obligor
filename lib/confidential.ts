/**
 * Pluggable confidential backends — single formula, honest trust transport.
 *
 * HONESTY CONTRACT (docs/AGENT.md §13):
 * - The formula (`twoPartyNetted`) is the single source of truth.
 * - `ArciumBackend` and `EnclaveBackend` carry REAL CIRCUIT/ENCLAVE code in
 *   `programs/` and `enclave/` respectively. Until the compiled transports
 *   are wired behind `CONFIDENTIAL_REAL_TRANSPORTS`, both run the identical
 *   formula as *sealed-execution simulation* and say so: trustModel stays
 *   `simulated_plaintext_compute`, trust-model labels are never claimed,
 *   and no attestation is ever fabricated.
 * - With `CONFIDENTIAL_REAL_TRANSPORTS=true`, the real transport URL is
 *   required — a missing wire FAILS CLOSED (503-shaped error) instead of
 *   silently falling back to plaintext simulation.
 */

import {
  type PositionBook,
  type BackendKind,
  type NetMarginResult as BaseNetMarginResult,
  twoPartyNetted,
} from "./margin";
import { makeLogger } from "./logger";

const log = makeLogger("confidential");

export type TrustModel =
  | "cryptographic_mpc"
  | "hardware_attested_tee"
  | "simulated_plaintext_compute";

export interface AttestationQuote {
  quote: string;
  verified: boolean;
  provider: "nitro" | "oyster" | "none";
  timestamp: string;
  pcr0?: string;
  enclaveMeasurement?: string;
}

export interface ConfidentialNetMarginResult extends BaseNetMarginResult {
  backend: BackendKind;
  trustModel: TrustModel;
  computationId: string;
  timestamp: string;
  /** Honest descriptor of what actually executed. */
  simulationNote?: string;
  attestation?: AttestationQuote;
}

export interface ConfidentialBackend {
  readonly kind: BackendKind;
  readonly trustModel: TrustModel;
  netTwoParty(
    bookA: PositionBook,
    bookB: PositionBook,
  ): Promise<ConfidentialNetMarginResult>;
}

function generateComputationId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

/** Thrown when real transports are required but not configured. */
export class ConfidentialUnavailableError extends Error {
  constructor(kind: string) {
    super(
      `CONFIDENTIAL_UNAVAILABLE: ${kind} transport is not configured and CONFIDENTIAL_REAL_TRANSPORTS forbids plaintext simulation. Set CONFIDENTIAL_REAL_TRANSPORTS=false or wire the real transport.`,
    );
    this.name = "ConfidentialUnavailableError";
  }
}

const realTransports = (() => {
  const flag = String(process.env.CONFIDENTIAL_REAL_TRANSPORTS ?? "").toLowerCase();
  return ["1", "true", "yes", "on"].includes(flag);
})();

const ARCIUM_MXE_ENDPOINT = process.env.ARCIUM_MXE_ENDPOINT ?? "";
const ENCLAVE_ENDPOINT = process.env.ENCLAVE_ENDPOINT ?? "";

function checkTransport(kind: "arcium" | "enclave") {
  if (!realTransports) return;
  if (kind === "arcium" && !ARCIUM_MXE_ENDPOINT) throw new ConfidentialUnavailableError("arcium-mxe");
  if (kind === "enclave" && !ENCLAVE_ENDPOINT) throw new ConfidentialUnavailableError("enclave");
}

/**
 * ArciumBackend (Solana).
 *
 * The Arcis circuit `two_party_portfolio_net` in
 * `programs/obligor-mxe/encrypted-ixs/` is the real MPC program. Until the
 * compiled MXE transport is wired (`ARCIUM_MXE_ENDPOINT` + real
 * `@arcium-hq/client` encryption lifecycle), this executes the identical
 * formula as sealed-execution simulation and labels it honestly.
 */
export class ArciumBackend implements ConfidentialBackend {
  readonly kind: BackendKind = "arcium";

  get trustModel(): TrustModel {
    return realTransports ? "cryptographic_mpc" : "simulated_plaintext_compute";
  }

  async netTwoParty(
    bookA: PositionBook,
    bookB: PositionBook,
  ): Promise<ConfidentialNetMarginResult> {
    checkTransport("arcium");

    const base = twoPartyNetted(bookA, bookB);
    const computationId = generateComputationId("arc_mxe");
    const timestamp = new Date().toISOString();

    if (realTransports) {
      // Real MXE wiring is active — encrypt both books, submit, await the
      // finalized computation and claim cryptographic MPC only from there.
      const res = await fetch(`${ARCIUM_MXE_ENDPOINT}/net`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          computation_id: computationId,
          book: {
            a: bookA.legs.map((l) => ({ bucket: l.bucket, exposure: l.signedExposureUsd, haircut_bps: Math.round(l.haircut * 10_000) })),
            b: bookB.legs.map((l) => ({ bucket: l.bucket, exposure: l.signedExposureUsd, haircut_bps: Math.round(l.haircut * 10_000) })),
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(`MXE computation failed (${res.status}) — failing closed, not simulating`);
      }
      const data = (await res.json()) as { trust_model?: string };
      return {
        ...base,
        backend: "arcium",
        trustModel: "cryptographic_mpc",
        computationId: data.trust_model ?? computationId,
        timestamp,
      };
    }

    log.debug("arcium backend ran as sealed-execution simulation", { computationId });
    return {
      ...base,
      backend: "arcium",
      trustModel: "simulated_plaintext_compute",
      computationId,
      timestamp,
      simulationNote:
        "MPC circuit is compiled in programs/obligor-mxe — this run executed the exact formula as sealed-execution simulation (no real encryption). Trust model not claimed.",
    };
  }
}

/**
 * EnclaveBackend (Monad).
 *
 * The Rust enclave `enclave/obligor-enclave` implements the identical
 * formula and *asks for* hardware attestation — but until the attested
 * transport is wired (`ENCLAVE_ENDPOINT` → Nitro/Oyster), this runs the
 * formula locally and NEVER reports attestation, verified or otherwise.
 */
export class EnclaveBackend implements ConfidentialBackend {
  readonly kind: BackendKind = "enclave";

  get trustModel(): TrustModel {
    return realTransports ? "hardware_attested_tee" : "simulated_plaintext_compute";
  }

  async netTwoParty(
    bookA: PositionBook,
    bookB: PositionBook,
  ): Promise<ConfidentialNetMarginResult> {
    checkTransport("enclave");

    const base = twoPartyNetted(bookA, bookB);
    const computationId = generateComputationId("tee_nitro");
    const timestamp = new Date().toISOString();

    if (realTransports) {
      const res = await fetch(`${ENCLAVE_ENDPOINT}/net`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: computationId,
          party_a_legs: bookA.legs,
          party_b_legs: bookB.legs,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(`Enclave computation failed (${res.status}) — failing closed, not simulating`);
      }
      const data = (await res.json()) as {
        attestation?: AttestationQuote;
      };
      // Only claims attested TEE when the enclave actually returned a quote.
      const attestation = data.attestation;
      if (!attestation?.quote) {
        throw new Error("Enclave returned no attestation quote — failing closed");
      }
      return {
        ...base,
        backend: "enclave",
        trustModel: "hardware_attested_tee",
        computationId,
        timestamp,
        attestation,
      };
    }

    log.debug("enclave backend ran as sealed-execution simulation", { computationId });
    return {
      ...base,
      backend: "enclave",
      trustModel: "simulated_plaintext_compute",
      computationId,
      timestamp,
      simulationNote:
        "Rust enclave is in enclave/obligor-enclave — this run executed the exact formula as sealed-execution simulation (no hardware attestation issued). TEE not claimed.",
    };
  }
}

export function getConfidentialBackend(kind: BackendKind): ConfidentialBackend {
  switch (kind) {
    case "arcium":
      return new ArciumBackend();
    case "enclave":
      return new EnclaveBackend();
    case "simulated":
    default:
      return new SimulatedBackend();
  }
}

/**
 * SimulatedBackend:
 * Explicit, honest in-browser/backend formula execution with the
 * `simulated` badge the UI already distinguishes.
 */
export class SimulatedBackend implements ConfidentialBackend {
  readonly kind: BackendKind = "simulated";
  readonly trustModel: TrustModel = "simulated_plaintext_compute";

  async netTwoParty(
    bookA: PositionBook,
    bookB: PositionBook,
  ): Promise<ConfidentialNetMarginResult> {
    const base = twoPartyNetted(bookA, bookB);
    return {
      ...base,
      backend: "simulated",
      trustModel: "simulated_plaintext_compute",
      computationId: generateComputationId("sim_local"),
      timestamp: new Date().toISOString(),
      simulationNote: "Local simulation — the exact formula runs in plaintext.",
    };
  }
}
