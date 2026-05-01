import "server-only";

/**
 * Evidence repository — port_evidence CRUD.
 *
 * Application-side cap on row size: MAX_EVIDENCE_BYTES (4 MB after base64
 * decode). Larger uploads are rejected before insert so the row never lands
 * in DB. The base64 form roughly inflates by 33%, so the textual data_b64
 * column stays ~5.3 MB worst case.
 */

import { eq, and } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { port_evidence, type PortEvidence } from "./schema";
import type * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

/** 4 MB raw → ~5.3 MB base64. */
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export interface CreateEvidenceInput {
  engagementId: number;
  portId: number | null;
  filename: string;
  mime: string;
  /** raw bytes — will be base64-encoded for storage. */
  bytes: Buffer;
  caption?: string;
  source?: "manual" | "autorecon-import";
  /**
   * Migration 0016 (v2.0.0 #7): when set, links the new row back to
   * an existing evidence id. Used by the screenshot annotator save
   * path so the original capture stays untouched and the annotated
   * variant can render an "annotated from #N" affordance.
   */
  parentEvidenceId?: number | null;
}

export function createEvidence(
  db: Db,
  input: CreateEvidenceInput,
): PortEvidence {
  if (!ALLOWED_MIME.has(input.mime)) {
    throw new Error(
      `Unsupported evidence mime type "${input.mime}". Allowed: ${Array.from(ALLOWED_MIME).join(", ")}.`,
    );
  }
  if (input.bytes.length > MAX_EVIDENCE_BYTES) {
    throw new Error(
      `Evidence exceeds ${Math.floor(MAX_EVIDENCE_BYTES / (1024 * 1024))} MB limit.`,
    );
  }

  const now = new Date().toISOString();
  const inserted = db
    .insert(port_evidence)
    .values({
      engagement_id: input.engagementId,
      port_id: input.portId,
      filename: input.filename,
      mime: input.mime,
      data_b64: input.bytes.toString("base64"),
      caption: input.caption ?? null,
      source: input.source ?? "manual",
      parent_evidence_id: input.parentEvidenceId ?? null,
      created_at: now,
    })
    .returning()
    .get();
  return inserted;
}

export function listEvidenceForEngagement(
  db: Db,
  engagementId: number,
): PortEvidence[] {
  return db
    .select()
    .from(port_evidence)
    .where(eq(port_evidence.engagement_id, engagementId))
    .all();
}

export function deleteEvidence(
  db: Db,
  engagementId: number,
  evidenceId: number,
): boolean {
  const result = db
    .delete(port_evidence)
    .where(
      and(
        eq(port_evidence.id, evidenceId),
        eq(port_evidence.engagement_id, engagementId),
      ),
    )
    .run();
  return result.changes > 0;
}

/**
 * Helper: deduce mime type from filename extension. Used by the AutoRecon
 * importer when lifting gowitness/aquatone PNGs into evidence.
 */
export function mimeFromFilename(filename: string): string | null {
  const ext = filename.match(/\.(\w+)$/)?.[1]?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return null;
}
