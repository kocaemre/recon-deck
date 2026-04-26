/**
 * GET /api/engagements/[id]/evidence/[evidenceId]/raw — stream the raw bytes
 * of an evidence row.
 *
 * The engagement page used to inline base64-encoded blobs into the HTML
 * response (multi-megabyte payload per render once a few screenshots
 * landed via AutoRecon import). `getById` now omits `data_b64`; consumers
 * that actually need the bytes hit this route, which decodes once and
 * lets the browser cache the binary at the URL.
 *
 * Caching: 1-hour `private, max-age` is safe because evidence rows are
 * append-only — same evidenceId always returns the same bytes. The id
 * is the cache key.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { port_evidence } from "@/lib/db/schema";

interface RouteContext {
  params: Promise<{ id: string; evidenceId: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: idStr, evidenceId: evIdStr } = await context.params;
  const engagementId = parseInt(idStr, 10);
  const evidenceId = parseInt(evIdStr, 10);
  if (!Number.isInteger(engagementId) || !Number.isInteger(evidenceId)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const row = db
    .select({
      mime: port_evidence.mime,
      data_b64: port_evidence.data_b64,
      filename: port_evidence.filename,
    })
    .from(port_evidence)
    .where(
      and(
        eq(port_evidence.id, evidenceId),
        eq(port_evidence.engagement_id, engagementId),
      ),
    )
    .get();

  if (!row) {
    return NextResponse.json(
      { error: "Evidence not found." },
      { status: 404 },
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(row.data_b64, "base64"));
  } catch {
    return NextResponse.json(
      { error: "Evidence payload corrupt." },
      { status: 500 },
    );
  }

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${row.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      // Append-only data; safe to cache hard. Private because the operator
      // may not want shared proxies (uncommon in localhost) caching it.
      "Cache-Control": "private, max-age=3600, immutable",
    },
  });
}
