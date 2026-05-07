-- v2.4.0 P2 (#27): per-port fingerprint store for context-aware checklists (#14).
--
-- Each row is one signal extracted from a scan input — `tech` (e.g. php,
-- wordpress, apache), `cves` (CVE-YYYY-NNNNN matched in product/script
-- output), or `banners` (product + version + extrainfo joined). The
-- resolver (P4) reads these to decide which conditional KB groups
-- activate for a port.
--
-- `source` distinguishes nmap-derived rows from AutoRecon-derived ones
-- (P3) so re-imports can refresh one set without touching the other —
-- a fresh nmap rescan shouldn't blow away AutoRecon-derived tech tags
-- and vice versa.
--
-- UNIQUE (port_id, source, type, value) makes per-port replace operations
-- idempotent: re-extraction inserts the same rows on a no-op rescan and
-- the constraint quietly absorbs the duplicates. Inserts in the
-- repo layer use ON CONFLICT DO NOTHING for the same reason.

CREATE TABLE port_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  port_id INTEGER NOT NULL REFERENCES ports(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('nmap', 'autorecon')),
  type TEXT NOT NULL CHECK (type IN ('tech', 'cves', 'banners')),
  value TEXT NOT NULL,
  UNIQUE (port_id, source, type, value)
);
--> statement-breakpoint
CREATE INDEX port_fingerprints_port_id_idx ON port_fingerprints (port_id);
