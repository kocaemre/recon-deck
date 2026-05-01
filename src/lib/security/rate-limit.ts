/**
 * Token-bucket rate limiter (defense-in-depth, v1.4.x out-of-band).
 *
 * recon-deck is single-user-localhost by design — the host-allowlist
 * middleware (`SEC-01`) already rejects anything that doesn't match
 * `127.0.0.1:13337` / `localhost:13337` / configured hosts. Rate
 * limiting is layered behind that for the LAN-exposure case: an
 * operator who mounts the container with `0.0.0.0:13337` (e.g. to
 * drive recon-deck from a separate teammate workstation on the same
 * VPN) gets a per-IP bucket so a runaway script can't drain CPU /
 * disk by hammering import endpoints.
 *
 * Defaults are deliberately generous — single-user humans never hit
 * them, automation scripts will. Operators who want it off entirely
 * can set `RECON_RATE_LIMIT=off`. Burst limits are intentionally
 * higher than steady-state so a quick palette-driven export burst
 * (CSV + Markdown + SysReptor in one second) doesn't trip.
 *
 * Implementation:
 *   - Pure in-memory Map (single-process, no Redis).
 *   - Token bucket: each IP gets `RATE_BURST` tokens, refilling at
 *     `RATE_PER_MIN / 60` tokens/sec. One request = one token.
 *   - Rejected requests get HTTP 429 with `Retry-After` and a JSON
 *     `{ error: "Rate limit exceeded." }` body.
 *   - GC: stale buckets (no activity for 10 min) get pruned on the
 *     next access — keeps the Map bounded in long-running processes.
 *
 * Boundaries:
 *   - Only the `/api/*` surface is rate-limited. Static assets,
 *     RSC payloads, and `_next/*` go through untouched.
 *   - Localhost (`127.0.0.1` / `::1`) bypasses the limit by default.
 *     Set `RECON_RATE_LIMIT=force` to apply it to localhost too
 *     (useful for CI tests).
 */

interface Bucket {
  tokens: number;
  lastRefill: number; // epoch ms
}

const DEFAULT_BURST = 60;
const DEFAULT_PER_MIN = 600; // 10 req / sec steady-state
const STALE_MS = 10 * 60 * 1000;

const buckets = new Map<string, Bucket>();

function readEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function config() {
  const mode = process.env.RECON_RATE_LIMIT ?? "on";
  return {
    enabled: mode !== "off",
    forceLocalhost: mode === "force",
    burst: readEnv("RECON_RATE_LIMIT_BURST", DEFAULT_BURST),
    perMin: readEnv("RECON_RATE_LIMIT_PER_MIN", DEFAULT_PER_MIN),
  };
}

function isLocalhost(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip === "localhost"
  );
}

export function clientIp(headers: Headers): string {
  // Trust order matches the request-path most operators run:
  // direct → docker → reverse proxy. We pick the first non-empty
  // value and never hand back empty (the host-allowlist already
  // ran, so headers are not adversary-controlled at this point).
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export interface RateLimitVerdict {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function consumeToken(ip: string): RateLimitVerdict {
  const cfg = config();
  if (!cfg.enabled) {
    return { allowed: true, remaining: cfg.burst, retryAfterSec: 0 };
  }
  if (!cfg.forceLocalhost && isLocalhost(ip)) {
    return { allowed: true, remaining: cfg.burst, retryAfterSec: 0 };
  }

  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { tokens: cfg.burst, lastRefill: now };
    buckets.set(ip, bucket);
  } else {
    const elapsed = (now - bucket.lastRefill) / 1000;
    const refill = elapsed * (cfg.perMin / 60);
    bucket.tokens = Math.min(cfg.burst, bucket.tokens + refill);
    bucket.lastRefill = now;
  }

  // Opportunistic GC — only when we're already touching the Map.
  if (buckets.size > 256) {
    for (const [k, b] of buckets.entries()) {
      if (now - b.lastRefill > STALE_MS) buckets.delete(k);
    }
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      retryAfterSec: 0,
    };
  }

  const deficit = 1 - bucket.tokens;
  const retryAfterSec = Math.max(1, Math.ceil(deficit / (cfg.perMin / 60)));
  return { allowed: false, remaining: 0, retryAfterSec };
}

/** Test helper — wipes in-process state between cases. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}
