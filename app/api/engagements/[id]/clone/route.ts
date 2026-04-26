/**
 * POST /api/engagements/[id]/clone — deep-copy an engagement.
 *
 * Body (optional):
 *   { name?: string }   — name for the new engagement; defaults to
 *                         "<source name> (copy)".
 *
 * Response shape:
 *   200 → { ok: true, id: number }   (new engagement id)
 *   400 → { error: string }          (bad id / bad body)
 *   404 → { error: string }          (no such engagement)
 *   500 → { error: string }          (unexpected — db log written)
 *
 * Returns the new engagement id so the client can navigate straight
 * to the clone after the request resolves.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, cloneEngagement } from "@/lib/db";
import { readJsonBody } from "@/lib/api/body";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MAX_NAME_LEN = 120;

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const sourceId = parseInt(id, 10);
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return NextResponse.json(
      { error: "Invalid engagement id." },
      { status: 400 },
    );
  }

  // Empty body is valid — caller can omit `name` to take the default.
  // Pull declared length first so we can short-circuit to "no body";
  // readJsonBody throws 400 on a zero-byte body.
  const declaredLen = Number(request.headers.get("content-length") ?? "0");
  let nameOverride: string | undefined;
  if (declaredLen > 0) {
    const parsed = await readJsonBody<{ name?: unknown }>(request);
    if (!parsed.ok) return parsed.response;
    if (typeof parsed.body?.name === "string") {
      const trimmed = parsed.body.name.trim();
      if (trimmed.length === 0) {
        return NextResponse.json(
          { error: "Name cannot be empty when supplied." },
          { status: 400 },
        );
      }
      if (trimmed.length > MAX_NAME_LEN) {
        return NextResponse.json(
          { error: `Name too long (max ${MAX_NAME_LEN} chars).` },
          { status: 400 },
        );
      }
      nameOverride = trimmed;
    }
  }

  try {
    const newId = cloneEngagement(db, sourceId, nameOverride);
    if (newId == null) {
      return NextResponse.json(
        { error: "Engagement not found." },
        { status: 404 },
      );
    }
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, id: newId });
  } catch (err) {
    console.error("Clone engagement failed:", err);
    return NextResponse.json(
      { error: "Clone failed — see server logs." },
      { status: 500 },
    );
  }
}
