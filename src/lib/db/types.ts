/**
 * Persistence layer composite types — Phase 3 output shape.
 *
 * Consumed by:
 * - Phase 4 (API + UI) — engagement detail pages, sidebar list
 * - Phase 5 (AutoRecon importer) — creates engagements via repo
 * - Phase 6 (Exports) — reads full engagement state
 *
 * NO runtime dependencies — pure TypeScript type declarations only.
 * Table-level types (Engagement, Port, etc.) are exported from schema.ts.
 * These composite types assemble table rows into the shapes API consumers need.
 */

import type {
  Engagement,
  Port,
  PortScript,
  CheckState,
  PortNote,
  PortCommand,
  PortEvidence,
  Finding,
  Host,
} from "./schema";

/**
 * Port with its scripts, check states, notes, and AutoRecon commands assembled.
 *
 * `commands` holds AutoRecon-sourced commands from `_manual_commands.txt`
 * (Phase 5 D-06). KB commands are NOT included here — they remain
 * server-rendered from YAML at read time per the KB strategy.
 */
export type PortWithDetails = Port & {
  scripts: PortScript[];
  checks: CheckState[];
  notes: PortNote | null;
  commands: PortCommand[];
};

/** Full engagement with all nested data for detail view / export */
export type FullEngagement = Engagement & {
  /**
   * v2 P1-F: hosts inside the engagement. Always non-empty after migration
   * 0007 — every engagement has at least one row, exactly one with
   * `is_primary = true`. Sorted with the primary host first, then by IP.
   */
  hosts: Host[];
  ports: PortWithDetails[];
  hostScripts: PortScript[];
  /**
   * v2: engagement-level artifacts (AutoRecon loot/report/screenshots/...,
   * source XML retained for re-parse). Stored as port_scripts rows with
   * port_id = NULL and is_host_script = false.
   */
  engagementArtifacts: PortScript[];
  /**
   * v2: per-port evidence (screenshots / attachments). Includes both
   * manually-uploaded items and gowitness/aquatone PNGs lifted from an
   * AutoRecon zip at import time. Sorted by created_at ASC.
   */
  evidence: PortEvidence[];
  /**
   * v2: pentester-discovered findings catalog. Includes both per-port
   * (port_id !== null) and engagement-level (port_id === null) findings.
   * Note: rows in DB store evidence_refs as JSON string; the engagement page
   * decodes via findings-repo before passing into the UI tree.
   */
  findings: Finding[];
};

/** Lightweight engagement for sidebar list (no nested port data) */
export type EngagementSummary = Pick<
  Engagement,
  "id" | "name" | "target_ip" | "target_hostname" | "source" | "created_at"
> & {
  port_count: number;
};
