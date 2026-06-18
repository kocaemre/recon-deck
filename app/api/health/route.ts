/**
 * GET /api/health — liveness endpoint for Docker HEALTHCHECK and CI smoke tests (OPS-05).
 *
 * Minimal route handler: NO DB queries, NO KB load. An unhealthy DB should NOT cause
 * the orchestrator to restart the container — the writability probe in
 * src/lib/db/client.ts already exits loudly on unwritable volumes (PERSIST-06).
 * Health responds 200 + small JSON as long as the Node process is alive and the
 * host-header middleware (Phase 4 SEC-01) didn't reject the request.
 *
 * Smoke-test client hits 127.0.0.1:3000, which is in the default host allowlist,
 * so this endpoint is reachable without any RECON_DECK_TRUSTED_HOSTS config.
 *
 * Note: route handlers run server-side by default — no `import "server-only"`
 * directive needed (only `src/lib/**` modules use that guard).
 *
 * `version` provenance: `APP_VERSION` is inlined from package.json at build
 * time via next.config (`env`), so it's correct inside the container where
 * `node server.js` would otherwise leave `npm_package_version` unset. The
 * remaining fallbacks keep dev/CI sane.
 */

import { NextResponse } from "next/server";

// Force dynamic so we always serve the current timestamp — and so Next.js does
// not attempt static generation at build time (would fail because middleware
// can't be evaluated without a host header).
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    version:
      process.env.APP_VERSION ?? process.env.npm_package_version ?? "unknown",
    ts: new Date().toISOString(),
  });
}
