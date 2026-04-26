import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  countAppliedMigrations,
  countJournalEntries,
  takePreMigrationSnapshot,
  verifyDbIntegrity,
} from "../migration-safety.js";

const MIGRATIONS_DIR = path.resolve("src/lib/db/migrations");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

// Per-test scratch dirs so VACUUM INTO can write real .db files without
// stepping on a sibling case. afterEach unlinks both the live DB and any
// backup snapshot the test produced.
const scratchPaths: string[] = [];
function tmpDbPath(label: string): string {
  const p = path.join(os.tmpdir(), `migsafe-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  scratchPaths.push(p);
  return p;
}

afterEach(() => {
  while (scratchPaths.length > 0) {
    const p = scratchPaths.pop()!;
    for (const ext of ["", "-wal", "-shm"]) {
      try {
        fs.unlinkSync(p + ext);
      } catch {
        // already gone
      }
    }
    // Snapshots use any 4-digit suffix; remove the whole prefix.
    const dir = path.dirname(p);
    const base = path.basename(p);
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith(base + ".backup-pre-")) {
        try {
          fs.unlinkSync(path.join(dir, entry));
        } catch {
          // ignore
        }
      }
    }
  }
});

describe("migration-safety helpers", () => {
  it("countAppliedMigrations returns 0 when __drizzle_migrations is missing", () => {
    const sqlite = new Database(":memory:");
    expect(countAppliedMigrations(sqlite)).toBe(0);
    sqlite.close();
  });

  it("countAppliedMigrations matches the row count after migrate()", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite, {});
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    const journalCount = countJournalEntries(JOURNAL_PATH);
    expect(countAppliedMigrations(sqlite)).toBe(journalCount);
    sqlite.close();
  });

  it("countJournalEntries returns 0 for a non-existent journal", () => {
    expect(countJournalEntries("/tmp/does-not-exist.json")).toBe(0);
  });

  it("countJournalEntries returns 0 for malformed JSON", () => {
    const tmp = path.join(os.tmpdir(), `bad-journal-${Date.now()}.json`);
    fs.writeFileSync(tmp, "{not json");
    try {
      expect(countJournalEntries(tmp)).toBe(0);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it("countJournalEntries reads entries[].length from a real journal", () => {
    // The shipped journal must always have at least one entry.
    expect(countJournalEntries(JOURNAL_PATH)).toBeGreaterThan(0);
  });

  it("takePreMigrationSnapshot writes a self-consistent VACUUM INTO copy", () => {
    const dbPath = tmpDbPath("snapshot");
    const sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite, {});
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    const target = takePreMigrationSnapshot(sqlite, dbPath, 9);
    expect(target).toBe(`${dbPath}.backup-pre-0009`);
    expect(fs.existsSync(target!)).toBe(true);

    // The snapshot must itself be a valid SQLite DB carrying the same
    // schema as the source — opening it and counting tables proves the
    // VACUUM INTO produced a real copy, not just an empty file.
    const restored = new Database(target!);
    const tables = restored
      .prepare(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='engagements'",
      )
      .get() as { c: number };
    expect(tables.c).toBe(1);
    restored.close();
    sqlite.close();
  });

  it("takePreMigrationSnapshot is idempotent: existing snapshot is preserved", () => {
    const dbPath = tmpDbPath("idempotent");
    const sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    const db = drizzle(sqlite, {});
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    const first = takePreMigrationSnapshot(sqlite, dbPath, 5);
    expect(first).not.toBeNull();
    const firstStat = fs.statSync(first!);

    // Bump applied count to 5 (same label) → second call must reuse, not overwrite.
    const second = takePreMigrationSnapshot(sqlite, dbPath, 5);
    expect(second).toBe(first);
    const secondStat = fs.statSync(second!);
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);

    sqlite.close();
  });

  it("takePreMigrationSnapshot zero-pads the label to 4 digits", () => {
    const dbPath = tmpDbPath("padding");
    const sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    const db = drizzle(sqlite, {});
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    const target = takePreMigrationSnapshot(sqlite, dbPath, 7);
    expect(target).toBe(`${dbPath}.backup-pre-0007`);
    sqlite.close();
  });

  it("verifyDbIntegrity passes on a freshly migrated DB", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite, {});
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    expect(() => verifyDbIntegrity(sqlite)).not.toThrow();
    sqlite.close();
  });

  it("verifyDbIntegrity throws when foreign_key_check finds an orphan", () => {
    // Disable FK enforcement so we can deliberately stage an orphan,
    // then re-enable for the check to surface it. This mirrors what a
    // partially applied migration could leave behind.
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = OFF");
    const db = drizzle(sqlite, {});
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    sqlite.exec(
      `INSERT INTO engagements (name, source, raw_input, created_at, updated_at)
       VALUES ('orphan-parent', 'nmap-text', '<raw>', '2026-01-01', '2026-01-01');`,
    );
    sqlite.exec(
      `INSERT INTO ports (engagement_id, port, protocol, state)
       VALUES (999999, 22, 'tcp', 'open');`,
    );
    sqlite.pragma("foreign_keys = ON");

    expect(() => verifyDbIntegrity(sqlite)).toThrowError(
      /foreign key check failed/i,
    );
    sqlite.close();
  });
});
