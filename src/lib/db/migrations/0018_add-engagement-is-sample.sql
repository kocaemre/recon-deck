-- Sample-engagement marker for the bundled lame.htb fixture (v1.9.0).
--
-- Single additive boolean column on `engagements`:
--
--   is_sample   1 when the row was seeded via the "Try sample" button
--               on the post-onboarding paste panel; 0 for everything
--               imported from real nmap output. Drives a `sample` chip
--               on the engagement header + a one-click "Discard sample"
--               action that hard-deletes the row (no soft-delete dance —
--               sample data is meant to be ephemeral).
--
-- Defaults to 0 so existing rows migrate without a backfill UPDATE.
-- No index — we never query "all sample engagements"; the chip render
-- happens per-row at engagement detail page.

ALTER TABLE engagements ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
