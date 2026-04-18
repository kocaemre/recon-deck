import "server-only";

/**
 * Public barrel for the persistence module.
 *
 * Phase 4+ consumers (API routes, server actions) import from `@/lib/db`
 * (or relative path `../../lib/db/index.js`) and get the full surface:
 * db client, repo functions, and all types.
 *
 * `import "server-only"` prevents accidental client-side imports of the barrel.
 *
 * NOTE: Repo function re-exports will be added by Plan 03 after the repos are
 * created. The barrel is functional now with db + schema + types.
 */

export { db } from "./client";
export {
  engagements,
  ports,
  port_scripts,
  port_commands,
  check_states,
  port_notes,
  type Engagement,
  type Port,
  type PortScript,
  type PortCommand,
  type CheckState,
  type PortNote,
} from "./schema";
export type {
  FullEngagement,
  EngagementSummary,
  PortWithDetails,
} from "./types";

// Plan 03: Repo function re-exports
// Plan 04-02: + updateTarget for inline engagement rename (INPUT-03).
export {
  createFromScan,
  getById,
  listSummaries,
  updateTarget,
  type Db,
} from "./engagement-repo";
export { upsertCheck, getChecksByEngagement } from "./checklist-repo";
export { upsertNote, getNotesByEngagement } from "./notes-repo";
