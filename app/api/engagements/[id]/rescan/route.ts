/**
 * POST /api/engagements/[id]/rescan — append a re-import to an engagement.
 *
 * Accepts the same paste shape as POST /api/scan: `{ raw: string }` plus
 * an optional explicit source hint. Parses the input via parseAny() and
 * delegates port reconciliation to `rescanEngagement` (P1-G PR 1).
 *
 * Response shape:
 *   {
 *     scanId: number,           // new scan_history.id
 *     added: number,            // brand-new ports
 *     reopened: number,         // ports previously marked closed that are back
 *     closed: number,           // ports the new scan didn't see
 *     reaffirmed: number,       // unchanged ports whose last_seen advanced
 *     newHosts: number          // hosts surfaced by this re-import
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, getById, rescanEngagement } from "@/lib/db";
import { parseAny } from "@/lib/parser";
import { readJsonBody } from "@/lib/api/body";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const engagementId = parseInt(id, 10);
  if (!Number.isInteger(engagementId) || engagementId <= 0) {
    return NextResponse.json(
      { error: "Invalid engagement id." },
      { status: 400 },
    );
  }

  // Engagement must exist before we accept a re-import.
  const eng = getById(db, engagementId);
  if (!eng) {
    return NextResponse.json(
      { error: "Engagement not found." },
      { status: 404 },
    );
  }

  // Generous cap — large XML re-imports (autorecon `_full_tcp_nmap.xml`)
  // can run several MB. The /api/scan route uses 5 MB; mirror that here.
  const parsed = await readJsonBody<{ raw?: unknown }>(request, {
    maxBytes: 5 * 1024 * 1024,
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const raw = typeof body.raw === "string" ? body.raw : "";
  if (!raw.trim()) {
    return NextResponse.json(
      { error: "`raw` is required and must be non-empty." },
      { status: 400 },
    );
  }

  let scan;
  try {
    scan = parseAny(raw);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Parse failed." },
      { status: 400 },
    );
  }

  try {
    const result = rescanEngagement(db, engagementId, scan, raw);
    revalidatePath(`/engagements/${engagementId}`);
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (err) {
    console.error("Rescan failed:", err);
    return NextResponse.json(
      { error: "Rescan failed — see server logs." },
      { status: 500 },
    );
  }
}
