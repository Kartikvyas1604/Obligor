/**
 * Structured JSON logging with levels.
 *
 * BROWSER-SAFE: no Node built-ins at module scope. The request-id lookup
 * reads a storage instance published by lib/request-context.server.ts
 * (polluted on globalThis), so the same emitter works in Route Handlers
 * and degrades gracefully (no ids) anywhere else.
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
  const lvl = (process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === "production" ? "info" : "debug")) as LogLevel;
  return LEVEL_WEIGHT[lvl] ? lvl : "debug";
};

export function readCurrentRequestId(): string | undefined {
  const storage = (globalThis as { __obligorRequestStorage?: { getStore?: () => { requestId: string } | undefined } })
    .__obligorRequestStorage;
  if (!storage?.getStore || typeof storage.getStore !== "function") return undefined;
  try {
    return storage.getStore()?.requestId;
  } catch {
    return undefined;
  }
}

function emit(level: LogLevel, component: string, message: string, meta?: Record<string, unknown>) {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[currentLevel()]) return;

  const record = {
    ts: new Date().toISOString(),
    level,
    component,
    message,
    request_id: readCurrentRequestId(),
    ...(meta ? { meta: redact(meta) } : {}),
  };

  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (typeof console.info === "function") console.log(line);
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
