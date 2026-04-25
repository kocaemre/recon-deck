/**
 * DELETE /api/engagements/[id]/evidence/[evidenceId] — remove an evidence row.
 *
 * 404 when the row is not found OR belongs to a different engagement (ownership
 * check folded into the WHERE clause).
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, deleteEvidence } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string; evidenceId: string }>;
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id: idStr, evidenceId: evIdStr } = await context.params;
  const engagementId = parseInt(idStr, 10);
  const evidenceId = parseInt(evIdStr, 10);
  if (!Number.isInteger(engagementId) || !Number.isInteger(evidenceId)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const ok = deleteEvidence(db, engagementId, evidenceId);
  if (!ok) {
    return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
  }

  revalidatePath(`/engagements/${engagementId}`);
  return NextResponse.json({ ok: true });
}
