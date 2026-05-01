-- Singleton app_state k/v table for first-run onboarding (v1.9.0).
--
-- One row per install (id = 1, enforced via PRIMARY KEY + the repo
-- always upserting that single id). Stores:
--
--   onboarded_at        ISO timestamp of when the operator finished the
--                        /welcome flow. NULL = never onboarded → app
--                        guards every other route and redirects to
--                        /welcome until set.
--
--   local_export_dir    Operator-provided absolute path. Replaces the
--                        legacy `NEXT_PUBLIC_RECON_LOCAL_EXPORT_DIR`
--                        build-time env. The opt-in vscode://file/…
--                        link reads this at runtime.
--
--   kb_user_dir         Optional override for the KB user directory.
--                        Layered on top of the existing RECON_KB_USER_DIR
--                        env (runtime app_state wins; env stays as
--                        legacy fallback so existing operators don't
--                        get surprised).
--
--   wordlist_base       SecLists / dirb root, interpolated as $WL in
--                        command templates. New concept on top of the
--                        existing per-key override map (the map handles
--                        precise overrides; this handles a base path).
--
--   update_check        Opt-in flag for the GitHub releases version
--                        check. Defaults to false — recon-deck stays
--                        offline-by-default (OPS-03) unless the operator
--                        explicitly opts in.
--
--   updated_at          Bookkeeping for diagnostics.
--
-- The CHECK constraint pins id = 1 so an accidental insert from a
-- mishaped repo can't shadow the singleton.

CREATE TABLE app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  onboarded_at TEXT,
  local_export_dir TEXT,
  kb_user_dir TEXT,
  wordlist_base TEXT,
  update_check INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO app_state (id, update_check, updated_at)
VALUES (1, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
