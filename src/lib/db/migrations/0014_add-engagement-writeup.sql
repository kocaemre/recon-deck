-- Engagement-level writeup body (v1.3.0 #9).
--
-- Single additive column on `engagements`:
--
--   writeup  Plain-text body that gives the operator a place to draft the
--            executive summary / narrative for an engagement without
--            leaving recon-deck. Plain textarea for v1 — markdown preview
--            is deferred until users actually ask for it.
--
-- Default is the empty string (NOT NULL) so the engagement page can
-- render the section unconditionally without null guards. Markdown export
-- prepends the writeup as `## Writeup\n\n${writeup}\n\n---\n` block when
-- non-empty; SysReptor / PwnDoc exports drop it into `notes` /
-- `executive_summary`.

ALTER TABLE engagements ADD COLUMN writeup TEXT NOT NULL DEFAULT '';
