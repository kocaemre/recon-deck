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
 * Reads PORT from the environment (defaults to 13337 — production
 * Docker image binds there to dodge the dev-server crowd on 3000/8080)
 * so the allowlist stays correct when the app is started on a
 * non-default port (e.g., PORT=8080). Includes localhost/127.0.0.1/::1
 * on the resolved port plus any comma-separated hosts from the
 * RECON_DECK_TRUSTED_HOSTS environment variable. Users who expose
 * recon-deck on a LAN or mDNS hostname opt in explicitly via this env var.
 */
export function getAllowedHosts(): Set<string> {
  const port = process.env.PORT ?? "13337";
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
 * Loopback hostnames. The DNS-rebinding threat hinges on the *hostname* an
 * attacker page resolves to 127.0.0.1 (e.g. `evil.com`) — the port is whatever
 * the container is published on. So a loopback host is safe on ANY port, which
 * is what lets a custom host-port mapping (RECON_DECK_PORT / `-p 13339:13337`)
 * work: the browser sends `Host: localhost:13339` while the container's internal
 * PORT is still 13337. We loosen the port for loopback names only; everything
 * else (LAN/mDNS) still needs an exact RECON_DECK_TRUSTED_HOSTS match.
 */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Strip the `:port` suffix, preserving a bracketed IPv6 literal (`[::1]`). */
function hostnameOf(host: string): string {
  if (host.startsWith("[")) {
    const close = host.indexOf("]");
    return close === -1 ? host : host.slice(0, close + 1);
  }
  const colon = host.indexOf(":");
  return colon === -1 ? host : host.slice(0, colon);
}

/**
 * Return true if the given Host header value is permitted: an exact allowlist
 * match (default port + configured trusted hosts), or any loopback hostname
 * regardless of port.
 */
export function isHostAllowed(host: string): boolean {
  if (getAllowedHosts().has(host)) return true;
  return LOOPBACK_HOSTNAMES.has(hostnameOf(host));
}
