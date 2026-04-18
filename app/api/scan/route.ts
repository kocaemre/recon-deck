/**
 * POST /api/scan — nmap input ingress route (Phase 4, Plan 04-02).
 *
 * Accepts a JSON body `{ nmap: string }` containing raw nmap output (either
 * `-oN` text or `-oX` XML). Parses via the shared dispatcher (parseAny),
 * persists a new engagement row with all child ports/scripts in a single
 * transaction (createFromScan), and returns `{ id }` so the client can
 * `router.push('/engagements/{id}')`.
 *
 * Error surface:
 *   400  invalid / empty body — actionable message, no stack frames
 *   422  parseable body but unparseable nmap content — parser error string
 *
 * Rationale (D-02 / D-03):
 *   Client PastePanel calls fetch() on this route so it can surface errors
 *   inline in the paste UX. We therefore return JSON rather than redirect()
 *   from `next/navigation` — the client owns the navigation.
 *
 * revalidatePath("/", "layout") invalidates the layout cache so the sidebar's
 * engagement list re-renders with the newly inserted row.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { parseAny } from "@/lib/parser";
import { db, createFromScan } from "@/lib/db";

// 5 MB — generous ceiling for any nmap output (typical large scan is < 1 MB).
const MAX_BODY_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  // Pre-parse size check via Content-Length header (fast reject for honest clients).
  const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Input too large. Maximum 5 MB." },
      { status: 413 },
    );
  }

  let body: { nmap?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const raw = body.nmap;
  if (!raw?.trim()) {
    return NextResponse.json(
      { error: "Input is empty. Paste nmap output to continue." },
      { status: 400 },
    );
  }

  // Post-parse size check (Content-Length can be spoofed or absent).
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Input too large. Maximum 5 MB." },
      { status: 413 },
    );
  }

  let scan;
  try {
    scan = parseAny(raw);
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 422 },
    );
  }

  let result;
  try {
    result = createFromScan(db, scan, raw);
  } catch (err) {
    console.error("createFromScan failed:", err);
    return NextResponse.json(
      { error: "Failed to save engagement. Please try again." },
      { status: 500 },
    );
  }

  revalidatePath("/", "layout");
  return NextResponse.json({ id: result.id });
}
