/**
 * Idempotent SQLite schema migration.
 *
 * The runtime stores already create their tables lazily on first use, so a
 * deploy never *needs* this. Running it explicitly (npm run migrate) makes the
 * schema a reviewable, pre-flight step: it provisions every table and index up
 * front, is safe to run repeatedly, and works on a fresh or existing DB.
 *
 * Only applies when a sqlite-backed store is selected; memory/file modes have
 * no schema.
 */

import type { Database } from "./sqlite";
import { openSqlite, sqliteSelected } from "./sqlite";
import { makeLogger } from "./logger";

const log = makeLogger("migrations");

interface Step {
  name: string;
  sql: string;
}

/** Ordered, additive steps. Each is `IF NOT EXISTS` and safe to re-run. */
export const MIGRATIONS: Step[] = [
  {
    name: "sessions",
    sql: `CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            updated_at INTEGER NOT NULL,
            data TEXT NOT NULL
          );`,
  },
  {
    name: "sessions_updated_idx",
    sql: "CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);",
  },
  {
    name: "idempotency",
    sql: `CREATE TABLE IF NOT EXISTS idempotency (
            key TEXT PRIMARY KEY,
            fingerprint TEXT NOT NULL,
            recorded_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            response TEXT NOT NULL
          );`,
  },
  {
    name: "idempotency_expires_idx",
    sql: "CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency(expires_at);",
  },
  {
    name: "computations",
    sql: `CREATE TABLE IF NOT EXISTS computations (
            computation_id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );`,
  },
  {
    name: "computations_created_at_idx",
    sql: "CREATE INDEX IF NOT EXISTS computations_created_at ON computations (created_at);",
  },
];

/** Apply every migration to `db`. Returns the number of statements applied. */
export function migrate(db: Database = openSqlite()): number {
  for (const step of MIGRATIONS) {
    db.exec(step.sql);
  }
  log.info("schema migrated", { tables: MIGRATIONS.length });
  return MIGRATIONS.length;
}

/** True when a sqlite store is selected and migration should run. */
export function migrationNeeded(): boolean {
  return sqliteSelected();
}
