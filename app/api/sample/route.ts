/**
 * POST /api/sample — sample engagement loader (UI-10).
 *
 * Creates a canned 10-port HTB-easy engagement so first-time visitors see
 * value in 5 seconds without needing real nmap output. Mirrors /api/scan
 * exactly minus body parsing — empty POST body is acceptable.
 *
 * Idempotency: NONE. Repeated calls create duplicate engagements (matches
 * /api/scan semantics — Pitfall 9 / Open Decision #1). Acceptable for a
 * solo-developer local tool; deletion UX is out-of-phase.
 *
 * Returns: { id: number } so the client can router.push(`/engagements/${id}`).
 *
 * Note: route handlers run server-side by default — no `import "server-only"`
 * directive needed (only `src/lib/**` modules use that guard). Host-header
 * middleware (Phase 4 SEC-01) applies to this route automatically.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, createFromScan } from "@/lib/db";
import { buildSampleScan } from "@/lib/sample-engagement";

// Marker stored in engagements.raw_input — NOT NULL constraint requires non-empty.
// Using a recognizable string makes it obvious in DB inspection that this row
// originated from /api/sample (vs paste / autorecon import). Plan 07-04's
// re-parse path will see this isn't real XML and silently fall back to the
// non-structured rendering path (try/catch in engagement page).
const SAMPLE_MARKER =
  "# recon-deck sample engagement\n" +
  "# Target: sample.htb (10.10.10.123)\n" +
  "# 10 open ports — HTB easy mix";

export async function POST() {
  const sample = buildSampleScan();

  let result;
  try {
    result = createFromScan(db, sample, SAMPLE_MARKER, undefined, {
      isSample: true,
    });
  } catch (err) {
    console.error("createFromScan failed for sample:", err);
    return NextResponse.json(
      { error: "Failed to create sample engagement. Please try again." },
      { status: 500 },
    );
  }

  // Sidebar refresh — same as /api/scan line 88. Critical for the new
  // engagement to appear in the sidebar without a full page reload.
  revalidatePath("/", "layout");

  return NextResponse.json({ id: result.id });
}
