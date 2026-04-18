import { NextRequest, NextResponse } from "next/server";
import { isHostAllowed, getAllowedHosts } from "@/lib/security/host-validation";

/**
 * Host-header validation middleware (SEC-01).
 *
 * Runs on every request. Rejects with HTTP 421 (Misdirected Request) if
 * the Host header does not match the allowlist — the canonical status for
 * "this server is not configured to serve this host". 421 has no response
 * body to avoid leaking app info to a DNS-rebinding attacker.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!isHostAllowed(host)) {
    return new Response(null, { status: 421 });
  }
  return NextResponse.next();
}

// Re-export for integration tests that need to build the allowlist.
export { getAllowedHosts };

export const config = {
  matcher: "/:path*",
};
