/**
 * POST /api/engagements/[id]/evidence — upload a screenshot / image attachment.
 *
 * Accepts multipart/form-data with:
 *   file:    File (PNG/JPEG/GIF/WebP, ≤4 MB)
 *   portId:  string (optional) — port primary key for per-port evidence
 *   caption: string (optional)
 *
 * Returns the inserted port_evidence row.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  db,
  createEvidence,
  MAX_EVIDENCE_BYTES,
  type PortEvidence,
} from "@/lib/db";

const ACCEPTED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: idStr } = await context.params;
  const engagementId = parseInt(idStr, 10);
  if (!Number.isInteger(engagementId)) {
    return NextResponse.json(
      { error: "Invalid engagement id." },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data." },
      { status: 400 },
    );
  }

  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return NextResponse.json(
      { error: "Missing file." },
      { status: 400 },
    );
  }
  const file = fileEntry as File;
  if (!ACCEPTED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type "${file.type}". PNG/JPEG/GIF/WebP only.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    return NextResponse.json(
      {
        error: `File exceeds ${Math.floor(MAX_EVIDENCE_BYTES / (1024 * 1024))} MB limit.`,
      },
      { status: 413 },
    );
  }

  const portIdRaw = formData.get("portId");
  let portId: number | null = null;
  if (portIdRaw && typeof portIdRaw === "string" && portIdRaw.length > 0) {
    const parsed = parseInt(portIdRaw, 10);
    if (Number.isInteger(parsed)) portId = parsed;
  }

  const captionRaw = formData.get("caption");
  const caption =
    typeof captionRaw === "string" && captionRaw.trim().length > 0
      ? captionRaw.trim()
      : undefined;

  // v2.0.0 #7: optional parent linkage. The screenshot annotator POSTs
  // the source row's id alongside the new annotated PNG so the new
  // evidence row records its provenance.
  const parentRaw = formData.get("parentEvidenceId");
  let parentEvidenceId: number | null = null;
  if (parentRaw && typeof parentRaw === "string" && parentRaw.length > 0) {
    const parsed = parseInt(parentRaw, 10);
    if (Number.isInteger(parsed) && parsed > 0) parentEvidenceId = parsed;
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  let row: PortEvidence;
  try {
    row = createEvidence(db, {
      engagementId,
      portId,
      filename: file.name,
      mime: file.type,
      bytes,
      caption,
      source: "manual",
      parentEvidenceId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save evidence." },
      { status: 422 },
    );
  }

  revalidatePath(`/engagements/${engagementId}`);
  return NextResponse.json({ evidence: row });
}
