/**
 * Migration safety primitives.
 *
 * Pure helpers around drizzle's bare `migrate()` call — they take a
 * snapshot before applying anything and verify integrity after. The
 * client (`./client.ts`) wires these together at boot; tests exercise
 * each piece in isolation. Kept free of `server-only` so unit tests
 * can import the module directly.
 *
 * Companion docs: CONTRIBUTING.md › "Migration safety and recovery".
 */

import type Database from "better-sqlite3";
import fs from "node:fs";

/**
 * Count rows drizzle has recorded as applied in `__drizzle_migrations`.
 *
 * Returns 0 when the table doesn't exist yet so a brand-new install
 * runs migrate() without trying to snapshot an empty DB. The table is
 * created by drizzle on its first migrate() call.
 */
export function countAppliedMigrations(sqlite: Database.Database): number {
  const exists = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
    )
    .get();
  if (!exists) return 0;
  const row = sqlite
    .prepare("SELECT COUNT(*) AS c FROM __drizzle_migrations")
    .get() as { c: number } | undefined;
  return row?.c ?? 0;
}

interface JournalShape {
  entries?: unknown[];
}

/**
 * Count migration entries in the drizzle journal — the source of truth
 * for what the codebase ships. Returns 0 on read/parse failure so
 * boot treats the DB as already-current rather than panicking; an
 * unreadable journal is its own bug, surfaced by drizzle's migrate()
 * call right after.
 */
export function countJournalEntries(journalPath: string): number {
  try {
    const raw = fs.readFileSync(journalPath, "utf8");
    const parsed = JSON.parse(raw) as JournalShape;
    return Array.isArray(parsed.entries) ? parsed.entries.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Snapshot the live DB to `<dbPath>.backup-pre-NNNN` via VACUUM INTO.
 *
 * VACUUM INTO is WAL-aware and writes a self-consistent copy in one
 * synchronous call — much safer than copying the .db file underneath
 * a running connection because better-sqlite3 may have uncheckpointed
 * writes pending in the WAL.
 *
 * The label tracks the *currently applied* migration count so a
 * snapshot path describes the state captured: `backup-pre-0009`
 * means "the DB had 9 migrations applied when this was written —
 * restoring it puts you back at 0009". An existing target file is
 * left untouched (operator decides when to recycle stale snapshots);
 * the existing path is returned so the rollback message still has a
 * concrete file to reference.
 */
export function takePreMigrationSnapshot(
  sqlite: Database.Database,
  dbPath: string,
  appliedCount: number,
): string | null {
  const label = String(appliedCount).padStart(4, "0");
  const target = `${dbPath}.backup-pre-${label}`;
  if (fs.existsSync(target)) {
    return target;
  }
  try {
    // SQL string-literal escape: double single quotes is the SQLite
    // standard. Operator home dirs can technically contain quotes;
    // the cost of escaping is one regex either way.
    const escaped = target.replace(/'/g, "''");
    sqlite.exec(`VACUUM INTO '${escaped}'`);
    return target;
  } catch {
    return null;
  }
}

/**
 * Run integrity_check + foreign_key_check on the supplied connection.
 * Throws when either reports anything other than a clean state, so a
 * partially applied migration that left orphaned rows or a corrupted
 * page surfaces at boot rather than during a later query.
 *
 * Both PRAGMAs are O(N) on table size; the caller decides when the
 * cost is worth paying (typically only after a real migration
 * applied, not on every cold start of an unchanged DB).
 */
export function verifyDbIntegrity(sqlite: Database.Database): void {
  const integrity = sqlite
    .prepare("PRAGMA integrity_check")
    .all() as Array<{ integrity_check: string }>;
  const messages = integrity.map((r) => r.integrity_check);
  if (messages.length !== 1 || messages[0] !== "ok") {
    throw new Error(
      `Database integrity check failed after migration:\n  ${messages.join("\n  ")}`,
    );
  }

  const fkViolations = sqlite.prepare("PRAGMA foreign_key_check").all() as Array<
    Record<string, unknown>
  >;
  if (fkViolations.length > 0) {
    throw new Error(
      `Database foreign key check failed after migration: ${fkViolations.length} violation(s).`,
    );
  }
}
