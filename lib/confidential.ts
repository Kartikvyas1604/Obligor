/**
 * Pluggable confidential backends — single formula, honest trust transport.
 *
 * HONESTY CONTRACT (docs/AGENT.md §13):
 * - The formula (`twoPartyNetted`) is the single source of truth.
 * - `ArciumBackend` carries the real Arcis circuit in `mxe/`, but the Arcium
 *   MXE encryption lifecycle is NOT wired in this build. It therefore ALWAYS
 *   runs the identical formula as *sealed-execution simulation* and reports
 *   `simulated_plaintext_compute`. With `CONFIDENTIAL_REAL_TRANSPORTS=true` it
 *   FAILS CLOSED rather than pretending a plaintext POST is cryptographic MPC —
 *   `cryptographic_mpc` is never returned.
 * - `EnclaveBackend` carries the real Rust enclave in `enclave/`. With
 *   `CONFIDENTIAL_REAL_TRANSPORTS=true` and `ENCLAVE_ENDPOINT` set it runs the
 *   formula over that real HTTP wire. `hardware_attested_tee` is claimed ONLY
 *   when the enclave returns a verified hardware quote; an un-attested run
 *   reports `simulated_plaintext_compute` with a note (never a fabricated
 *   attestation). A missing wire FAILS CLOSED, and with
 *   `ENCLAVE_QUOTE_REQUIRED=true` an un-attested run fails closed too.
 * - Both `trustModel` getters report the conservative label from config alone;
 *   a trust claim is only ever attached to a per-run verified result.
 */

import {
  type PositionBook,
  type BackendKind,
  type NetMarginResult as BaseNetMarginResult,
  twoPartyNetted,
} from "./margin";
import { makeLogger } from "./logger";
import { env } from "./env";

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

/** Wire shape expected by `enclave/obligor-enclave` (snake_case, Rust structs). */
interface EnclaveLeg {
  party: string;
  venue: string;
  instrument: string;
  bucket: string;
  side: string;
  qty: number;
  notional_usd: number;
  signed_exposure_usd: number;
  haircut: number;
  mark_usd: number;
}

interface EnclaveNettingResponse {
  session_id: string;
  siloed_a_usd: number;
  siloed_b_usd: number;
  siloed_combined_usd: number;
  netted_combined_usd: number;
  savings_usd: number;
  gross_notional_usd: number;
  net_exposure_usd: number;
  buckets?: { bucket: string; exposure_usd: number; haircut: number; im_usd: number }[];
  attestation?: {
    provider: string;
    verified: boolean;
    quote_hex: string;
    pcr0: string;
    measurement: string;
  };
}

