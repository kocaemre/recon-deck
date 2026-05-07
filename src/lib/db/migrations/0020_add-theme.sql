-- v2.3.0 #3: persist UI theme preference.
--
-- Tri-state — "system" follows prefers-color-scheme (default), "dark" and
-- "light" are explicit overrides. Stored as TEXT (not enum) because SQLite
-- doesn't have native enum support; the app-state-repo narrows it to the
-- ThemeMode union before exposing.

ALTER TABLE app_state ADD COLUMN theme TEXT NOT NULL DEFAULT 'system';
