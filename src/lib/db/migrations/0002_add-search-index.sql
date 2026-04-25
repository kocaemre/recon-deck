-- Cross-engagement full-text search (FTS5).
--
-- A single virtual table holds searchable rows from every engagement-scoped
-- entity. `engagement_id`, `kind` and `ref_id` are UNINDEXED columns we use
-- only as filter / lookup metadata; FTS5 still tokenises `title` + `body`.
--
-- `kind` values: 'engagement' | 'port' | 'script' | 'note' | 'finding'.
-- `ref_id`     : the primary key of the underlying row (engagement.id for
--                kind='engagement', port.id for kind='port' / 'note',
--                port_scripts.id for kind='script', findings.id for finding).
--
-- Tokeniser: porter unicode61 — folds case, strips diacritics, stems English.
CREATE VIRTUAL TABLE search_index USING fts5(
  engagement_id UNINDEXED,
  kind UNINDEXED,
  ref_id UNINDEXED,
  title,
  body,
  tokenize = 'porter unicode61'
);
--> statement-breakpoint

-- Engagement triggers ------------------------------------------------------
CREATE TRIGGER engagements_search_ai AFTER INSERT ON engagements BEGIN
  INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
  VALUES (
    NEW.id,
    'engagement',
    NEW.id,
    NEW.name,
    NEW.target_ip || ' ' || COALESCE(NEW.target_hostname, '')
  );
END;
--> statement-breakpoint

CREATE TRIGGER engagements_search_au AFTER UPDATE ON engagements BEGIN
  UPDATE search_index
     SET title = NEW.name,
         body  = NEW.target_ip || ' ' || COALESCE(NEW.target_hostname, '')
   WHERE kind = 'engagement' AND ref_id = NEW.id;
END;
--> statement-breakpoint

-- Cascade clean-up — engagement deletion wipes every search row scoped to it.
-- Cheaper than relying on per-table delete triggers because ports/scripts/notes
-- already cascade out of engagements with FK ON DELETE CASCADE.
CREATE TRIGGER engagements_search_ad AFTER DELETE ON engagements BEGIN
  DELETE FROM search_index WHERE engagement_id = OLD.id;
END;
--> statement-breakpoint

-- Port triggers ------------------------------------------------------------
CREATE TRIGGER ports_search_ai AFTER INSERT ON ports BEGIN
  INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
  VALUES (
    NEW.engagement_id,
    'port',
    NEW.id,
    NEW.port || '/' || NEW.protocol,
    COALESCE(NEW.service, '')   || ' ' ||
    COALESCE(NEW.product, '')   || ' ' ||
    COALESCE(NEW.version, '')   || ' ' ||
    COALESCE(NEW.extrainfo, '')
  );
END;
--> statement-breakpoint

-- Port-script triggers (NSE / AutoRecon files / artifacts) -----------------
CREATE TRIGGER port_scripts_search_ai AFTER INSERT ON port_scripts BEGIN
  INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
  -- Skip binary base64 blobs (autorecon-screenshot) — would pollute the index
  -- with non-text content with no useful match value.
  SELECT NEW.engagement_id, 'script', NEW.id, NEW.script_id, NEW.output
  WHERE NEW.source <> 'autorecon-screenshot';
END;
--> statement-breakpoint

-- Port-notes triggers ------------------------------------------------------
CREATE TRIGGER port_notes_search_ai AFTER INSERT ON port_notes BEGIN
  INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
  VALUES (NEW.engagement_id, 'note', NEW.port_id, 'note', NEW.body);
END;
--> statement-breakpoint

CREATE TRIGGER port_notes_search_au AFTER UPDATE ON port_notes BEGIN
  UPDATE search_index
     SET body = NEW.body
   WHERE kind = 'note'
     AND engagement_id = NEW.engagement_id
     AND ref_id        = NEW.port_id;
END;
--> statement-breakpoint

-- Backfill existing rows ---------------------------------------------------
-- One-time migration step: populate search_index with everything currently
-- stored. After this, the triggers keep it in sync going forward.
INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
SELECT id, 'engagement', id, name,
       target_ip || ' ' || COALESCE(target_hostname, '')
  FROM engagements;
--> statement-breakpoint

INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
SELECT engagement_id, 'port', id,
       port || '/' || protocol,
       COALESCE(service, '')   || ' ' ||
       COALESCE(product, '')   || ' ' ||
       COALESCE(version, '')   || ' ' ||
       COALESCE(extrainfo, '')
  FROM ports;
--> statement-breakpoint

INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
SELECT engagement_id, 'script', id, script_id, output
  FROM port_scripts
 WHERE source <> 'autorecon-screenshot';
--> statement-breakpoint

INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
SELECT engagement_id, 'note', port_id, 'note', body
  FROM port_notes
 WHERE body <> '';
