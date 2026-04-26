import "server-only";

/**
 * Public barrel for the knowledge-base module.
 *
 * Phase 2+ consumers (parsers, API routes) import from `@/lib/kb` and get the
 * full surface: loader, matcher, and all schema types. Re-exporting types
 * (not just runtime values) keeps downstream type-checking single-source.
 *
 * `import "server-only"` (T-06) protects against accidental client-side
 * imports of the barrel.
 */

export { loadKnowledgeBase, type KnowledgeBase } from "./loader";
export { getKb, invalidateKb, __resetKbCacheForTests } from "./cached";
export { matchPort } from "./matcher";
export {
  KbEntrySchema,
  ResourceSchema,
  CheckSchema,
  CommandSchema,
  DefaultCredSchema,
  KnownVulnSchema,
  RiskSchema,
  type KbEntry,
  type Resource,
  type Check,
  type Command,
  type DefaultCred,
  type KnownVuln,
  type Risk,
} from "./schema";
