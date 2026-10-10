/**
 * Shared HTTP plumbing for Next Route Handlers:
 * consistent JSON envelopes, bounded body parsing, per-IP rate limiting,
 * and request-id correlation for every error.
 */

import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { env } from "./env";
import { makeLogger } from "./logger";
import { newRequestId } from "./request-ids";
import { withRequestContext } from "./request-context.server";
const log = makeLogger("http");

/** Standard error the API returns; `message` is safe for display. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }
  static unauthorized(
    message = "This action requires the acting desk's session token — the room link alone is not enough to act as either party",
  ) {
    return new ApiError(401, "UNAUTHORIZED", message);
  }
  static notFound(message = "Not found") {
    return new ApiError(404, "NOT_FOUND", message);
  }
  static tooMany(message = "Too many requests — slow down and retry shortly") {
    return new ApiError(429, "RATE_LIMITED", message);
  }
  static payloadTooLarge(limitMb: number) {
    return new ApiError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds the ${limitMb}MB limit`);
  }
  static unavailable(message: string) {
    return new ApiError(503, "UNAVAILABLE", message);
  }
  static internal(message = "Unexpected server error") {
    return new ApiError(500, "INTERNAL", message);
  }
}

export const MAX_BODY_BYTES = 256 * 1024; // 256KB is generous for position books

/** Parse JSON bodies with a hard size cap; throws typed ApiError only. */
export async function readJsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    throw ApiError.payloadTooLarge(Math.round((MAX_BODY_BYTES / 1024 / 1024) * 100) / 100);
  }

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    throw ApiError.payloadTooLarge(Math.round((MAX_BODY_BYTES / 1024 / 1024) * 100) / 100);
  }
  if (!text) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw ApiError.badRequest("Request body is not valid JSON");
  }
  if (parsed == null) return {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw ApiError.badRequest("Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/** Validate a parsed body against a zod schema; throws a 422 ApiError. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const res = schema.safeParse(body);
  if (!res.success) {
    const issues = res.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    const first = issues[0]?.message ?? "Invalid request body";
    throw new ApiError(422, "VALIDATION_FAILED", first, issues);
  }
  return res.data;
}

/** Best-effort client identifier for rate limiting (proxy-aware). */
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// --- Token bucket rate limiter (in-memory, per instance) ---
interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const globalForBuckets = globalThis as unknown as { __obligorBuckets?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (globalForBuckets.__obligorBuckets ??= new Map());

function refill(bucket: Bucket, capacity: number, windowMs: number) {
  const now = Date.now();
  const refillRate = capacity / windowMs; // tokens per ms
  const elapsed = now - bucket.lastRefillMs;
  if (elapsed > 0) {
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillRate);
    bucket.lastRefillMs = now;
  }
}

/**
 * Consume one token from a per-key bucket. Returns headers that describe
 * remaining quota, or throws a 429 ApiError when the bucket is empty.
 */
export function rateLimit(key: string, capacity: number, windowMs: number) {
  const bucket = buckets.get(key) ?? { tokens: capacity, lastRefillMs: Date.now() };
  refill(bucket, capacity, windowMs);
  bucket.tokens -= 1;
  buckets.set(key, bucket);

  const remaining = Math.max(0, Math.floor(bucket.tokens));
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(capacity),
    "RateLimit-Remaining": String(remaining),
    "RateLimit-Reset": String(Math.ceil(windowMs / 1000)),
  };

  if (bucket.tokens < 0) {
    log.warn("rate limit exceeded", { key });
    throw ApiError.tooMany();
  }
  return headers;
}

/** Named policy presets wired to env limits. */
export function rateLimitFor(kind: "default" | "compute" | "demo", req: NextRequest) {
  if (kind === "compute") {
    return rateLimit(`compute:${clientIp(req)}`, env.rateLimit.computeMaxPerWindow, env.rateLimit.windowMs);
  }
  if (kind === "demo") {
    return rateLimit(`demo:${clientIp(req)}`, env.rateLimit.demoMaxPerWindow, env.rateLimit.windowMs);
  }
  return rateLimit(`api:${clientIp(req)}`, env.rateLimit.maxPerWindow, env.rateLimit.windowMs);
}

export function ok<T extends object>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, ...data }, init);
}

export function errorResponse(err: unknown): NextResponse {
  const requestId = newRequestId();
  const status = err instanceof ApiError ? err.status : 500;
  const code = err instanceof ApiError ? err.code : "INTERNAL";
  const message =
    err instanceof ApiError ? err.message : "Unexpected server error — please retry";

  if (status >= 500) {
    log.error("request failed", {
      requestId,
      status,
      code,
      error: err instanceof Error ? err.message : String(err),
    });
  } else if (status === 429) {
    log.info("request throttled", { requestId, status, code });
  }

  const body: Record<string, unknown> = {
    ok: false,
    error: code,
    message,
    requestId,
  };

  const res = NextResponse.json(body, { status });
  res.headers.set("X-Request-Id", requestId);
  return res;
}

type HandlerFn<P> = (args: { req: NextRequest; params: P; requestId: string }) => Promise<NextResponse>;

/**
 * Wrap a route handler with request-id correlation and a consistent error
 * envelope. Handlers apply their own rate policy via `rateLimitFor`.
 */
export function withApi<P = Record<string, string | string[]>>(
  handler: HandlerFn<P>,
) {
  return async function wrapped(
    req: NextRequest,
    context?: { params: Promise<P> },
  ): Promise<NextResponse> {
    const requestId = newRequestId();
    try {
      const params = context?.params ? await context.params : ({} as P);
      return await withRequestContext(requestId, () => handler({ req, params, requestId }));
    } catch (err) {
      return errorResponse(err);
    }
  };
}
