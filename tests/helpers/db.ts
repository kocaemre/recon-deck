/**
 * Test database factory — creates a fresh in-memory SQLite DB per test.
 *
 * NEVER import src/lib/db/client.ts in tests — the module-level singleton
 * persists across test cases and breaks isolation (RESEARCH Pitfall 6).
 *
 * Usage:
 *   const db = createTestDb();
 *   // ... run queries against db
 *   // db is garbage-collected after test scope ends (no explicit teardown)
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../../src/lib/db/schema.js";
import path from "node:path";

const MIGRATIONS = path.resolve("src/lib/db/migrations");

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}
