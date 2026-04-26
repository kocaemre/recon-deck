-- Drop legacy engagements.target_ip / target_hostname (P1-F follow-up).
--
-- Since migration 0007 every engagement carries its target identity inside
-- the `hosts` table (`is_primary = 1` row mirrors what target_ip / hostname
-- used to hold). The application has been dual-writing both surfaces ever
-- since; this migration retires the legacy columns and switches FTS5 over
-- to use the engagement's auto-generated `name` (which is already
-- "hostname (ip)" or "ip" depending on hostname presence).
--
-- Order matters:
--   1. Recreate the engagements FTS triggers so they no longer reference
--      target_ip / target_hostname. SQLite's ALTER TABLE DROP COLUMN refuses
--      to run while a trigger still references the column.
--   2. ALTER TABLE DROP COLUMN (SQLite >= 3.35).
--
-- Search behaviour: engagement rows in `search_index` previously had body =
-- "<ip> <hostname>". After this migration the body is just `name`, which
-- contains both substrings ("box.htb (10.10.10.5)") so the user-facing
-- /search experience is preserved.

DROP TRIGGER engagements_search_ai;
--> statement-breakpoint
DROP TRIGGER engagements_search_au;
--> statement-breakpoint
CREATE TRIGGER engagements_search_ai AFTER INSERT ON engagements BEGIN
  INSERT INTO search_index (engagement_id, kind, ref_id, title, body)
  VALUES (NEW.id, 'engagement', NEW.id, NEW.name, NEW.name);
END;
--> statement-breakpoint
CREATE TRIGGER engagements_search_au AFTER UPDATE ON engagements BEGIN
  UPDATE search_index
     SET title = NEW.name,
         body  = NEW.name
   WHERE kind = 'engagement' AND ref_id = NEW.id;
END;
--> statement-breakpoint
ALTER TABLE engagements DROP COLUMN target_hostname;
--> statement-breakpoint
ALTER TABLE engagements DROP COLUMN target_ip;
