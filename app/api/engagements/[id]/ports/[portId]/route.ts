/**
 * DELETE /api/engagements/[id]/ports/[portId] — remove a port from an engagement.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, deletePort } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string; portId: string }>;
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id, portId } = await context.params;
  const engagementId = parseInt(id, 10);
  const pid = parseInt(portId, 10);
  if (!Number.isInteger(engagementId) || !Number.isInteger(pid)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }
  const ok = deletePort(db, engagementId, pid);
  if (!ok) {
    return NextResponse.json({ error: "Port not found." }, { status: 404 });
  }
  revalidatePath(`/engagements/${engagementId}`);
  return NextResponse.json({ ok: true });
}
