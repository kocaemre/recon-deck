-- Scan history (P1-G PR 1).
--
-- Tracks every nmap re-import performed against an engagement so a future
-- diff view can highlight what changed between scans (new port opened,
-- previously-open port closed, service version drift, …). PR 1 lands the
-- persistence layer; PR 2 will surface the diff in the UI.
--
-- Lifecycle columns on `ports`:
--   - first_seen_scan_id : the scan that first observed this port (immutable)
--   - last_seen_scan_id  : the most recent scan that still saw it open
--   - closed_at_scan_id  : nullable; set when a re-import doesn't see the port
--
-- All three are nullable in the column definition because SQLite ALTER TABLE
-- ADD COLUMN cannot enforce NOT NULL without a default. The application
-- invariant is "first_seen + last_seen are non-null after migration 0008".
-- Migration backfills both to the inaugural scan_history row per engagement.
--
-- Backfill (also done in this migration so existing engagements behave
-- correctly the moment the user re-imports):
--   1. INSERT one scan_history row per engagement, mirroring the legacy
--      engagements.raw_input / source / scanned_at / created_at.
--   2. UPDATE ports.first_seen_scan_id = (that row's id).
--   3. UPDATE ports.last_seen_scan_id  = first_seen_scan_id.
CREATE TABLE scan_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id INTEGER NOT NULL,
  raw_input     TEXT NOT NULL,
  source        TEXT NOT NULL,
  scanned_at    TEXT,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX scan_history_engagement_id_idx ON scan_history (engagement_id);
--> statement-breakpoint
ALTER TABLE ports ADD COLUMN first_seen_scan_id INTEGER REFERENCES scan_history(id);
--> statement-breakpoint
ALTER TABLE ports ADD COLUMN last_seen_scan_id  INTEGER REFERENCES scan_history(id);
--> statement-breakpoint
ALTER TABLE ports ADD COLUMN closed_at_scan_id  INTEGER REFERENCES scan_history(id);
--> statement-breakpoint
-- Backfill #1: one inaugural scan_history row per existing engagement.
INSERT INTO scan_history (engagement_id, raw_input, source, scanned_at, created_at)
SELECT id, raw_input, source, scanned_at, created_at
FROM engagements;
--> statement-breakpoint
-- Backfill #2: every existing port points at its engagement's inaugural scan.
UPDATE ports
SET first_seen_scan_id = (
  SELECT id FROM scan_history
  WHERE scan_history.engagement_id = ports.engagement_id
  ORDER BY id ASC LIMIT 1
);
--> statement-breakpoint
UPDATE ports SET last_seen_scan_id = first_seen_scan_id;
