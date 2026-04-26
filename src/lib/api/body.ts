import "server-only";

/**
 * Shared body-size guard for JSON-bodied API routes.
 *
 * Next.js App Router does not cap `request.json()` by default — a
 * pasted multi-megabyte string into a finding description can OOM the
 * process. This helper enforces a per-route ceiling before we hit the
 * JSON parser.
 *
 * Usage:
 *
 *   const parsed = await readJsonBody<MyShape>(request, { maxBytes: 1 << 20 });
 *   if (!parsed.ok) return parsed.response;
 *   const body = parsed.body;
 *
 * Returns a discriminated union so callers don't need to wrap the call
 * in their own try/catch and can early-return the prebuilt error
 * Response on failure.
 */

import { NextRequest, NextResponse } from "next/server";

/** Default cap: 1 MiB. Generous for any expected JSON payload, hostile against pasted log files. */
export const DEFAULT_JSON_BODY_LIMIT = 1 * 1024 * 1024;

interface ReadJsonOptions {
  /** Override the default 1 MiB ceiling (e.g. routes that genuinely need more). */
  maxBytes?: number;
}

interface ReadJsonOk<T> {
  ok: true;
  body: T;
}

interface ReadJsonErr {
  ok: false;
  response: NextResponse;
}

export async function readJsonBody<T>(
  request: NextRequest,
  opts: ReadJsonOptions = {},
): Promise<ReadJsonOk<T> | ReadJsonErr> {
  const max = opts.maxBytes ?? DEFAULT_JSON_BODY_LIMIT;

  // Fast path: trust Content-Length when present. The actual stream
  // length is checked again below so the header alone isn't a security
  // boundary, just a cheap reject for honest clients sending huge bodies.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > max) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Request body exceeds ${max} bytes.` },
        { status: 413 },
      ),
    };
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Could not read request body." },
        { status: 400 },
      ),
    };
  }

  // Verify actual byte length against the cap. text() decodes to a JS
  // string so we measure the original UTF-8 byte count via TextEncoder
  // rather than `raw.length` (which counts UTF-16 code units).
  const actual = new TextEncoder().encode(raw).byteLength;
  if (actual > max) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Request body exceeds ${max} bytes.` },
        { status: 413 },
      ),
    };
  }

  let parsed: T;
  try {
    parsed = JSON.parse(raw) as T;
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      ),
    };
  }

  return { ok: true, body: parsed };
}
