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
import { readJsonBody } from "@/lib/api/body";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ overrides: listWordlistOverrides(db) });
}

export async function POST(request: NextRequest) {
  const parsed = await readJsonBody<{ key?: string; path?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

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
