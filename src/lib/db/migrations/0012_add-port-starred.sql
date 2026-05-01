-- Port starring (v1.2.0 #11).
--
-- Single additive column on `ports`:
--
--   starred  Boolean flag (0/1). Heatmap renders a ★ icon top-right on
--            starred tiles and sorts starred ports first within their
--            host group. Lets operators flag the 2-3 ports they're
--            actively pivoting on without polluting the findings catalog
--            (which is for actual write-up-worthy issues).
--
-- Defaults to off so existing rows migrate without a backfill UPDATE.
-- No index — the heatmap renders all open ports already, the flag just
-- changes their sort weight + adds a glyph; we never query "WHERE
-- starred = 1" in isolation.

ALTER TABLE ports ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
