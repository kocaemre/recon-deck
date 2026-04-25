-- Per-port evidence (screenshots + arbitrary binary attachments).
--
-- Stores binary content as base64 in TEXT — keeps the schema portable to
-- bun:sqlite (no BLOB nuances) and lets exports include images inline. A
-- per-row 4 MB cap is enforced application-side (see evidence-repo.ts).
--
-- `port_id` is nullable so the host-level evidence (engagement-wide
-- screenshots / proof-of-compromise images) can live here too without
-- requiring a separate table.
--
-- `source` distinguishes manually-uploaded evidence from the gowitness/
-- aquatone PNGs lifted out of an AutoRecon zip at import time.
CREATE TABLE port_evidence (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id INTEGER NOT NULL,
  port_id       INTEGER,
  filename      TEXT NOT NULL,
  mime          TEXT NOT NULL,
  data_b64      TEXT NOT NULL,
  caption       TEXT,
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TEXT NOT NULL,
  FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (port_id)       REFERENCES ports(id)       ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX port_evidence_port_id_idx       ON port_evidence (port_id);
--> statement-breakpoint
CREATE INDEX port_evidence_engagement_id_idx ON port_evidence (engagement_id);
