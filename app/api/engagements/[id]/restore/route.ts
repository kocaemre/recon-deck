/**
 * POST /api/engagements/[id]/restore — bring a soft-deleted engagement
 * back from the recycle bin (v1.3.0 #6).
 *
 * Pairs with `DELETE /api/engagements/[id]` (default soft-delete) and
 * `DELETE /api/engagements/[id]?force=true` (hard cascade purge).
 *
 *   200 → { ok: true }
 *   400 → { error: string }   (bad id)
 *   404 → { error: string }   (no row matched, or row was hard-purged)
 *   500 → { error: string }   (unexpected — db log written)
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, restoreEngagement } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const engagementId = parseInt(id, 10);
  if (!Number.isInteger(engagementId) || engagementId <= 0) {
    return NextResponse.json(
      { error: "Invalid engagement id." },
      { status: 400 },
    );
  }

  try {
    const ok = restoreEngagement(db, engagementId);
    if (!ok) {
      return NextResponse.json(
        { error: "Engagement not found." },
        { status: 404 },
      );
    }
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Restore engagement failed:", err);
    return NextResponse.json(
      { error: "Restore failed — see server logs." },
      { status: 500 },
    );
  }
}
