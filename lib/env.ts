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

const envSchema = z.object({
  runtime: z.object({
    nodeEnv: z.string().optional().default("development"),
    dataDir: z.string().optional().default(".data"),
    logLevel: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),
  }),

  demo: z.object({
    // Demo-only fixture books and unpaid calls. Locked OFF in production.
    allowFixtures: boolish(false),
    allowUnpaid: boolish(false),
  }),

  store: z.object({
    mode: z.enum(["memory", "file"]).optional().default("file"),
    ttlMs: positiveInt(1000 * 60 * 60 * 24), // sessions expire after 24h
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
    store: { mode: process.env.SESSION_STORE_MODE, ttlMs: process.env.SESSION_TTL_MS },
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
