/**
 * DELETE /api/engagements/[id]/ports/[portId] — remove a port from an engagement.
 *
 * PATCH /api/engagements/[id]/ports/[portId] — partial port update.
 *   Body: { starred?: boolean }
 *   Currently only the v1.2.0 starred flag is mutable through this route;
 *   the rest of the port row is owned by the import pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, deletePort, setPortStar } from "@/lib/db";
import { readJsonBody } from "@/lib/api/body";

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

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id, portId } = await context.params;
  const engagementId = parseInt(id, 10);
  const pid = parseInt(portId, 10);
  if (
    !Number.isInteger(engagementId) ||
    engagementId <= 0 ||
    !Number.isInteger(pid) ||
    pid <= 0
  ) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const parsed = await readJsonBody<{ starred?: unknown }>(request);
  if (!parsed.ok) return parsed.response;

  if (typeof parsed.body?.starred !== "boolean") {
    return NextResponse.json(
      { error: "Body must include `starred: boolean`." },
      { status: 400 },
    );
  }

  const ok = setPortStar(db, engagementId, pid, parsed.body.starred);
  if (!ok) {
    return NextResponse.json({ error: "Port not found." }, { status: 404 });
  }
  revalidatePath(`/engagements/${engagementId}`);
  return NextResponse.json({ ok: true, starred: parsed.body.starred });
}
