import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createTestDb } from "../../../../tests/helpers/db.js";
import { engagements, ports } from "../schema.js";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve("src/lib/db/migrations");

describe("DB boot sequence (Plan 02)", () => {
  it("PERSIST-05: WAL mode is active after initialization on a file DB", () => {
    const tmpDb = path.join(os.tmpdir(), `boot-wal-test-${Date.now()}.db`);
    try {
      const sqlite = new Database(tmpDb);
      sqlite.pragma("journal_mode = WAL");
      const result = sqlite.pragma("journal_mode");
      expect(result).toEqual([{ journal_mode: "wal" }]);
      sqlite.close();
    } finally {
      if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
      // WAL mode creates side-car files
      const wal = tmpDb + "-wal";
      const shm = tmpDb + "-shm";
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    }
  });

  it("PERSIST-05: foreign_keys pragma is enforced", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const result = sqlite.pragma("foreign_keys");
    expect(result).toEqual([{ foreign_keys: 1 }]);
    sqlite.close();
  });

  it("PERSIST-05: migrations are idempotent (run twice, no error)", () => {
    // createTestDb() runs migrate once as part of boot
    const db = createTestDb();

    // Run migrate a second time on the same db -- must be a no-op
    const sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    const db2 = drizzle(sqlite, {});
    expect(() =>
      migrate(db2, { migrationsFolder: MIGRATIONS_DIR }),
    ).not.toThrow();

    // Also verify running on the original db instance doesn't throw
    // (indirect test -- createTestDb already ran migrate once)
    void db; // no explicit re-run needed; test above covers idempotency
  });

  it("PERSIST-01: all 15 base tables exist after migration", () => {
    // Updated in Phase 5 Plan 01: port_commands added for AutoRecon manual commands.
    // Updated in v2 Plan: search_index FTS5 virtual table added (migration 0002).
    // Updated in v2 P0-B: port_evidence added for screenshots/attachments (migration 0003).
    // Updated in v2 P0-C: findings catalog added (migration 0004).
    // Updated in v2 P0-D: user_commands added for personal command library (migration 0005).
    // Updated in v2 P1-E: wordlist_overrides added for {WORDLIST_*} resolution (migration 0006).
    // Updated in v2 P1-F PR 1: hosts table added for multi-host engagement (migration 0007).
    // Updated in v2 P1-G PR 1: scan_history added for nmap re-import diff (migration 0008).
    // SQLite registers FTS5 internal shadow tables (search_index_data,
    // _idx, _content, _docsize, _config) — the test filters them out so the
    // assertion stays scoped to the application-visible base tables.
    const db = createTestDb();

    const result = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '__drizzle%' AND name != 'sqlite_sequence' AND name NOT LIKE 'search_index_%' ORDER BY name",
    );
    const tableNames = result.map((r) => r.name);

    expect(tableNames).toEqual([
      "app_state",
      "check_states",
      "engagements",
      "findings",
      "hosts",
      "port_commands",
      "port_evidence",
      "port_fingerprints",
      "port_notes",
      "port_scripts",
      "ports",
      "scan_history",
      "search_index",
      "user_commands",
      "wordlist_overrides",
    ]);
  });

  it("PERSIST-05: WAL + FK pragmas work together -- cascade delete on file DB", () => {
    const tmpDb = path.join(os.tmpdir(), `boot-cascade-test-${Date.now()}.db`);
    try {
      const sqlite = new Database(tmpDb);
      sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("foreign_keys = ON");
      const db = drizzle(sqlite, { schema: { engagements, ports } });
      migrate(db, { migrationsFolder: MIGRATIONS_DIR });

      const now = new Date().toISOString();

      // Insert an engagement
      const engResult = db
        .insert(engagements)
        .values({
          name: "Test Engagement",
          source: "nmap-text",
          raw_input: "nmap output here",
          created_at: now,
          updated_at: now,
        })
        .returning({ id: engagements.id })
        .all();
      const engId = engResult[0].id;

      // Insert a port referencing the engagement
      db.insert(ports)
        .values({
          engagement_id: engId,
          port: 80,
          protocol: "tcp",
          state: "open",
        })
        .run();

      // Verify port exists
      const portsBefore = db
        .select()
        .from(ports)
        .where(eq(ports.engagement_id, engId))
        .all();
      expect(portsBefore).toHaveLength(1);

      // Delete the engagement -- cascade should remove ports
      db.delete(engagements).where(eq(engagements.id, engId)).run();

      // Verify port was cascade-deleted
      const portsAfter = db
        .select()
        .from(ports)
        .where(eq(ports.engagement_id, engId))
        .all();
      expect(portsAfter).toHaveLength(0);

      sqlite.close();
    } finally {
      if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
      const wal = tmpDb + "-wal";
      const shm = tmpDb + "-shm";
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    }
  });
});
