-- v2.2: persist sidebar collapsed state (#2).
--
-- Operators on smaller screens want to free up horizontal real estate by
-- collapsing the sidebar to a thin rail. Persisting the choice in
-- app_state means the layout survives navigation + page reloads without
-- a hydration flash (we read it server-side and SSR the right width).

ALTER TABLE app_state ADD COLUMN sidebar_collapsed INTEGER NOT NULL DEFAULT 0;
