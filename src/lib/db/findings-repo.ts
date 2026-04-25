import "server-only";

/**
 * Findings repository — CRUD on the findings catalog.
 *
 * `evidence_refs` is stored as a JSON array string. The repo decodes on read
 * and re-encodes on write. Invalid JSON falls back to []. UI never sees the
 * raw JSON string — it gets a number[] via the helpers.
 */

import { eq, and } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { findings, type Finding } from "./schema";
import type * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface FindingInput {
  engagementId: number;
  portId: number | null;
  severity: Severity;
  title: string;
  description?: string;
  cve?: string | null;
  evidenceRefs?: number[];
}

export interface FindingPatch {
  severity?: Severity;
  title?: string;
  description?: string;
  cve?: string | null;
  evidenceRefs?: number[];
  portId?: number | null;
}

function safeRefs(json: string): number[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === "number");
  } catch {
    return [];
  }
}

export interface FindingDecoded extends Omit<Finding, "evidence_refs"> {
  evidenceRefs: number[];
}

function decode(row: Finding): FindingDecoded {
  const { evidence_refs, ...rest } = row;
  return { ...rest, evidenceRefs: safeRefs(evidence_refs) };
}

export function listFindings(
  db: Db,
  engagementId: number,
): FindingDecoded[] {
  return db
    .select()
    .from(findings)
    .where(eq(findings.engagement_id, engagementId))
    .all()
    .map(decode);
}

export function createFinding(db: Db, input: FindingInput): FindingDecoded {
  const now = new Date().toISOString();
  const row = db
    .insert(findings)
    .values({
      engagement_id: input.engagementId,
      port_id: input.portId,
      severity: input.severity,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      cve: input.cve ?? null,
      evidence_refs: JSON.stringify(input.evidenceRefs ?? []),
      created_at: now,
      updated_at: now,
    })
    .returning()
    .get();
  return decode(row);
}

export function updateFinding(
  db: Db,
  engagementId: number,
  id: number,
  patch: FindingPatch,
): FindingDecoded | null {
  const existing = db
    .select()
    .from(findings)
    .where(
      and(eq(findings.id, id), eq(findings.engagement_id, engagementId)),
    )
    .get();
  if (!existing) return null;

  const now = new Date().toISOString();
  const next = {
    severity: patch.severity ?? existing.severity,
    title: patch.title?.trim() ?? existing.title,
    description: patch.description?.trim() ?? existing.description,
    cve: patch.cve === undefined ? existing.cve : patch.cve,
    evidence_refs:
      patch.evidenceRefs !== undefined
        ? JSON.stringify(patch.evidenceRefs)
        : existing.evidence_refs,
    port_id: patch.portId === undefined ? existing.port_id : patch.portId,
    updated_at: now,
  };

  const updated = db
    .update(findings)
    .set(next)
    .where(
      and(eq(findings.id, id), eq(findings.engagement_id, engagementId)),
    )
    .returning()
    .get();
  return decode(updated);
}

export function deleteFinding(
  db: Db,
  engagementId: number,
  id: number,
): boolean {
  const result = db
    .delete(findings)
    .where(
      and(eq(findings.id, id), eq(findings.engagement_id, engagementId)),
    )
    .run();
  return result.changes > 0;
}
