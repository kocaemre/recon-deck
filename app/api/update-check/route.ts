/**
 * GET /api/update-check — version check against GitHub releases (v1.9.0).
 *
 * Honors `app_state.update_check`. When the toggle is OFF the route
 * short-circuits with `{ enabled: false }` so the client never makes the
 * outbound fetch — keeping recon-deck's "offline by default" promise.
 *
 * When ON, fetches the public latest-release endpoint and compares against
 * the bundled package.json version using a naive semver compare (good
 * enough — recon-deck tags are always X.Y.Z without pre-release suffixes).
 *
 * Process-level cache: results are memoized for 1 hour so navigating
 * between pages doesn't fan out to api.github.com on every load.
 */

import { NextResponse } from "next/server";
import { db, effectiveAppState } from "@/lib/db";
import pkg from "../../../package.json";

interface CacheEntry {
  fetchedAt: number;
  payload: UpdateInfo;
}

interface UpdateInfo {
  enabled: boolean;
  current: string;
  latest?: string;
  hasUpdate?: boolean;
  url?: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: CacheEntry | null = null;

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
  // Manual "Check now" (force=1) bypasses both the toggle gate and the
  // process-level cache. The settings UI uses this to give operators
  // an explicit way to test the version check without flipping the
  // automatic toggle on.
  if (!cfg.updateCheck && !force) {
    return NextResponse.json({ enabled: false, current: pkg.version });
  }

  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cache.payload);
  }

  try {
    const res = await fetch(
      "https://api.github.com/repos/kocaemre/recon-deck/releases/latest",
      {
        headers: { Accept: "application/vnd.github+json" },
        // Edge-runtime safe; node fetch ignores cache.
        cache: "no-store",
      },
    );
    if (!res.ok) {
      const payload: UpdateInfo = { enabled: true, current: pkg.version };
      cache = { fetchedAt: Date.now(), payload };
      return NextResponse.json(payload);
    }
    const json = (await res.json()) as { tag_name?: string; html_url?: string };
    const latestRaw = json.tag_name ?? "";
    const latest = latestRaw.replace(/^v/, "");
    const hasUpdate = latest ? compareSemver(latest, pkg.version) > 0 : false;
    const payload: UpdateInfo = {
      enabled: true,
      current: pkg.version,
      latest,
      hasUpdate,
      url: json.html_url,
    };
    cache = { fetchedAt: Date.now(), payload };
    return NextResponse.json(payload);
  } catch {
    const payload: UpdateInfo = { enabled: true, current: pkg.version };
    cache = { fetchedAt: Date.now(), payload };
    return NextResponse.json(payload);
  }
}
