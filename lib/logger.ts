/**
 * Structured JSON logging with levels and request correlation.
 * Machine-parseable in production; human-readable defaults locally.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SECRET_KEY_PATTERN = /(secret|key|token|password|signature|authorization)/i;

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) {
      out[k] = v;
    } else if (SECRET_KEY_PATTERN.test(k)) {
      out[k] = "<redacted>";
    } else if (typeof v === "object" && !Array.isArray(v)) {
      out[k] = redact(v as Record<string, unknown>);
    } else if (typeof v === "string" && v.length > 300) {
      out[k] = v.slice(0, 300) + "…";
    } else {
      out[k] = v;
    }
  }
  return out;
}

type CurrentLevel = () => LogLevel;

// Lazy level resolution: `env` imports this module, so avoid a circular load.
const currentLevel: CurrentLevel = () => {
  const lvl = (process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug")) as LogLevel;
  return LEVEL_WEIGHT[lvl] ? lvl : "debug";
};

function emit(level: LogLevel, component: string, message: string, meta?: Record<string, unknown>) {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[currentLevel()]) return;

  const record = {
    ts: new Date().toISOString(),
    level,
    component,
    message,
    request_id: currentRequestId(),
    ...(meta ? { meta: redact(meta) } : {}),
  };

  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function makeLogger(component: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => emit("debug", component, message, meta),
    info: (message: string, meta?: Record<string, unknown>) => emit("info", component, message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => emit("warn", component, message, meta),
    error: (message: string, meta?: Record<string, unknown>) => emit("error", component, message, meta),
  };
}

export const logger = makeLogger("app");

/** Per-request correlation helper (uses AsyncLocalStorage when available). */
import { AsyncLocalStorage } from "node:async_hooks";

const requestStorage = new AsyncLocalStorage<{ requestId: string }>();

export function withRequestContext<T>(requestId: string, fn: () => T): T {
  return requestStorage.run({ requestId }, fn);
}

export function currentRequestId(): string | undefined {
  return requestStorage.getStore()?.requestId;
}

export function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
