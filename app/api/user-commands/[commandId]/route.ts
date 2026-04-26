/**
 * PATCH  /api/user-commands/[commandId]
 * DELETE /api/user-commands/[commandId]
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, updateUserCommand, deleteUserCommand } from "@/lib/db";
import { readJsonBody } from "@/lib/api/body";

interface RouteContext {
  params: Promise<{ commandId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { commandId } = await context.params;
  const id = parseInt(commandId, 10);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }
  const parsed = await readJsonBody<{
    service?: string | null;
    port?: number | null;
    label?: string;
    template?: string;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const updated = updateUserCommand(db, id, {
    service: body.service ?? null,
    port: body.port ?? null,
    label: body.label,
    template: body.template,
  });
  if (!updated) {
    return NextResponse.json({ error: "Command not found." }, { status: 404 });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ command: updated });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { commandId } = await context.params;
  const id = parseInt(commandId, 10);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }
  const ok = deleteUserCommand(db, id);
  if (!ok) {
    return NextResponse.json({ error: "Command not found." }, { status: 404 });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
