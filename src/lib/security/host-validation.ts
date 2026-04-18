/**
 * Host-header allowlist logic (SEC-01).
 *
 * Pure functions — no Next.js dependencies — so they can be tested
 * without mocking NextRequest/NextResponse. The Next.js middleware
 * at `middleware.ts` wraps these with the request/response plumbing.
 *
 * Threat: DNS rebinding attacks where a malicious site causes the
 * victim's browser to resolve `evil.com` to `127.0.0.1` and forward
 * requests to the locally-bound recon-deck instance. Rejecting any
 * Host header not in the allowlist blocks this vector.
 */

/**
 * Build the Host-header allowlist.
 *
 * Reads PORT from the environment (defaults to 3000) so the allowlist
 * stays correct when the app is started on a non-default port (e.g.,
 * PORT=8080). Includes localhost/127.0.0.1/::1 on the resolved port
 * plus any comma-separated hosts from the RECON_DECK_TRUSTED_HOSTS
 * environment variable. Users who expose recon-deck on a LAN or
 * mDNS hostname opt in explicitly via this env var.
 */
export function getAllowedHosts(): Set<string> {
  const port = process.env.PORT ?? "3000";
  const defaults = new Set<string>([
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    `[::1]:${port}`,
  ]);
  const extra = process.env.RECON_DECK_TRUSTED_HOSTS;
  if (!extra) return defaults;
  const extras = extra
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return new Set([...defaults, ...extras]);
}

/**
 * Return true if the given Host header value is permitted.
 */
export function isHostAllowed(host: string): boolean {
  return getAllowedHosts().has(host);
}
