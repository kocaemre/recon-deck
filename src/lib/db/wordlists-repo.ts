import "server-only";

/**
 * Wordlist override CRUD (P1-E).
 *
 * Backs the `/settings/wordlists` editor and supplies `getWordlistOverridesMap`
 * to the engagement page + view-model so `{WORDLIST_*}` placeholders resolve
 * to operator-customized paths instead of the Kali defaults shipped in
 * `src/lib/kb/wordlists.ts`.
 *
 * Validation: `key` is uppercase + digits + underscores after a `WORDLIST_`
 * prefix. Anything else is rejected so the table can never accumulate junk
 * keys that no command template could ever match.
 */

import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { wordlist_overrides, type WordlistOverride } from "./schema";
import type * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

const KEY_RE = /^WORDLIST_[A-Z0-9_]+$/;

/** True iff `key` matches the WORDLIST_ identifier shape (no braces). */
export function isValidWordlistKey(key: string): boolean {
  return KEY_RE.test(key);
}

export function listWordlistOverrides(db: Db): WordlistOverride[] {
  return db
    .select()
    .from(wordlist_overrides)
    .all()
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Convenience reader for the interpolation pipeline — flattens rows into
 * `{ KEY: path }` so it can pass straight into `interpolateWordlists`.
 */
export function getWordlistOverridesMap(db: Db): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of db.select().from(wordlist_overrides).all()) {
    out[row.key] = row.path;
  }
  return out;
}

/**
 * Insert-or-replace. Mutating an existing key resets `updated_at`. Returns
 * the row that ended up in the table.
 *
 * Throws if `key` doesn't match the allowlist shape — caller (API route)
 * should surface a 400 before reaching here.
 */
export function upsertWordlistOverride(
  db: Db,
  key: string,
  path: string,
): WordlistOverride {
  if (!isValidWordlistKey(key)) {
    throw new Error(`Invalid wordlist key: ${key}`);
  }
  const trimmedPath = path.trim();
  if (trimmedPath.length === 0) {
    throw new Error("Path cannot be empty.");
  }
  const now = new Date().toISOString();
  return db
    .insert(wordlist_overrides)
    .values({ key, path: trimmedPath, updated_at: now })
    .onConflictDoUpdate({
      target: wordlist_overrides.key,
      set: { path: trimmedPath, updated_at: now },
    })
    .returning()
    .get();
}

export function deleteWordlistOverride(db: Db, key: string): boolean {
  return (
    db
      .delete(wordlist_overrides)
      .where(eq(wordlist_overrides.key, key))
      .run().changes > 0
  );
}
