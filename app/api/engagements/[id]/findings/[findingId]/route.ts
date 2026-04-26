/**
 * PATCH  /api/engagements/[id]/findings/[findingId]
 * DELETE /api/engagements/[id]/findings/[findingId]
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, updateFinding, deleteFinding, type Severity } from "@/lib/db";
import { readJsonBody } from "@/lib/api/body";

const ALLOWED_SEVERITY: Severity[] = ["info", "low", "medium", "high", "critical"];

interface RouteContext {
  params: Promise<{ id: string; findingId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id, findingId } = await context.params;
  const engagementId = parseInt(id, 10);
  const fid = parseInt(findingId, 10);
  if (!Number.isInteger(engagementId) || !Number.isInteger(fid)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const parsed = await readJsonBody<{
    portId?: number | null;
    severity?: string;
    title?: string;
    description?: string;
    cve?: string | null;
    evidenceRefs?: number[];
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (body.severity && !ALLOWED_SEVERITY.includes(body.severity as Severity)) {
    return NextResponse.json(
      { error: `Severity must be one of ${ALLOWED_SEVERITY.join(", ")}.` },
      { status: 400 },
    );
  }

  const updated = updateFinding(db, engagementId, fid, {
    severity: body.severity as Severity | undefined,
    title: body.title,
    description: body.description,
    cve: body.cve,
    evidenceRefs: body.evidenceRefs,
    portId: body.portId,
  });
  if (!updated) {
    return NextResponse.json({ error: "Finding not found." }, { status: 404 });
  }
  revalidatePath(`/engagements/${engagementId}`);
  return NextResponse.json({ finding: updated });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id, findingId } = await context.params;
  const engagementId = parseInt(id, 10);
  const fid = parseInt(findingId, 10);
  if (!Number.isInteger(engagementId) || !Number.isInteger(fid)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }
  const ok = deleteFinding(db, engagementId, fid);
  if (!ok) {
    return NextResponse.json({ error: "Finding not found." }, { status: 404 });
  }
  revalidatePath(`/engagements/${engagementId}`);
  return NextResponse.json({ ok: true });
}
