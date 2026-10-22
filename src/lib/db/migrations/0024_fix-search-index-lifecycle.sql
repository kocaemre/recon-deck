-- Keep search results aligned with current scan data. Re-import updates port
-- metadata and replaces NSE rows; deleting a port/host cascades its children.
-- Migration 0002 indexed inserts but missed these updates and deletions.
CREATE TRIGGER ports_search_au AFTER UPDATE ON ports BEGIN
  UPDATE search_index
     SET engagement_id = NEW.engagement_id,
         title = NEW.port || '/' || NEW.protocol,
         body = COALESCE(NEW.service, '') || ' ' ||
                COALESCE(NEW.product, '') || ' ' ||
                COALESCE(NEW.version, '') || ' ' ||
                COALESCE(NEW.extrainfo, '')
   WHERE kind = 'port' AND ref_id = OLD.id;
END;
--> statement-breakpoint

CREATE TRIGGER ports_search_ad AFTER DELETE ON ports BEGIN
  DELETE FROM search_index WHERE kind = 'port' AND ref_id = OLD.id;
END;
--> statement-breakpoint

CREATE TRIGGER port_scripts_search_au AFTER UPDATE ON port_scripts BEGIN
  DELETE FROM search_index WHERE kind = 'script' AND ref_id = OLD.id;
  INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
  SELECT NEW.engagement_id, 'script', NEW.id, NEW.script_id, NEW.output
  WHERE NEW.source <> 'autorecon-screenshot';
END;
--> statement-breakpoint

CREATE TRIGGER port_scripts_search_ad AFTER DELETE ON port_scripts BEGIN
  DELETE FROM search_index WHERE kind = 'script' AND ref_id = OLD.id;
END;
--> statement-breakpoint

CREATE TRIGGER port_notes_search_ad AFTER DELETE ON port_notes BEGIN
  DELETE FROM search_index
   WHERE kind = 'note'
     AND engagement_id = OLD.engagement_id
     AND ref_id = OLD.port_id;
END;
--> statement-breakpoint

-- Repair stale metadata, orphaned hits and duplicate script hits accumulated
-- before this migration. Engagement and finding rows already have full sync
-- triggers, so leave those kinds untouched.
DELETE FROM search_index WHERE kind IN ('port', 'script', 'note');
--> statement-breakpoint

INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
SELECT engagement_id, 'port', id,
       port || '/' || protocol,
       COALESCE(service, '') || ' ' ||
       COALESCE(product, '') || ' ' ||
       COALESCE(version, '') || ' ' ||
       COALESCE(extrainfo, '')
  FROM ports;
--> statement-breakpoint

INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
SELECT engagement_id, 'script', id, script_id, output
  FROM port_scripts
 WHERE source <> 'autorecon-screenshot';
--> statement-breakpoint

-- Include empty notes, matching the existing INSERT trigger: their UPDATE
-- trigger needs the index row when a note receives text after the upgrade.
INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
SELECT engagement_id, 'note', port_id, 'note', body
  FROM port_notes;
