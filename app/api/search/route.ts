/**
 * GET /api/search?q=<query>&limit=<n> — cross-engagement FTS5 search.
 *
 * Returns SearchHit[] from `searchEngagements()`. Empty `q` → 200 with [].
 * `limit` clamped to [1, 100] with default 30.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, searchEngagements, type SeverityFilter } from "@/lib/db";

const VALID_SEVERITIES: SeverityFilter[] = [
  "all",
  "critical",
  "high",
  "medium-plus",
];

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limitRaw = parseInt(searchParams.get("limit") ?? "30", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 100)
    : 30;

  // v1.4.0 #13: optional severity filter chip — narrows hits to a min level.
  const sevRaw = searchParams.get("severity") ?? "all";
  const severity: SeverityFilter = (
    VALID_SEVERITIES as string[]
  ).includes(sevRaw)
    ? (sevRaw as SeverityFilter)
    : "all";

  if (!q) {
    return NextResponse.json({ hits: [] });
  }

  try {
    const hits = searchEngagements(db, q, limit, severity);
    return NextResponse.json({ hits });
  } catch (err) {
    console.error("search failed:", err);
    return NextResponse.json(
      { error: "Search failed.", hits: [] },
      { status: 500 },
    );
  }
}
