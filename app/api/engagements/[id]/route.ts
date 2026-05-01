/**
 * PATCH  /api/engagements/[id] — rename, retag, or archive an engagement.
 * DELETE /api/engagements/[id] — wipe an engagement and every row scoped to it.
 *
 * The PATCH body is a JSON object — every field is optional, but at
 * least one of the four (`name`, `tags`, `is_archived`, …) must be
 * present. Only the supplied fields are written.
 *
 *   name         → free-form label, non-empty after trim, ≤120 chars
 *   tags         → array of strings (each trimmed, non-empty, ≤32 chars,
 *                   max 16 tags total). Repo replaces the whole set.
 *   is_archived  → boolean. Sidebar's default Active view filters by
 *                   `is_archived = false`.
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
import {
  db,
  deleteEngagement,
  softDeleteEngagement,
  renameEngagement,
  setEngagementTags,
  setEngagementWriteup,
  archiveEngagement,
} from "@/lib/db";
import { readJsonBody } from "@/lib/api/body";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MAX_NAME_LEN = 120;
const MAX_TAG_LEN = 32;
const MAX_TAGS = 16;

interface PatchBody {
  name?: unknown;
  tags?: unknown;
  is_archived?: unknown;
  writeup?: unknown;
}

const MAX_WRITEUP_LEN = 100_000; // ~100 KB plain text — enough for executive summaries, not a novel.

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const engagementId = parseInt(id, 10);
  if (!Number.isInteger(engagementId) || engagementId <= 0) {
    return NextResponse.json(
      { error: "Invalid engagement id." },
      { status: 400 },
    );
  }

  const parsed = await readJsonBody<PatchBody>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body ?? {};

  const hasName = typeof body.name === "string";
  const hasTags = Array.isArray(body.tags);
  const hasArchive = typeof body.is_archived === "boolean";
  const hasWriteup = typeof body.writeup === "string";
  if (!hasName && !hasTags && !hasArchive && !hasWriteup) {
    return NextResponse.json(
      {
        error: "Body must include name, tags, is_archived, or writeup.",
      },
      { status: 400 },
    );
  }

  // Validate each field independently so a multi-field PATCH surfaces
  // the most specific error.
  let nextName: string | null = null;
  if (hasName) {
    const trimmed = (body.name as string).trim();
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
    nextName = trimmed;
  }

  let nextTags: string[] | null = null;
  if (hasTags) {
    const raw = body.tags as unknown[];
    if (raw.length > MAX_TAGS) {
      return NextResponse.json(
        { error: `Too many tags (max ${MAX_TAGS}).` },
        { status: 400 },
      );
    }
    const cleaned: string[] = [];
    const seen = new Set<string>();
    for (const t of raw) {
      if (typeof t !== "string") {
        return NextResponse.json(
          { error: "Each tag must be a string." },
          { status: 400 },
        );
      }
      const trimmed = t.trim().toLowerCase();
      if (trimmed.length === 0) continue;
      if (trimmed.length > MAX_TAG_LEN) {
        return NextResponse.json(
          { error: `Tag too long (max ${MAX_TAG_LEN} chars).` },
          { status: 400 },
        );
      }
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      cleaned.push(trimmed);
    }
    nextTags = cleaned;
  }

  const nextArchived = hasArchive ? (body.is_archived as boolean) : null;

  let nextWriteup: string | null = null;
  if (hasWriteup) {
    const w = body.writeup as string;
    if (w.length > MAX_WRITEUP_LEN) {
      return NextResponse.json(
        { error: `Writeup too long (max ${MAX_WRITEUP_LEN} chars).` },
        { status: 400 },
      );
    }
    nextWriteup = w;
  }

  try {
    let touched = false;
    if (nextName !== null) {
      const ok = renameEngagement(db, engagementId, nextName);
      if (!ok) {
        return NextResponse.json(
          { error: "Engagement not found." },
          { status: 404 },
        );
      }
      touched = true;
    }
    if (nextTags !== null) {
      const ok = setEngagementTags(db, engagementId, nextTags);
      if (!ok && !touched) {
        return NextResponse.json(
          { error: "Engagement not found." },
          { status: 404 },
        );
      }
      touched = true;
    }
    if (nextArchived !== null) {
      const ok = archiveEngagement(db, engagementId, nextArchived);
      if (!ok && !touched) {
        return NextResponse.json(
          { error: "Engagement not found." },
          { status: 404 },
        );
      }
      touched = true;
    }
    if (nextWriteup !== null) {
      const ok = setEngagementWriteup(db, engagementId, nextWriteup);
      if (!ok && !touched) {
        return NextResponse.json(
          { error: "Engagement not found." },
          { status: 404 },
        );
      }
      touched = true;
    }
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH engagement failed:", err);
    return NextResponse.json(
      { error: "Update failed — see server logs." },
      { status: 500 },
    );
  }
}

/**
 * DELETE behavior (Migration 0013):
 *
 *   default            → soft delete (sets `deleted_at = now()`). Row
 *                        drops out of the sidebar / FTS but every child
 *                        row stays, so /settings → "Recently deleted"
 *                        can Restore it.
 *   ?force=true        → hard cascade delete. Used by the
 *                        "Delete forever" affordance in /settings.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const engagementId = parseInt(id, 10);
  if (!Number.isInteger(engagementId) || engagementId <= 0) {
    return NextResponse.json(
      { error: "Invalid engagement id." },
      { status: 400 },
    );
  }
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  try {
    const ok = force
      ? deleteEngagement(db, engagementId)
      : softDeleteEngagement(db, engagementId);
    if (!ok) {
      return NextResponse.json(
        { error: "Engagement not found." },
        { status: 404 },
      );
    }
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, mode: force ? "hard" : "soft" });
  } catch (err) {
    console.error("Delete engagement failed:", err);
    return NextResponse.json(
      { error: "Delete failed — see server logs." },
      { status: 500 },
    );
  }
}
