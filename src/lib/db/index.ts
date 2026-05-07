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
  port_evidence,
  findings,
  user_commands,
  wordlist_overrides,
  hosts,
  scan_history,
  app_state,
  port_fingerprints,
  type PortFingerprint,
  type AppState,
  type Engagement,
  type Port,
  type PortScript,
  type PortCommand,
  type CheckState,
  type PortNote,
  type PortEvidence,
  type Finding,
  type UserCommand,
  type WordlistOverride,
  type Host,
  type ScanHistory,
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
  renameEngagement,
  deleteEngagement,
  softDeleteEngagement,
  restoreEngagement,
  listDeletedSummaries,
  cloneEngagement,
  setEngagementTags,
  setEngagementWriteup,
  touchEngagementVisit,
  getResumeCandidate,
  type ResumeCandidate,
  archiveEngagement,
  type Db,
} from "./engagement-repo";
export {
  getAppState,
  setAppState,
  markOnboarded,
  replayOnboarding,
  effectiveAppState,
  type AppStatePatch,
  type EffectiveConfig,
} from "./app-state-repo";
export { upsertCheck, upsertChecksBatch, getChecksByEngagement } from "./checklist-repo";
export { upsertNote, getNotesByEngagement } from "./notes-repo";
export {
  searchEngagements,
  type SearchHit,
  type SearchKind,
  type SeverityFilter,
} from "./search";
export {
  createEvidence,
  listEvidenceForEngagement,
  deleteEvidence,
  mimeFromFilename,
  MAX_EVIDENCE_BYTES,
} from "./evidence-repo";
export {
  listFindings,
  createFinding,
  updateFinding,
  deleteFinding,
  type Severity,
  type FindingDecoded,
  type FindingInput,
  type FindingPatch,
} from "./findings-repo";
export {
  listUserCommands,
  createUserCommand,
  updateUserCommand,
  deleteUserCommand,
  matchUserCommands,
  type UserCommandInput,
} from "./user-commands-repo";
export {
  addManualPort,
  deletePort,
  togglePortStar,
  setPortStar,
  type ManualPortInput,
} from "./ports-repo";
export {
  listWordlistOverrides,
  getWordlistOverridesMap,
  upsertWordlistOverride,
  deleteWordlistOverride,
  isValidWordlistKey,
} from "./wordlists-repo";
export { listHostsForEngagement, getPrimaryHost } from "./hosts-repo";
export {
  listScanHistory,
  rescanEngagement,
  type RescanResult,
} from "./scan-history-repo";
export {
  replaceForPort as replaceFingerprintsForPort,
  listForPort as listFingerprintsForPort,
  type FingerprintInput,
  type FingerprintSource,
  type FingerprintType,
} from "./fingerprints-repo";