/** Map camelCase PositionLeg → the enclave's snake_case wire struct. */
function toEnclaveLeg(leg: PositionBook["legs"][number]): EnclaveLeg {
  return {
    party: leg.party,
    venue: leg.venue,
    instrument: leg.instrument,
    bucket: leg.bucket,
    side: leg.side,
    qty: leg.qty,
    notional_usd: leg.notionalUsd,
    signed_exposure_usd: leg.signedExposureUsd,
    haircut: leg.haircut,
    mark_usd: leg.markUsd,
  };
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

const realTransports = env.confidential.realTransports;
const ENCLAVE_ENDPOINT = env.confidential.enclaveEndpoint;

function checkEnclaveTransport() {
  if (realTransports && !ENCLAVE_ENDPOINT) throw new ConfidentialUnavailableError("enclave");
}

/**
 * ArciumBackend (Solana).
 *
 * The Arcis circuit `two_party_portfolio_net` in `mxe/encrypted-ixs/` is the
 * real MPC program, but the Arcium MXE encryption lifecycle (`@arcium-hq/client`
 * encrypt → submit → await callback → decrypt) is NOT wired in this build.
 *
 * We therefore NEVER claim cryptographic MPC. Two honest modes:
 * - default: run the identical formula as sealed-execution simulation and label
 *   it `simulated_plaintext_compute`;
 * - `CONFIDENTIAL_REAL_TRANSPORTS=true`: FAIL CLOSED, because we cannot provide
 *   the real transport the operator demanded. We do not POST plaintext buckets
 *   to an endpoint and call the result MPC.
 */
export class ArciumBackend implements ConfidentialBackend {
  readonly kind: BackendKind = "arcium";

  get trustModel(): TrustModel {
    // Config alone can never establish a cryptographic claim.
    return "simulated_plaintext_compute";
  }

  async netTwoParty(
    bookA: PositionBook,
    bookB: PositionBook,
  ): Promise<ConfidentialNetMarginResult> {
    if (realTransports) {
      // The real Arcium MXE lifecycle is not implemented in this build, so we
      // cannot honour a demand for real transports — fail closed and loud.
      throw new ConfidentialUnavailableError("arcium-mxe");
    }

    const base = twoPartyNetted(bookA, bookB);
    const computationId = generateComputationId("arc_mxe");
    const timestamp = new Date().toISOString();

    log.debug("arcium backend ran as sealed-execution simulation", { computationId });
    return {
      ...base,
      backend: "arcium",
      trustModel: "simulated_plaintext_compute",
      computationId,
      timestamp,
      simulationNote:
        "MPC circuit is compiled in mxe — this run executed the exact formula as sealed-execution simulation (no real encryption). Trust model not claimed.",
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
    // A TEE claim can only come from a per-run verified quote, never from
    // configuration — the getter stays conservative.
    return "simulated_plaintext_compute";
  }

  async netTwoParty(
    bookA: PositionBook,
    bookB: PositionBook,
  ): Promise<ConfidentialNetMarginResult> {
    checkEnclaveTransport();

    const base = twoPartyNetted(bookA, bookB);
    const computationId = generateComputationId("tee_nitro");
    const timestamp = new Date().toISOString();

    if (realTransports) {
      const res = await fetch(`${ENCLAVE_ENDPOINT}/net`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: computationId,
          party_a_legs: bookA.legs.map(toEnclaveLeg),
          party_b_legs: bookB.legs.map(toEnclaveLeg),
        }),
        signal: AbortSignal.timeout(30_000),
      }).catch((err: unknown) => {
        // Transport unreachable — fail closed, never fall back to a local claim.
        throw new Error(
          `Enclave transport unreachable at ${ENCLAVE_ENDPOINT}/net: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      if (!res.ok) {
        throw new Error(`Enclave computation failed (${res.status}) — failing closed, not simulating`);
      }
      const data = (await res.json()) as EnclaveNettingResponse;

      // The enclave computed the numbers — use them, don't recompute locally.
      const remote: BaseNetMarginResult = {
        siloedAUsd: data.siloed_a_usd,
        siloedBUsd: data.siloed_b_usd,
        siloedCombinedUsd: data.siloed_combined_usd,
        nettedCombinedUsd: data.netted_combined_usd,
        savingsUsd: data.savings_usd,
        grossNotionalUsd: data.gross_notional_usd,
        netExposureUsd: data.net_exposure_usd,
        buckets: (data.buckets ?? []).map((b) => ({
          bucket: b.bucket,
          exposureUsd: b.exposure_usd,
          haircut: b.haircut,
          imUsd: b.im_usd,
        })),
        perPartySiloedUsd: { A: data.siloed_a_usd, B: data.siloed_b_usd },
        partyCount: 2,
      };

      // Only claim hardware-attested TEE when the enclave returned a genuine,
      // verified hardware quote. An un-attested run (e.g. the enclave binary on
      // a normal host) reports the conservative label + an honest note.
      const raw = data.attestation;
      if (raw?.verified && raw.quote_hex) {
        return {
          ...remote,
          backend: "enclave",
          trustModel: "hardware_attested_tee",
          computationId,
          timestamp,
          attestation: {
            quote: raw.quote_hex,
            verified: true,
            provider: (raw.provider as AttestationQuote["provider"]) ?? "none",
            timestamp,
            pcr0: raw.pcr0,
            enclaveMeasurement: raw.measurement,
          },
        };
      }

      if (env.confidential.enclaveQuoteRequired) {
        throw new Error(
          "Enclave returned no verified hardware attestation and ENCLAVE_QUOTE_REQUIRED is set — failing closed, not claiming TEE",
        );
      }

      log.warn("enclave transport executed without a hardware attestation quote", { computationId });
      return {
        ...remote,
        backend: "enclave",
        trustModel: "simulated_plaintext_compute",
        computationId,
        timestamp,
        simulationNote:
          "Executed over the real enclave transport (ENCLAVE_ENDPOINT), but no hardware attestation quote was returned — TEE is not claimed. trustModel conservatively reports simulated_plaintext_compute.",
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
