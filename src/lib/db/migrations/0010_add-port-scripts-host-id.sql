-- Multi-host host script attribution (P2).
--
-- port_scripts grew a `host_id` column so host-level scripts (port_id IS
-- NULL, is_host_script = 1) can be attributed to a specific host inside
-- a multi-host engagement. Without this, two hosts with their own
-- smb-os-discovery output collide on the engagement and the UI can't
-- show "this is DC01's host scripts vs ws01's".
--
-- Port-level scripts get host_id mirrored from ports.host_id so a
-- single-shot read (`port_scripts JOIN hosts`) doesn't have to detour
-- through ports. Engagement-level AutoRecon artifacts (port_id NULL,
-- is_host_script = 0, source = 'autorecon-*') keep host_id NULL —
-- they're scoped to the engagement, not to any one host.
--
-- Backfill on existing data:
--   - port-level rows: copied from ports.host_id (always populated by
--     migration 0007).
--   - host-level rows on single-host engagements: pinned to the primary
--     host (the only candidate, so the assignment is exact).
--   - host-level rows on legacy multi-host engagements: pinned to the
--     primary host as well. This is lossy when the legacy import had
--     more than one host's scripts merged on the engagement, but the
--     codebase prior to this migration already conflated them. Future
--     re-imports populate host_id correctly via createFromScan.
--   - engagement-level AR artifacts: host_id stays NULL.

ALTER TABLE port_scripts ADD COLUMN host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE;
--> statement-breakpoint
UPDATE port_scripts
SET host_id = (
  SELECT host_id FROM ports WHERE ports.id = port_scripts.port_id
)
WHERE port_id IS NOT NULL;
--> statement-breakpoint
UPDATE port_scripts
SET host_id = (
  SELECT id FROM hosts
  WHERE hosts.engagement_id = port_scripts.engagement_id
    AND hosts.is_primary = 1
)
WHERE port_id IS NULL AND is_host_script = 1;
--> statement-breakpoint
CREATE INDEX port_scripts_host_id_idx ON port_scripts (host_id);
