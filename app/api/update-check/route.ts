/**
 * GET /api/update-check — version check against GitHub releases.
 *
 * Honors `app_state.update_check`. When the toggle is OFF the route
 * short-circuits with `{ enabled: false }` so the client never makes the
 * outbound fetch — keeping recon-deck's "offline by default" promise.
 *
 * When ON, fetches the public release endpoint and compares against the
 * bundled package.json version with a semver-aware compare that understands
 * pre-release suffixes. The stable channel uses /releases/latest (GitHub
 * excludes pre-releases there); set RECON_UPDATE_CHANNEL=beta to track the
 * newest pre-release instead.
 *
 * Process-level cache: only successful results are memoized for 1 hour.
 * Failures (rate limit, 5xx, network) are never cached, so the next call
 * always re-attempts — a transient blip can't poison the cache for an hour.
 */

import { NextResponse } from "next/server";
import { db, effectiveAppState } from "@/lib/db";
import pkg from "../../../package.json";

type UpdateInfo =
  | { enabled: false; current: string }
  | {
      enabled: true;
      ok: true;
      current: string;
      latest: string;
      hasUpdate: boolean;
      url?: string;
    }
  | {
      enabled: true;
      ok: false;
      reason: "github_unavailable" | "rate_limited" | "network_error";
      current: string;
    };

type SuccessPayload = Extract<UpdateInfo, { enabled: true; ok: true }>;

const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { fetchedAt: number; payload: SuccessPayload } | null = null;

function parseVersion(v: string): { nums: number[]; pre: string | null } {
  const [core, pre = null] = v.replace(/^v/, "").split("-", 2) as [
    string,
    string?,
  ];
  return { nums: core.split(".").map((n) => Number(n) || 0), pre };
}

/**
 * SemVer-aware compare. Core X.Y.Z compared numerically; a build WITH a
 * pre-release suffix (2.5.0-beta.1) ranks BELOW the same core without one
 * (2.5.0), and two pre-releases compare by dot-separated identifiers
 * (numeric < alphanumeric, numbers compared by value). This lets the beta
 * channel correctly detect beta.1 → beta.2 → final, while stable-vs-stable
 * (no suffix) behaves exactly as before.
 */
function compareSemver(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    const d = (va.nums[i] ?? 0) - (vb.nums[i] ?? 0);
    if (d !== 0) return d;
  }
  if (va.pre === null && vb.pre === null) return 0;
  if (va.pre === null) return 1; // stable > pre-release of same core
  if (vb.pre === null) return -1;
  const pa = va.pre.split(".");
  const pb = vb.pre.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const ia = pa[i];
    const ib = pb[i];
    if (ia === undefined) return -1;
    if (ib === undefined) return 1;
    const na = Number(ia);
    const nb = Number(ib);
    const aNum = ia !== "" && !Number.isNaN(na);
    const bNum = ib !== "" && !Number.isNaN(nb);
    if (aNum && bNum) {
      if (na !== nb) return na - nb;
    } else if (aNum !== bNum) {
      return aNum ? -1 : 1; // numeric identifiers rank below alphanumeric
    } else if (ia !== ib) {
      return ia < ib ? -1 : 1;
    }
  }
  return 0;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const cfg = effectiveAppState(db);
  if (!cfg.updateCheck && !force) {
    return NextResponse.json<UpdateInfo>({
      enabled: false,
      current: pkg.version,
    });
  }

  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cache.payload);
  }

  // Beta channel opt-in (env-gated, server-only). On the stable channel we
  // hit /releases/latest, which GitHub guarantees excludes pre-releases — so
  // stable installs are never nudged toward a beta. On the beta channel we
  // list recent releases (pre-releases included) and take the newest.
  const betaChannel = process.env.RECON_UPDATE_CHANNEL === "beta";
  const endpoint = betaChannel
    ? "https://api.github.com/repos/kocaemre/recon-deck/releases?per_page=10"
    : "https://api.github.com/repos/kocaemre/recon-deck/releases/latest";

  try {
    const res = await fetch(endpoint, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const isRateLimited = res.status === 403 && remaining === "0";
      return NextResponse.json<UpdateInfo>({
        enabled: true,
        ok: false,
        reason: isRateLimited ? "rate_limited" : "github_unavailable",
        current: pkg.version,
      });
    }
    type Release = { tag_name?: string; html_url?: string; draft?: boolean };
    const body = (await res.json()) as Release | Release[];
    // Stable endpoint returns one release; the beta list returns newest-first.
    const release = Array.isArray(body)
      ? body.find((r) => !r.draft)
      : body;
    const latestRaw = release?.tag_name ?? "";
    const latest = latestRaw.replace(/^v/, "");
    if (!latest) {
      return NextResponse.json<UpdateInfo>({
        enabled: true,
        ok: false,
        reason: "github_unavailable",
        current: pkg.version,
      });
    }
    const hasUpdate = compareSemver(latest, pkg.version) > 0;
    const payload: SuccessPayload = {
      enabled: true,
      ok: true,
      current: pkg.version,
      latest,
      hasUpdate,
      url: release?.html_url,
    };
    cache = { fetchedAt: Date.now(), payload };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json<UpdateInfo>({
      enabled: true,
      ok: false,
      reason: "network_error",
      current: pkg.version,
    });
  }
}
