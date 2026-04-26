/**
 * PATCH  /api/engagements/[id] — rename the engagement label.
 * DELETE /api/engagements/[id] — wipe an engagement and every row scoped to it.
 *
 * Rename overrides the auto-generated `hostname (ip)` label with a
 * free-form name chosen by the operator. The body must be JSON of the
 * form `{ name: string }` — non-empty after trimming, ≤120 chars.
 *
 * All child tables (ports, port_scripts, port_commands, check_states,
 * port_notes, port_evidence, findings, hosts, scan_history) cascade out of
 * the parent engagement row, so a single delete reaps the whole subtree.
 * The FTS5 trigger `engagements_search_ad` cleans the search index in the
 * same statement.
 *
 * Response shape:
 *   200 → { ok: true }
 *   400 → { error: string }   (bad id / bad body)
 *   404 → { error: string }   (no such engagement)
 *   500 → { error: string }   (unexpected — db log written)
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, deleteEngagement, renameEngagement } from "@/lib/db";
import { readJsonBody } from "@/lib/api/body";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MAX_NAME_LEN = 120;

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const engagementId = parseInt(id, 10);
  if (!Number.isInteger(engagementId) || engagementId <= 0) {
    return NextResponse.json(
      { error: "Invalid engagement id." },
      { status: 400 },
    );
  }

  const parsed = await readJsonBody<{ name?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const rawName =
    typeof parsed.body?.name === "string" ? parsed.body.name : "";
  const trimmed = rawName.trim();
  if (trimmed.length === 0) {
    return NextResponse.json(
      { error: "Name is required." },
      { status: 400 },
    );
  }
  if (trimmed.length > MAX_NAME_LEN) {
    return NextResponse.json(
      { error: `Name too long (max ${MAX_NAME_LEN} chars).` },
      { status: 400 },
    );
  }

  try {
    const updated = renameEngagement(db, engagementId, trimmed);
    if (!updated) {
      return NextResponse.json(
        { error: "Engagement not found." },
        { status: 404 },
      );
    }
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Rename engagement failed:", err);
    return NextResponse.json(
      { error: "Rename failed — see server logs." },
      { status: 500 },
    );
  }
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
