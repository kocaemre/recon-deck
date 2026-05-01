import { NextRequest, NextResponse } from "next/server";
import { isHostAllowed, getAllowedHosts } from "@/lib/security/host-validation";
import { clientIp, consumeToken } from "@/lib/security/rate-limit";

/**
 * Host-header validation (SEC-01) + per-IP rate limit (defense-in-depth).
 *
 * Order matters: host check first (rejects DNS-rebinding before we even
 * touch the rate limiter), rate-limit second (only burns a token on
 * legitimate hosts). Localhost bypasses the limiter unless the operator
 * sets RECON_RATE_LIMIT=force; LAN clients get the standard bucket.
 *
 * Only `/api/*` is rate-limited — page renders, RSC payloads, and
 * static assets are unbounded.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!isHostAllowed(host)) {
    return new Response(null, { status: 421 });
  }

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    const ip = clientIp(request.headers);
    const verdict = consumeToken(ip);
    if (!verdict.allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded." }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": String(verdict.retryAfterSec),
          },
        },
      );
    }
  }

  return NextResponse.next();
}

// Re-export for integration tests that need to build the allowlist.
export { getAllowedHosts };

export const config = {
  matcher: "/:path*",
};
