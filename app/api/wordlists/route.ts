/**
 * GET  /api/wordlists — list all custom wordlist overrides
 * POST /api/wordlists — upsert an override (insert-or-replace by key)
 *
 * Backs the `/settings/wordlists` editor. Validation lives in
 * `src/lib/db/wordlists-repo.ts` (`isValidWordlistKey` + path non-empty).
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  db,
  listWordlistOverrides,
  upsertWordlistOverride,
  isValidWordlistKey,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ overrides: listWordlistOverrides(db) });
}

export async function POST(request: NextRequest) {
  let body: { key?: string; path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const key = (body.key ?? "").trim();
  const path = (body.path ?? "").trim();
  if (!key || !path) {
    return NextResponse.json(
      { error: "Both `key` and `path` are required." },
      { status: 400 },
    );
  }
  if (!isValidWordlistKey(key)) {
    return NextResponse.json(
      {
        error:
          "Invalid key. Must match WORDLIST_[A-Z0-9_]+ (e.g. WORDLIST_DIRB_COMMON).",
      },
      { status: 400 },
    );
  }

  const row = upsertWordlistOverride(db, key, path);
  revalidatePath("/", "layout");
  return NextResponse.json({ override: row });
}
