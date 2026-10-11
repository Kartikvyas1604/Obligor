/**
 * Lazily-opened SQLite handle (node:sqlite, built into Node 22+).
 *
 * `node:sqlite` is required only when a sqlite-backed store is actually
 * selected, so the default memory/file paths never pay for it and never emit
 * its experimental warning. One process-wide handle per resolved path so the
 * session store and the idempotency store share a connection.
 *
 * This is the dependency-free scale-out step: a single SQLite file on a shared
 * volume is safe for multiple app processes, unlike the JSON file store. For
 * true horizontal scale across machines, keep the same interface and back it
 * with Postgres/Redis.
 */

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "./env";
import { makeLogger } from "./logger";

const log = makeLogger("sqlite");

interface Statement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}

interface Database {
  exec(sql: string): void;
  prepare(sql: string): Statement;
}

type NodeSqliteModule = { DatabaseSync: new (p: string) => Database };

const globalForDb = globalThis as unknown as { __obligorSqlite?: Map<string, Database> };
const handles: Map<string, Database> = (globalForDb.__obligorSqlite ??= new Map());

/** Resolve the configured SQLite path, defaulting under the runtime data dir. */
export function sqlitePath(): string {
  const configured = env.store.sqlitePath;
  const path = configured || `${env.runtime.dataDir}/obligor.db`;
  return resolve(process.cwd(), path);
}

/**
 * Load node:sqlite at runtime without createRequire — bypasses the bundler
 * entirely and works identically under `next start` and plain `tsx` scripts.
 * `process.getBuiltinModule` is available in Node 22.3+ (CI/Docker use Node 24).
 */
function loadNodeSqlite(): NodeSqliteModule {
  const getBuiltin = (process as unknown as {
    getBuiltinModule?: (id: string) => unknown;
  }).getBuiltinModule;
  if (typeof getBuiltin !== "function") {
    throw new Error(
      "node:sqlite requires Node 22.3+ (process.getBuiltinModule) — upgrade the runtime or use SESSION_STORE_MODE=file",
    );
  }
  const mod = getBuiltin("node:sqlite") as NodeSqliteModule | undefined;
  if (!mod?.DatabaseSync) {
    throw new Error("node:sqlite is unavailable in this runtime — use SESSION_STORE_MODE=file");
  }
  return mod;
}

/** Open (or reuse) the SQLite database at `path`. Requires node:sqlite. */
export function openSqlite(path: string = sqlitePath()): Database {
  const existing = handles.get(path);
  if (existing) return existing;

  mkdirSync(dirname(path), { recursive: true });
  const { DatabaseSync } = loadNodeSqlite();
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  handles.set(path, db);
  log.info("sqlite store opened", { path });
  return db;
}

/** True when a sqlite-backed store is selected for sessions or idempotency. */
export function sqliteSelected(): boolean {
  return env.store.mode === "sqlite" || effectiveIdempotencyBackend() === "sqlite";
}

/** Idempotency backend, defaulting to the session store mode. */
export function effectiveIdempotencyBackend(): "memory" | "sqlite" {
  if (env.store.idempotencyBackend) return env.store.idempotencyBackend;
  return env.store.mode === "sqlite" ? "sqlite" : "memory";
}
