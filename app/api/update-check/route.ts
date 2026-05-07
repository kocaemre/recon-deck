/**
 * GET /api/update-check — version check against GitHub releases.
 *
 * Honors `app_state.update_check`. When the toggle is OFF the route
 * short-circuits with `{ enabled: false }` so the client never makes the
 * outbound fetch — keeping recon-deck's "offline by default" promise.
 *
 * When ON, fetches the public latest-release endpoint and compares against
 * the bundled package.json version using a naive semver compare (good
 * enough — recon-deck tags are always X.Y.Z without pre-release suffixes).
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

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((n) => Number(n) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const dbn = pb[i] ?? 0;
    if (da !== dbn) return da - dbn;
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

  try {
    const res = await fetch(
      "https://api.github.com/repos/kocaemre/recon-deck/releases/latest",
      {
        headers: { Accept: "application/vnd.github+json" },
        cache: "no-store",
      },
    );
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
    const json = (await res.json()) as { tag_name?: string; html_url?: string };
    const latestRaw = json.tag_name ?? "";
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
      url: json.html_url,
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
