/**
 * Monad execution venue adapter.
 *
 * Monad is an EVM-equivalent chain (JSON-RPC). This is a real on-chain read
 * path — no SDK, no fixtures, no invented numbers:
 * - Liveness/provenance: eth_chainId + eth_blockNumber over MONAD_RPC_URL
 *   (public testnet by default, mainnet/provider via env).
 * - Native balance: eth_getBalance.
 * - Token exposure: eth_call `balanceOf(address)` for each token in the
 *   operator-configured MONAD_TOKEN_MAP, priced to bucket USD from the live
 *   Pyth Hermes feed.
 *
 * Every failure mode is loud (MONAD_OFFLINE / MONAD_UNEXPECTED_RESPONSE /
 * MONAD_TOKEN_MAP_INVALID / MONAD_UNSUPPORTED_BUCKET). There is no silent-empty,
 * no fixture-substitution path in here.
 */

import { env } from "@/lib/env";
import { fetchLivePythPrice, type OraclePrice } from "./pyth";
import { makeLogger } from "@/lib/logger";

const log = makeLogger("monad");

const BALANCE_OF_SELECTOR = "0x70a08231"; // keccak256("balanceOf(address)")[:4]

function hexToBigInt(hex: string): bigint {
  if (!/^0x[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`MONAD_UNEXPECTED_RESPONSE: expected a hex quantity, got ${hex}`);
  }
  return BigInt(hex);
}

/** Buckets this adapter can mark from a live Pyth feed (MON has no feed yet). */
export const MONAD_SUPPORTED_BUCKETS = ["SOL", "BTC", "ETH", "AAPL", "USD"] as const;

export interface MonadTokenSpec {
  bucket: string;
  address: string;
  decimals: number;
}

/**
 * Parse MONAD_TOKEN_MAP — a JSON object mapping a risk bucket to a token
 * address (18 decimals assumed) or `{ address, decimals }`. Loud on any error.
 */
export function parseMonadTokenMap(raw: string): MonadTokenSpec[] {
  if (!raw.trim()) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("MONAD_TOKEN_MAP_INVALID: MONAD_TOKEN_MAP is not valid JSON");
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error("MONAD_TOKEN_MAP_INVALID: MONAD_TOKEN_MAP must be a JSON object of { bucket: token }");
  }
  const specs: MonadTokenSpec[] = [];
  for (const [bucket, value] of Object.entries(json as Record<string, unknown>)) {
    if (typeof value === "string") {
      specs.push({ bucket: bucket.toUpperCase(), address: value, decimals: 18 });
    } else if (value && typeof value === "object") {
      const v = value as { address?: unknown; decimals?: unknown };
      if (typeof v.address !== "string") {
        throw new Error(`MONAD_TOKEN_MAP_INVALID: entry ${bucket} is missing a string \`address\``);
      }
      const decimals = typeof v.decimals === "number" && v.decimals >= 0 ? Math.floor(v.decimals) : 18;
      specs.push({ bucket: bucket.toUpperCase(), address: v.address, decimals });
    } else {
      throw new Error(`MONAD_TOKEN_MAP_INVALID: entry ${bucket} must be a string address or { address, decimals }`);
    }
  }
  return specs;
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code: number; message: string };
}

/** Minimal, validated EVM JSON-RPC call over the configured Monad endpoint. */
async function monadRpc(method: string, params: unknown[]): Promise<string> {
  const url = env.monad.rpcUrl;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`MONAD_OFFLINE: RPC ${method} responded ${res.status}`);
    const body = (await res.json()) as JsonRpcResponse;
    if (body.error) throw new Error(`MONAD_UNEXPECTED_RESPONSE: ${method} error ${body.error.code}: ${body.error.message}`);
    // Allow "0x" (empty data, e.g. eth_call to a non-contract) alongside quantities.
    if (typeof body.result !== "string" || !/^0x[0-9a-fA-F]*$/.test(body.result)) {
      throw new Error(`MONAD_UNEXPECTED_RESPONSE: ${method} returned a non-hex result`);
    }
    return body.result;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("MONAD_")) throw err;
    throw new Error(`MONAD_OFFLINE: ${method} failed (${err instanceof Error ? err.message : String(err)})`);
  } finally {
    clearTimeout(timeout);
  }
}

export interface MonadChainState {
  chainId: number;
  blockNumber: number;
  fetchedAt: string;
}

