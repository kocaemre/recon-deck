-- Screenshot annotation parent linkage (v2.0.0 #7).
--
-- Single additive nullable column on `port_evidence`:
--
--   parent_evidence_id   FK candidate. When the operator saves an
--                        annotated PNG via the screenshot annotator,
--                        we INSERT a NEW evidence row and stamp this
--                        column with the source row's id. Original
--                        evidence stays untouched (immutable history)
--                        so the operator can re-annotate or compare.
--
-- No FK constraint — SQLite ALTER TABLE ADD COLUMN can't enforce one
-- after the fact. Application invariant: parent_evidence_id, when
-- non-null, references a row in the SAME engagement. Stale ids degrade
-- gracefully (UI just doesn't render the "annotated from" link).
--
-- No index — we never query "all annotations of a parent" in isolation;
-- the gallery already paginates per port_id.

ALTER TABLE port_evidence ADD COLUMN parent_evidence_id INTEGER;
