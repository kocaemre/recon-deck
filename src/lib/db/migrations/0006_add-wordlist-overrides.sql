-- Wordlist path overrides (P1-E).
--
-- Lets the operator point {WORDLIST_*} placeholder tokens at custom
-- filesystem paths — for installs where SecLists / dirb / rockyou live
-- somewhere other than the Kali defaults baked into
-- `src/lib/kb/wordlists.ts` (DEFAULT_WORDLISTS).
--
-- Resolution order at render time (lib/kb/wordlists.ts:interpolateWordlists):
--   1. row in this table whose `key` matches the placeholder identifier
--   2. shipped DEFAULT_WORDLISTS[key]
--   3. token left verbatim (so the user spots an unmapped key)
--
-- `key` is the uppercase identifier without braces (e.g. `WORDLIST_DIRB_COMMON`).
-- Validated against `WORDLIST_[A-Z0-9_]+` in the repo before insert.
CREATE TABLE wordlist_overrides (
  key        TEXT PRIMARY KEY,
  path       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
