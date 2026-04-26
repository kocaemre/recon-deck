/**
 * DELETE /api/engagements/[id] — wipe an engagement and every row scoped to it.
 *
 * All child tables (ports, port_scripts, port_commands, check_states,
 * port_notes, port_evidence, findings, hosts, scan_history) cascade out of
 * the parent engagement row, so a single delete reaps the whole subtree.
 * The FTS5 trigger `engagements_search_ad` cleans the search index in the
 * same statement.
 *
 * Response shape:
 *   200 → { ok: true }
 *   400 → { error: string }   (bad id)
 *   404 → { error: string }   (no such engagement)
 *   500 → { error: string }   (unexpected — db log written)
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, deleteEngagement } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const engagementId = parseInt(id, 10);
  if (!Number.isInteger(engagementId) || engagementId <= 0) {
    return NextResponse.json(
      { error: "Invalid engagement id." },
      { status: 400 },
    );
  }

  try {
    const removed = deleteEngagement(db, engagementId);
    if (!removed) {
      return NextResponse.json(
        { error: "Engagement not found." },
        { status: 404 },
      );
    }
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete engagement failed:", err);
    return NextResponse.json(
      { error: "Delete failed — see server logs." },
      { status: 500 },
    );
  }
}