/** Read live chain id + head block, proving the RPC endpoint is real and current. */
export async function fetchMonadChainState(): Promise<MonadChainState> {
  const [chainIdHex, blockHex] = await Promise.all([
    monadRpc("eth_chainId", []),
    monadRpc("eth_blockNumber", []),
  ]);
  return {
    chainId: Number(hexToBigInt(chainIdHex)),
    blockNumber: Number(hexToBigInt(blockHex)),
    fetchedAt: new Date().toISOString(),
  };
}

/** Native MON balance (as a decimal MON amount) for an address. */
export async function fetchMonadNativeBalance(address: string): Promise<number> {
  const wei = await monadRpc("eth_getBalance", [address, "latest"]);
  return Number(hexToBigInt(wei)) / 1e18;
}

/** ERC-20 balanceOf(address) via eth_call — real on-chain balance. */
export async function fetchMonadErc20Balance(token: string, holder: string): Promise<bigint> {
  const clean = token.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(clean)) {
    throw new Error(`MONAD_UNEXPECTED_RESPONSE: invalid token address ${token}`);
  }
  const holderWord = holder.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const data = `${BALANCE_OF_SELECTOR}${holderWord}`;
  const result = await monadRpc("eth_call", [{ to: clean, data }, "latest"]);
  if (result === "0x") return BigInt(0);
  return hexToBigInt(result);
}

export interface MonadTokenExposure {
  bucket: string;
  address: string;
  balance: string;
  decimals: number;
  priceUsd: number;
  valueUsd: number;
  markStatus: OraclePrice["status"];
}

export interface MonadExposure {
  authority: string;
  chain: MonadChainState;
  tokens: MonadTokenExposure[];
  /** Per-bucket net exposure in USD. */
  bucketExposure: Record<string, number>;
  /** Buckets in the token map with no live Pyth feed (e.g. MON) — surfaced, not dropped. */
  unpriceableBuckets: string[];
}

/**
 * Read a wallet's on-chain Monad token exposure for the configured token map,
 * priced from live Pyth marks. Throws loudly when unconfigured/unreachable.
 */
export async function fetchMonadExposure(authorityOverride?: string): Promise<MonadExposure> {
  const authority = authorityOverride ?? env.monad.authority;
  if (!authority) {
    throw new Error(
      "MONAD_NOT_CONFIGURED: set MONAD_AUTHORITY (0x… wallet) or pass an address to read live Monad exposure",
    );
  }
  const specs = parseMonadTokenMap(env.monad.tokenMap);
  if (specs.length === 0) {
    throw new Error(
      "MONAD_NOT_CONFIGURED: MONAD_TOKEN_MAP is empty — no on-chain token positions to verify",
    );
  }

  const chain = await fetchMonadChainState();
  const tokens: MonadTokenExposure[] = [];
  const bucketExposure: Record<string, number> = {};
  const unpriceable = new Set<string>();

  for (const spec of specs) {
    const raw = await fetchMonadErc20Balance(spec.address, authority);
    if (raw === BigInt(0)) continue;
    const balance = Number(raw) / Math.pow(10, spec.decimals);

    let priceUsd = 0;
    let markStatus: OraclePrice["status"] = "fallback";
    if ((MONAD_SUPPORTED_BUCKETS as readonly string[]).includes(spec.bucket)) {
      const oracle = await fetchLivePythPrice(spec.bucket === "USD" ? "USDC" : spec.bucket);
      priceUsd = oracle.priceUsd;
      markStatus = oracle.status;
    } else {
      unpriceable.add(spec.bucket);
    }

    const valueUsd = Math.round(balance * priceUsd * 100) / 100;
    tokens.push({
      bucket: spec.bucket,
      address: spec.address,
      balance: balance.toString(),
      decimals: spec.decimals,
      priceUsd,
      valueUsd,
      markStatus,
    });
    if (valueUsd > 0) {
      bucketExposure[spec.bucket] = (bucketExposure[spec.bucket] ?? 0) + valueUsd;
    }
  }

  log.info("monad exposure read", {
    authority: authority.slice(0, 8),
    block: chain.blockNumber,
    tokens: tokens.length,
  });
  return {
    authority,
    chain,
    tokens,
    bucketExposure,
    unpriceableBuckets: Array.from(unpriceable),
  };
}
