/**
 * DELETE /api/wordlists/[key] — drop a wordlist override.
 *
 * The dynamic segment is the WORDLIST_* identifier itself (no encoding
 * needed — the allowlist regex limits it to A-Z, 0-9, underscores).
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  db,
  deleteWordlistOverride,
  isValidWordlistKey,
} from "@/lib/db";

interface RouteContext {
  params: Promise<{ key: string }>;
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { key } = await context.params;
  if (!isValidWordlistKey(key)) {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }
  const ok = deleteWordlistOverride(db, key);
  if (!ok) {
    return NextResponse.json({ error: "Override not found." }, { status: 404 });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
