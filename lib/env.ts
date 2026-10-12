/**
 * Central, validated, typed configuration. Every runtime value comes from the
 * environment here — no hardcoded per-environment values anywhere else.
 *
 * Parsing is lenient by design: every variable has a safe default so builds
 * and dev servers start without a .env file. Security-relevant demo escape
 * hatches default OFF in production and a startup warning is logged when a
 * production deployment enables them.
 */

import { z } from "zod";
import { makeLogger } from "./logger";

const log = makeLogger("config");

const boolish = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v === "" ? fallback : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const positiveInt = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
    });

const nonNegativeNumber = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    });

export const chainSchema = z.enum(["solana", "monad"]);
export type Chain = z.infer<typeof chainSchema>;

const isProdBuild = process.env.NODE_ENV === "production";

const envSchema = z.object({
  runtime: z.object({
    nodeEnv: z.string().optional().default("development"),
    dataDir: z.string().optional().default(".data"),
    logLevel: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),
  }),

  demo: z.object({
    // Demo-only fixture books and unpaid calls. Dev convenience default ON;
    // locked OFF in production unless explicitly enabled (and then warned).
    allowFixtures: boolish(!isProdBuild),
    allowUnpaid: boolish(!isProdBuild),
  }),

  store: z.object({
    // memory = per-process Map (dev); file = atomic JSON on local disk
    // (single-instance); sqlite = node:sqlite database file, safe for multiple
    // processes sharing one volume (the scale-out-ready, dependency-free step).
    mode: z.enum(["memory", "file", "sqlite"]).optional().default("file"),
    ttlMs: positiveInt(1000 * 60 * 60 * 24), // sessions expire after 24h
    // Shared idempotency store backend for write-intent replay/conflict checks.
    // Defaults to the session store mode so a single switch scales both.
    idempotencyBackend: z.enum(["memory", "sqlite"]).optional(),
    sqlitePath: z.string().optional().default(""),
  }),

  rateLimit: z.object({
    maxPerWindow: positiveInt(60),
    windowMs: positiveInt(60_000),
    computeMaxPerWindow: positiveInt(30),
    demoMaxPerWindow: positiveInt(10),
  }),

  x402: z.object({
    priceUsd: nonNegativeNumber(0.01),
    baseUnits: z.string().optional().default("10000"),
    solanaNetwork: z.string().optional().default("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"),
    solanaAssetMint: z
      .string()
      .optional()
      .default("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"), // devnet USDC
    monadNetwork: z.string().optional().default("eip155:10143"),
    monadAssetMint: z
      .string()
      .optional()
      .default("0x534b2f3A21130d7a60830c2Df862319e593943A3"),
    solanaPayTo: z.string().optional().default(""),
    monadPayTo: z.string().optional().default(""),
    facilitatorUrlSolana: z.string().optional().default(""),
    facilitatorUrlMonad: z.string().optional().default(""),
    // Monad x402 is off until a facilitator is verified and explicitly
    // enabled. Keeps the "else Solana-only x402 + honest README" path from
    // AGENT.md real: MONAD_PAY_TO alone never silently enables Monad payments.
    monadEnabled: boolish(false),
    // Receipt verification: Obligor's signed-receipt envelope is verified with
    // node:crypto ed25519 whenever a chain challenge exists (payTo/asset/network
    // match + amount + signature). This flag forces FAIL-CLOSED: any receipt that
    // is not a cryptographically valid envelope is rejected, ignoring the dev
    // escape hatch below. Locked OFF by default; recommended ON in production.
    requireVerifiedSignatures: boolish(false),
    // Legacy escape hatch: a well-formed (but UNVERIFIED) receipt header clears
    // payment. Dev default ON, locked OFF in production. Ignored entirely when
    // requireVerifiedSignatures is true.
    acceptUnverifiedSignatures: boolish(!isProdBuild),
  }),

  positions: z.object({
    // Haircuts per instrument bucket class, configurable without a code change.
    haircutSpot: nonNegativeNumber(0.1),
    haircutPerp: nonNegativeNumber(0.15),
    haircutEquity: nonNegativeNumber(0.25),
    maxLegsPerBook: positiveInt(16),
    maxNotionalPerLegUsd: positiveInt(50_000_000),
  }),

  oracle: z.object({
    stalenessMs: positiveInt(5 * 60_000),
    // Keep serving last-known marks rather than failing a session entirely.
    fallbackEnabled: boolish(true),
  }),

  drift: z.object({
    // Mainnet Drift user authority (base58). When unset the venue adapter
    // reports desk-declared exposure as unverified — never fabricated.
    authority: z.string().optional().default(""),
    subAccountId: z
      .string()
      .optional()
      .transform((v) => {
        const n = Number(v);
        return Number.isInteger(n) && n >= 0 ? n : 0;
      }),
    // Official Drift Data API (self-hostable); envelope may be overridden.
    dataApiBase: z
      .string()
      .optional()
      .default("https://data.api.drift.trade"),
    subAccountCacheMs: positiveInt(30_000),
  }),

  confidential: z.object({
    // When true, the confidential backends MUST carry a real transport; a
    // missing/unsupported wire fails closed instead of silently simulating.
    realTransports: boolish(false),
    // Reserved for the Arcium MXE transport. The real encryption lifecycle is
    // NOT wired in this build, so a set endpoint does not make ArciumBackend
    // claim MPC — with realTransports=true it fails closed instead.
    arciumMxeEndpoint: z.string().optional().default(""),
    // Real enclave HTTP transport (enclave/obligor-enclave). When set and
    // CONFIDENTIAL_REAL_TRANSPORTS=true, nets run over this wire.
    enclaveEndpoint: z.string().optional().default(""),
    // Require a verified hardware attestation quote before claiming TEE. When
    // off, an un-attested enclave run is still labelled simulated_plaintext.
    enclaveQuoteRequired: boolish(false),
  }),

  escrow: z.object({
    // When true, POST /v1/escrow/settle emits a REAL on-chain settlement against
    // the deployed obligor-escrow program and returns its transaction signature.
    // Requires rpcUrl + a funded authority keypair + a live escrow account.
    // Any failure fails closed — the API never fabricates a signature.
    realSettle: boolish(false),
    rpcUrl: z.string().optional().default("http://127.0.0.1:8899"),
    programId: z
      .string()
      .optional()
      .default("94YmMnGjq2U8zpsLMSuk9fMwnfcHqrft3CtmwuZidMkZ"),
    // Path to a Solana CLI JSON keypair file for the clearing authority.
    authorityKeypair: z.string().optional().default(""),
    commitment: z.enum(["processed", "confirmed", "finalized"]).optional().default("confirmed"),
    // Collateral token base units per 1 USD (e.g. 6 for USDC). The API converts
    // netted margin USD → base units with this before settling on-chain. Must
    // match the decimals of the mint used in initialize_escrow.
    baseDecimals: positiveInt(6),
  }),
});

