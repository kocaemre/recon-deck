import "server-only";

import fs from "node:fs";
import path from "node:path";

/**
 * Returns the latest applied Drizzle migration tag (e.g. `0009_drop-engagement-target`).
 *
 * Read once at module init and cached — the journal is shipped with the
 * codebase, not the runtime database, so the file content is immutable
 * across the life of a deploy.
 *
 * Surfaced in the sidebar footer + footer of the print report so operators
 * always know which schema version their DB was created/upgraded against.
 * Pairs with the README "Backup & Restore" section's restore-compatibility
 * note (forward-only migrations: an N-tagged backup needs >= N to restore).
 */
const JOURNAL_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "db",
  "migrations",
  "meta",
  "_journal.json",
);

interface JournalEntry {
  idx: number;
  tag: string;
}

interface Journal {
  entries?: JournalEntry[];
}

function readLatestTag(): string {
  try {
    const raw = fs.readFileSync(JOURNAL_PATH, "utf8");
    const parsed = JSON.parse(raw) as Journal;
    const entries = parsed.entries ?? [];
    if (entries.length === 0) return "unknown";
    const latest = entries.reduce((acc, e) =>
      e.idx > acc.idx ? e : acc,
    );
    return latest.tag;
  } catch {
    return "unknown";
  }
}

export const LATEST_MIGRATION_TAG = readLatestTag();

/**
 * Short label for UI chips: e.g. `0009` from `0009_drop-engagement-target`.
 */
export const SCHEMA_VERSION_LABEL = LATEST_MIGRATION_TAG.split("_")[0];
