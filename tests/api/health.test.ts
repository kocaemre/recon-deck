/**
 * OPS-05 — /api/health liveness endpoint tests.
 *
 * Route handlers in App Router are plain async functions, so we can invoke
 * GET() directly without any HTTP layer. This mirrors the unit-test style
 * used for other server-side modules in this repo (see tests/middleware.test.ts
 * which imports the helper directly rather than spinning up Next.js).
 *
 * The handler deliberately has no error surface (no DB / KB / try/catch)
 * per PATTERNS.md "no error paths" — so we only assert the happy-path shape
 * and the 200 status. A richer probe would be an anti-pattern (RESEARCH.md
 * "Don't hand-roll richer health bodies").
 */

import { describe, it, expect } from "vitest";
import { GET } from "../../app/api/health/route.js";

describe("GET /api/health (OPS-05)", () => {
  it("returns ok: true with a string version and ISO timestamp", async () => {
    const res = await GET();
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
    expect(typeof body.ts).toBe("string");
    // ts round-trips through Date without throwing — proves ISO 8601 shape.
    expect(() => new Date(body.ts).toISOString()).not.toThrow();
  });

  it("returns HTTP 200", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
