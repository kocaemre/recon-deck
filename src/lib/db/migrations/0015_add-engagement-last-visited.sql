-- Resume-here banner support (v1.4.0 #15).
--
-- Two additive nullable columns on `engagements`:
--
--   last_visited_at        ISO-8601 timestamp set every time the
--                          engagement detail page server-renders. Drives
--                          the "Resume {engagement}" banner on the
--                          landing page (most recent wins, capped at
--                          7 days so stale engagements don't dominate).
--
--   last_visited_port_id   FK candidate (no constraint to keep the
--                          migration cheap on SQLite — orphan ids are
--                          ignored at read time when the port is gone).
--                          Stored when the operator deep-links to a
--                          specific port via `?port=…`; lets the banner
--                          jump straight back into the host:port the
--                          pentester was on.
--
-- Both NULL-by-default — no backfill required. No index — the landing
-- page only cares about the single most-recently-visited row, ORDER
-- BY last_visited_at DESC LIMIT 1 over <200 rows is well within budget.

ALTER TABLE engagements ADD COLUMN last_visited_at TEXT;
--> statement-breakpoint
ALTER TABLE engagements ADD COLUMN last_visited_port_id INTEGER;