export type Env = z.infer<typeof envSchema>;

function load(): Env {
  const parsed = envSchema.safeParse({
    runtime: {
      nodeEnv: process.env.NODE_ENV,
      dataDir: process.env.DATA_DIR,
      logLevel: process.env.LOG_LEVEL,
    },
    demo: {
      allowFixtures: process.env.DEMO_ALLOW_FIXTURES,
      allowUnpaid: process.env.DEMO_ALLOW_UNPAID,
    },
    store: {
      mode: process.env.SESSION_STORE_MODE,
      ttlMs: process.env.SESSION_TTL_MS,
      idempotencyBackend: process.env.IDEMPOTENCY_BACKEND,
      sqlitePath: process.env.SQLITE_PATH,
    },
    rateLimit: {
      maxPerWindow: process.env.RATE_LIMIT_MAX,
      windowMs: process.env.RATE_LIMIT_WINDOW_MS,
      computeMaxPerWindow: process.env.RATE_LIMIT_COMPUTE_MAX,
      demoMaxPerWindow: process.env.RATE_LIMIT_DEMO_MAX,
    },
    x402: {
      priceUsd: process.env.X402_PRICE_USD,
      baseUnits: process.env.X402_BASE_UNITS,
      solanaNetwork: process.env.X402_NETWORK_SOLANA,
      solanaAssetMint: process.env.X402_ASSET_MINT_SOLANA,
      monadNetwork: process.env.X402_NETWORK_MONAD,
      monadAssetMint: process.env.X402_ASSET_MINT_MONAD,
      solanaPayTo: process.env.SOLANA_PAY_TO,
      monadPayTo: process.env.MONAD_PAY_TO,
      facilitatorUrlSolana: process.env.FACILITATOR_URL_SOLANA,
      facilitatorUrlMonad: process.env.FACILITATOR_URL_MONAD,
      monadEnabled: process.env.X402_MONAD_ENABLED,
      requireVerifiedSignatures: process.env.X402_REQUIRE_VERIFIED_SIGNATURES,
      acceptUnverifiedSignatures: process.env.X402_ACCEPT_UNVERIFIED_SIGNATURES,
    },
    positions: {
      haircutSpot: process.env.POSITION_HAIRCUT_SPOT,
      haircutPerp: process.env.POSITION_HAIRCUT_PERP,
      haircutEquity: process.env.POSITION_HAIRCUT_EQUITY,
      maxLegsPerBook: process.env.POSITION_MAX_LEGS_PER_BOOK,
      maxNotionalPerLegUsd: process.env.POSITION_MAX_NOTIONAL_PER_LEG,
    },
    oracle: {
      stalenessMs: process.env.ORACLE_STALENESS_MS,
      fallbackEnabled: process.env.ORACLE_FALLBACK_ENABLED,
    },
    drift: {
      authority: process.env.DRIFT_AUTHORITY,
      subAccountId: process.env.DRIFT_SUBACCOUNT_ID,
      dataApiBase: process.env.DRIFT_DATA_API_BASE,
      subAccountCacheMs: process.env.DRIFT_SUBACCOUNT_CACHE_MS,
    },
    escrow: {
      realSettle: process.env.ESCROW_REAL_SETTLE,
      rpcUrl: process.env.SOLANA_RPC_URL,
      programId: process.env.ESCROW_PROGRAM_ID,
      authorityKeypair: process.env.SOLANA_AUTHORITY_KEYPAIR,
      commitment: process.env.SOLANA_COMMITMENT,
      baseDecimals: process.env.ESCROW_BASE_DECIMALS,
    },
  });

  if (!parsed.success) {
    // Configuration is broken — fail loud and early.
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }

  const cfg = parsed.data;
  const isProd = cfg.runtime.nodeEnv === "production";

  if (isProd) {
    if (cfg.demo.allowFixtures) {
      log.warn("DEMO_ALLOW_FIXTURES is enabled in production — demo books will be served on demo endpoints");
    }
    if (cfg.demo.allowUnpaid) {
      log.warn("DEMO_ALLOW_UNPAID is enabled in production — the clearing API will not enforce payment");
    }
    if (cfg.x402.acceptUnverifiedSignatures) {
      log.warn(
        "X402_ACCEPT_UNVERIFIED_SIGNATURES is enabled in production — x402 receipts are NOT cryptographically verified and any well-formed header clears payment",
      );
    }
    if (!cfg.x402.requireVerifiedSignatures) {
      log.warn(
        "X402_REQUIRE_VERIFIED_SIGNATURES is off — signed x402 receipts are still verified when present, but the enforce-everything mode is disabled (set true for a production-hard gate)",
      );
    }
    if (cfg.store.mode === "memory") {
      log.warn("SESSION_STORE_MODE=memory in production — deal rooms are lost on restart and not shared across instances");
    }
  }

  return cfg;
}

const globalForEnv = globalThis as unknown as { __obligorEnv?: Env };

export const env: Env = globalForEnv.__obligorEnv ?? (globalForEnv.__obligorEnv = load());

export function isProduction(): boolean {
  return env.runtime.nodeEnv === "production";
}
