-- Engagement portfolio management (v1.2.0).
--
-- Two additive columns on `engagements`:
--
--   tags         JSON array string ("[]" default). Free-form labels —
--                "htb", "oscp", "client-acme", "internal", whatever the
--                operator wants. Sidebar renders one chip per tag and
--                surfaces a tag-filter strip; FTS is unchanged (search
--                already keys on engagement.name).
--
--   is_archived  Boolean flag (0/1). Sidebar's default Active view hides
--                these; toggling to Archived surfaces them. Archive is a
--                soft-state — cascade delete is unaffected, FTS still
--                indexes them so the global search modal remains useful
--                across an operator's entire history.
--
-- Both fields default to "off" / "[]" so existing rows are migrated
-- without any backfill UPDATE — the column DEFAULT does the work.

ALTER TABLE engagements ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE engagements ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX engagements_is_archived_idx ON engagements (is_archived);
