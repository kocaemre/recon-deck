import "server-only";

/**
 * Database client singleton -- Phase 3 boot infrastructure.
 *
 * Boot sequence (D-06): probe -> Database -> WAL -> FK -> busy_timeout ->
 * (snapshot if migration pending) -> migrate -> integrity check -> export.
 *
 * Module-level evaluation: better-sqlite3 is synchronous, Next.js evaluates
 * module-level code once per process start. This singleton is safe and the
 * simplest approach for a single-user, single-process app.
 *
 * PERSIST-05: WAL mode + idempotent boot-time migrations.
 * PERSIST-06: Writability probe runs before Database constructor.
 *
 * Migration safety (P2): when the journal exposes more entries than the
 * `__drizzle_migrations` table records as applied, take a `VACUUM INTO`
 * snapshot to `<db>.backup-pre-NNNN` before invoking migrate(). On any
 * failure, the rollback path is documented in CONTRIBUTING.md ›
 * "Migration safety and recovery". After a successful migration we run
 * `PRAGMA integrity_check` and `PRAGMA foreign_key_check` so a partially
 * applied migration that left orphaned rows surfaces immediately at boot
 * rather than silently during a later query. Pure helpers live in
 * `./migration-safety.ts` so unit tests can import them without tripping
 * the `server-only` guard.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { checkWritability } from "./probe";
import {
  countAppliedMigrations,
  countJournalEntries,
  takePreMigrationSnapshot,
  verifyDbIntegrity,
} from "./migration-safety";
import path from "node:path";

/** SQLite file path -- configurable via env var (CD-03). Default supports both Docker volume mount and local dev. */
const DB_PATH =
  process.env.RECON_DB_PATH ??
  path.join(process.cwd(), "data", "recon-deck.db");
const DB_DIR = path.dirname(DB_PATH);

/**
 * Migrations folder path -- uses import.meta.url-relative resolution so it works in both:
 * - Dev: CWD = repo root, __dirname = src/lib/db/
 * - Standalone: CWD = .next/standalone, __dirname = wherever client.ts is bundled
 *
 * Phase 8 Dockerfile must copy migrations/ to the standalone output.
 */
const MIGRATIONS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "migrations",
);

const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

// D-06 Step 1: Writability probe (PERSIST-06)
checkWritability(DB_DIR);

// D-06 Step 2: Open database
const sqlite = new Database(DB_PATH);

// D-06 Step 3-5: Pragmas (D-09: WAL before any queries, Pitfall 5: FK per connection)
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

// D-06 Step 6: Idempotent migrations (PERSIST-05) wrapped in safety net.
export const db = drizzle(sqlite, { schema });

const appliedBefore = countAppliedMigrations(sqlite);
const expected = countJournalEntries(JOURNAL_PATH);
// Pre-migration snapshot only matters when we have a populated DB that
// is about to be mutated. Fresh DBs (appliedBefore === 0) have no data
// to lose; up-to-date DBs (expected === appliedBefore) won't trigger
// migrate() to do anything.
const migrationPending = expected > appliedBefore && appliedBefore > 0;

let backupPath: string | null = null;
if (migrationPending) {
  backupPath = takePreMigrationSnapshot(sqlite, DB_PATH, appliedBefore);
  if (backupPath) {
    console.log(`[recon-deck] Pre-migration snapshot ready: ${backupPath}`);
  } else {
    console.warn(
      "[recon-deck] Pre-migration snapshot failed; continuing without a backup. " +
        "Roll-forward only — make sure the migration is reversible.",
    );
  }
}

try {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
} catch (err) {
  console.error("[recon-deck] Migration failed:", err);
  if (backupPath) {
    console.error(
      `[recon-deck] Pre-migration snapshot is at ${backupPath}.\n` +
        `[recon-deck] To roll back: stop the dev server, then\n` +
        `  cp "${backupPath}" "${DB_PATH}"\n` +
        `  rm -f "${DB_PATH}-wal" "${DB_PATH}-shm"\n` +
        `[recon-deck] See CONTRIBUTING.md › "Migration safety and recovery" for the full procedure.`,
    );
  } else {
    console.error(
      `[recon-deck] No pre-migration snapshot was written (fresh DB or snapshot itself failed).\n` +
        `[recon-deck] Inspect the error above and fix the migration SQL before booting again.`,
    );
  }
  // Re-throw so Next.js fails the request loudly instead of serving a
  // half-migrated DB. Module-level rethrow takes the process down on cold
  // start, which is the right outcome for a corrupted boot.
  throw err;
}

// Post-migrate integrity check — only when we actually applied something,
// so cold starts on a stable DB pay no extra cost.
const appliedAfter = countAppliedMigrations(sqlite);
if (appliedAfter > appliedBefore) {
  verifyDbIntegrity(sqlite);
  console.log(
    `[recon-deck] Applied ${appliedAfter - appliedBefore} migration(s); now at ${appliedAfter}.` +
      (backupPath ? ` Snapshot: ${backupPath}` : ""),
  );
}
