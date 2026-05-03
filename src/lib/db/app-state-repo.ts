import "server-only";

/**
 * app_state singleton repo (v1.9.0).
 *
 * Migration 0017 seeds the `id = 1` row at install time, so every read
 * is allowed to assume non-null. The setter is UPDATE-only — no upsert,
 * no INSERT — because the row is guaranteed to exist by the migration.
 *
 * Layered precedence for the path config:
 *   - DB value wins when set (operator filled it during onboarding or
 *     edited it under /settings).
 *   - Legacy env (`RECON_KB_USER_DIR`, `NEXT_PUBLIC_RECON_LOCAL_EXPORT_DIR`)
 *     is the fallback so existing installs that haven't onboarded yet
 *     keep working.
 *
 * The fallback resolver lives in `effectiveAppState()` so call sites
 * (KB loader, OpenInEditorLink) get one place to read from.
 */

import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { app_state, type AppState } from "./schema";
import type * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

/** Read the singleton row. Throws if the migration didn't seed (boot-time bug). */
export function getAppState(db: Db): AppState {
  const row = db
    .select()
    .from(app_state)
    .where(eq(app_state.id, 1))
    .get();
  if (!row) {
    throw new Error(
      "app_state row missing — migration 0017 didn't run or was rolled back",
    );
  }
  return row;
}

export interface AppStatePatch {
  onboarded_at?: string | null;
  local_export_dir?: string | null;
  kb_user_dir?: string | null;
  wordlist_base?: string | null;
  update_check?: boolean;
  sidebar_collapsed?: boolean;
}

/** Partial UPDATE on the singleton; bumps `updated_at` automatically. */
export function setAppState(db: Db, patch: AppStatePatch): AppState {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };
  if (patch.onboarded_at !== undefined) update.onboarded_at = patch.onboarded_at;
  if (patch.local_export_dir !== undefined)
    update.local_export_dir = patch.local_export_dir;
  if (patch.kb_user_dir !== undefined) update.kb_user_dir = patch.kb_user_dir;
  if (patch.wordlist_base !== undefined)
    update.wordlist_base = patch.wordlist_base;
  if (patch.update_check !== undefined) update.update_check = patch.update_check;
  if (patch.sidebar_collapsed !== undefined)
    update.sidebar_collapsed = patch.sidebar_collapsed;

  db.update(app_state).set(update).where(eq(app_state.id, 1)).run();
  return getAppState(db);
}

/**
 * Stamp `onboarded_at = now()` along with the final form values from
 * the /welcome flow. Convenience wrapper around setAppState.
 */
export function markOnboarded(
  db: Db,
  values: Omit<AppStatePatch, "onboarded_at">,
): AppState {
  return setAppState(db, {
    ...values,
    onboarded_at: new Date().toISOString(),
  });
}

/** Clear `onboarded_at`. Used by /settings → Replay onboarding. */
export function replayOnboarding(db: Db): AppState {
  return setAppState(db, { onboarded_at: null });
}

/**
 * Effective config — runtime DB value first, legacy env fallback second.
 * Call this from KB loader / OpenInEditorLink so we don't sprinkle the
 * fallback chain everywhere.
 */
export interface EffectiveConfig {
  localExportDir: string | null;
  kbUserDir: string | null;
  wordlistBase: string | null;
  updateCheck: boolean;
  sidebarCollapsed: boolean;
  onboardedAt: string | null;
}

export function effectiveAppState(db: Db): EffectiveConfig {
  const row = getAppState(db);
  return {
    localExportDir:
      row.local_export_dir ??
      process.env.RECON_LOCAL_EXPORT_DIR ??
      process.env.NEXT_PUBLIC_RECON_LOCAL_EXPORT_DIR ??
      null,
    kbUserDir: row.kb_user_dir ?? process.env.RECON_KB_USER_DIR ?? null,
    wordlistBase: row.wordlist_base ?? null,
    updateCheck: row.update_check,
    sidebarCollapsed: row.sidebar_collapsed,
    onboardedAt: row.onboarded_at,
  };
}
