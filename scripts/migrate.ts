/**
 * Pre-flight schema migration. Run in CI/CD and container entrypoints before
 * the server starts:
 *
 *   npm run migrate
 *
 * No-ops with an explanatory message when a non-SQLite store is configured.
 */
import { migrate, migrationNeeded } from "../lib/migrations";
import { sqlitePath } from "../lib/sqlite";

function main(): void {
  if (!migrationNeeded()) {
    console.log("migrate: SESSION_STORE_MODE is not sqlite — no schema to apply");
    return;
  }
  const applied = migrate();
  console.log(`migrate: applied ${applied} idempotent statements to ${sqlitePath()}`);
}

main();
