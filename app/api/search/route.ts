/**
 * GET /api/search?q=<query>&limit=<n> — cross-engagement FTS5 search.
 *
 * Returns SearchHit[] from `searchEngagements()`. Empty `q` → 200 with [].
 * `limit` clamped to [1, 100] with default 30.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, searchEngagements } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limitRaw = parseInt(searchParams.get("limit") ?? "30", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 100)
    : 30;

  if (!q) {
    return NextResponse.json({ hits: [] });
  }

  try {
    const hits = searchEngagements(db, q, limit);
    return NextResponse.json({ hits });
  } catch (err) {
    console.error("search failed:", err);
    return NextResponse.json(
      { error: "Search failed.", hits: [] },
      { status: 500 },
    );
  }
}
