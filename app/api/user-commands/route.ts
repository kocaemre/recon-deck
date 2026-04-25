/**
 * GET  /api/user-commands — list all user-defined command snippets
 * POST /api/user-commands — create a snippet
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, listUserCommands, createUserCommand } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ commands: listUserCommands(db) });
}

export async function POST(request: NextRequest) {
  let body: {
    service?: string | null;
    port?: number | null;
    label?: string;
    template?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const label = (body.label ?? "").trim();
  const template = (body.template ?? "").trim();
  if (!label || !template) {
    return NextResponse.json(
      { error: "Label and template are required." },
      { status: 400 },
    );
  }

  const cmd = createUserCommand(db, {
    service: body.service?.trim() || null,
    port:
      typeof body.port === "number" && Number.isInteger(body.port)
        ? body.port
        : null,
    label,
    template,
  });
  revalidatePath("/", "layout");
  return NextResponse.json({ command: cmd });
}
