-- Multi-host engagement (P1-F PR 1).
--
-- Introduces a `hosts` table so a single engagement can hold N targets
-- (DC + workstations during AD pentests, /24 sweeps, etc.). PR 1 is the
-- DB-only foundation — parsers / importer / UI continue to behave as
-- "one host per engagement" until later PRs land. Existing engagements
-- get a backfilled `is_primary = 1` row that mirrors their original
-- target_ip / target_hostname / os_*, and every existing ports row is
-- pointed at that primary host so the schema is consistent post-migration.
--
-- `engagements.target_ip` / `target_hostname` are *retained* by this PR.
-- Removing them would cascade through view-model, exports, sidebar, and
-- API surfaces — that cleanup happens in a later PR once the UI has
-- been switched to read from `hosts`.
CREATE TABLE hosts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id INTEGER NOT NULL,
  ip            TEXT NOT NULL,
  hostname      TEXT,
  state         TEXT,
  os_name       TEXT,
  os_accuracy   INTEGER,
  is_primary    INTEGER NOT NULL DEFAULT 0,
  scanned_at    TEXT,
  FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX hosts_engagement_id_idx ON hosts (engagement_id);
--> statement-breakpoint
-- Backfill: one primary host per existing engagement, mirroring the
-- legacy single-target columns. Runs before the ports.host_id link so
-- the UPDATE below can find a valid target.
INSERT INTO hosts (engagement_id, ip, hostname, state, os_name, os_accuracy, is_primary, scanned_at)
SELECT id, target_ip, target_hostname, NULL, os_name, os_accuracy, 1, scanned_at
FROM engagements;
--> statement-breakpoint
-- ports.host_id is added AFTER the backfill so the UPDATE has rows to
-- target. Nullable because SQLite ALTER TABLE ADD COLUMN cannot enforce
-- NOT NULL without a default; the application invariant is "every port
-- belongs to a host" and is enforced at write time in createFromScan.
ALTER TABLE ports ADD COLUMN host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE;
--> statement-breakpoint
UPDATE ports
SET host_id = (
  SELECT id FROM hosts
  WHERE hosts.engagement_id = ports.engagement_id AND hosts.is_primary = 1
);
--> statement-breakpoint
CREATE INDEX ports_host_id_idx ON ports (host_id);
