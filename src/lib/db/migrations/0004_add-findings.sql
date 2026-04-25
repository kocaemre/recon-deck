-- Findings tracker — pentester's discovered issues catalog.
--
-- Each finding has a severity (info|low|medium|high|critical), a short title,
-- an optional long-form description, optional CVE reference, and optional
-- evidence linkage via JSON array of port_evidence.id values.
--
-- `port_id` nullable so engagement-level findings (e.g. "Domain Admin via
-- DCSync") can live alongside per-port findings without a second table.
-- ON DELETE SET NULL on port_id (NOT cascade) — losing the finding because
-- the underlying port row was reshuffled is worse than orphaning the link.
CREATE TABLE findings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id INTEGER NOT NULL,
  port_id       INTEGER,
  severity      TEXT NOT NULL DEFAULT 'medium',
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  cve           TEXT,
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (port_id)       REFERENCES ports(id)       ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX findings_engagement_id_idx ON findings (engagement_id);
--> statement-breakpoint
CREATE INDEX findings_port_id_idx       ON findings (port_id);
--> statement-breakpoint

-- FTS5 search_index sync triggers for findings.
CREATE TRIGGER findings_search_ai AFTER INSERT ON findings BEGIN
  INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
  VALUES (
    NEW.engagement_id,
    'finding',
    NEW.id,
    NEW.title,
    COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.cve, '')
  );
END;
--> statement-breakpoint

CREATE TRIGGER findings_search_au AFTER UPDATE ON findings BEGIN
  UPDATE search_index
     SET title = NEW.title,
         body  = COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.cve, '')
   WHERE kind = 'finding' AND ref_id = NEW.id;
END;
--> statement-breakpoint

CREATE TRIGGER findings_search_ad AFTER DELETE ON findings BEGIN
  DELETE FROM search_index WHERE kind = 'finding' AND ref_id = OLD.id;
END;
