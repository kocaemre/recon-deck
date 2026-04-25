/**
 * GET /api/engagements/[id]/export/[format] — Phase 6 download route (Plan 06-06).
 *
 * Dispatches to generateMarkdown / generateJson / generateHtml (full-path
 * imports per Plan 01's anti-barrel rule) and returns the generated string as
 * a download with RFC 6266-compliant Content-Disposition headers.
 *
 * Structural analog: app/api/import/autorecon/route.ts (canonical App Router
 * route pattern, inverted for download). Unlike the autorecon route we return
 * a bare `new Response(body, { headers })` rather than `NextResponse.json()` so
 * we can set arbitrary Content-Type values (text/markdown, text/html).
 *
 * Error surface (plan 06-06 truths):
 *   400  invalid engagement id (non-integer, zero, negative)
 *   400  unknown format (not markdown / json / html)
 *   404  engagement not found
 *   500  generator crashed / target_ip failed the allowlist regex
 *
 * Security:
 *   - T-06-17 (path traversal via [format]): `isFormat()` allowlist guard.
 *   - T-06-18 (Content-Disposition injection via target_ip): regex allowlist
 *     on the IP before filename interpolation.
 *   - T-06-19 (stack-trace leak): 500 body is generic; error logged via
 *     console.error only.
 *   - T-06-20 (cache-staleness DoS): `Cache-Control: no-store`.
 *
 * No `import "server-only"` — App Router route.ts files are server-side by
 * convention; the guard is only required for `src/lib/**` modules.
 */

import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { db, getById, getWordlistOverridesMap } from "@/lib/db";
import { loadKnowledgeBase } from "@/lib/kb";
import { loadEngagementForExport } from "@/lib/export/view-model";
import { generateMarkdown } from "@/lib/export/markdown";
import { generateJson } from "@/lib/export/json";
import { generateHtml } from "@/lib/export/html";

// Module-level KB cache — matches app/engagements/[id]/page.tsx. Reading the
// shipped YAML on every request would add 50-200ms per export (RESEARCH.md
// Pitfall 5). `loadKnowledgeBase` is safe to call at module scope because it
// is synchronous and only touches filesystem on first invocation.
const kb = loadKnowledgeBase({
  shippedPortsDir: path.join(process.cwd(), "knowledge", "ports"),
  shippedDefaultFile: path.join(process.cwd(), "knowledge", "default.yaml"),
  userDir: process.env.RECON_KB_USER_DIR ?? undefined,
});

// Format dispatch table — Content-Type values are locked by D-23.
const FORMATS = {
  markdown: { ext: "md", contentType: "text/markdown; charset=utf-8" },
  json: { ext: "json", contentType: "application/json; charset=utf-8" },
  html: { ext: "html", contentType: "text/html; charset=utf-8" },
} as const;
type Format = keyof typeof FORMATS;

function isFormat(x: string): x is Format {
  return x === "markdown" || x === "json" || x === "html";
}

// IPv4 dots + digits, IPv6 dots + digits + colons + hex (a-f upper and lower).
// The DB schema already constrains target_ip; this regex is defense-in-depth
// before the value is interpolated into the Content-Disposition filename.
const SAFE_IP_REGEX = /^[\d.:a-fA-F]+$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; format: string }> },
) {
  const { id: idStr, format } = await params;

  // 1. Validate engagement id. `parseInt` returns NaN for non-numeric input and
  //    the extra `<= 0` check rejects "0" and any negative value — valid
  //    engagement ids are always positive integers.
  const id = parseInt(idStr, 10);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json(
      { error: "Invalid engagement id" },
      { status: 400 },
    );
  }

  // 2. Validate format against allowlist (T-06-17 mitigation). The Next.js
  //    dynamic segment itself does not restrict values — we do.
  if (!isFormat(format)) {
    return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  }

  // 3. Look up engagement.
  const engagement = getById(db, id);
  if (!engagement) {
    return NextResponse.json(
      { error: "Engagement not found" },
      { status: 404 },
    );
  }

  // 4. Defense-in-depth: target_ip must match the IPv4/IPv6 character set
  //    before it can be interpolated into the filename template. Anything else
  //    is a data-integrity issue — log it and return 500 with a generic body
  //    (T-06-18 mitigation).
  if (!SAFE_IP_REGEX.test(engagement.target_ip)) {
    console.error(
      "Export: unexpected target_ip shape for engagement",
      id,
      engagement.target_ip,
    );
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }

  // 5. Build the view model and dispatch to the format-specific generator.
  //    The view-model transform is pure and the generators are pure, but we
  //    still wrap in try/catch so a KB/DB corruption or a generator bug
  //    surfaces as a generic 500 rather than a stack trace in the response
  //    body (T-06-19 mitigation).
  let body: string;
  try {
    // P1-E: pass wordlist overrides so exported markdown/json/html embeds the
    // operator's customized {WORDLIST_*} paths (DB read is cheap — ~tens of bytes).
    const vm = loadEngagementForExport(engagement, kb, getWordlistOverridesMap(db));
    switch (format) {
      case "markdown":
        body = generateMarkdown(vm);
        break;
      case "json":
        body = generateJson(vm);
        break;
      case "html":
        body = generateHtml(vm);
        break;
    }
  } catch (err) {
    console.error("Export generator failed:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }

  // 6. Filename per D-21: `<ip>-YYYY-MM-DD.<ext>`. UTC calendar date sliced
  //    from ISO timestamp is stable across TZs and always ASCII.
  const { ext, contentType } = FORMATS[format];
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `${engagement.target_ip}-${date}.${ext}`;

  // 7. RFC 6266 §5 — `filename=` (ASCII fallback) appears BEFORE `filename*=`
  //    (UTF-8 variant). Reversing the order breaks older download managers
  //    and some legacy user agents (RESEARCH.md Pitfall 2). `encodeURIComponent`
  //    is the correct helper for RFC 5987 percent-encoding (`encodeURI` leaves
  //    characters like `[ ] @` un-escaped which are reserved in filename*=).
  const disposition =
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;

  // 8. Return a bare Response so we can set arbitrary Content-Type
  //    (not application/json). `Cache-Control: no-store` prevents browsers
  //    from serving a stale export after the user edits the engagement.
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}
