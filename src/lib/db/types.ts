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
  ports: PortWithDetails[];
  hostScripts: PortScript[];
};

/** Lightweight engagement for sidebar list (no nested port data) */
export type EngagementSummary = Pick<
  Engagement,
  "id" | "name" | "target_ip" | "target_hostname" | "source" | "created_at"
> & {
  port_count: number;
};
