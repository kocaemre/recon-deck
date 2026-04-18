import "server-only";

/**
 * Database client singleton -- Phase 3 boot infrastructure.
 *
 * Boot sequence (D-06): probe -> Database -> WAL -> FK -> busy_timeout -> migrate -> export.
 *
 * Module-level evaluation: better-sqlite3 is synchronous, Next.js evaluates
 * module-level code once per process start. This singleton is safe and the
 * simplest approach for a single-user, single-process app.
 *
 * PERSIST-05: WAL mode + idempotent boot-time migrations.
 * PERSIST-06: Writability probe runs before Database constructor.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { checkWritability } from "./probe";
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

// D-06 Step 1: Writability probe (PERSIST-06)
checkWritability(DB_DIR);

// D-06 Step 2: Open database
const sqlite = new Database(DB_PATH);

// D-06 Step 3-5: Pragmas (D-09: WAL before any queries, Pitfall 5: FK per connection)
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

// D-06 Step 6: Idempotent migrations (PERSIST-05)
export const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: MIGRATIONS_DIR });
