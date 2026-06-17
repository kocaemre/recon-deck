"use client";

/**
 * useAiStatus — shared client hook for the AI co-pilot's availability.
 *
 * Hits GET /api/ai/status once and caches the promise at module scope so
 * many port cards mounting ExplainButton share a single request. Returns
 * `null` while loading; components hide their AI affordances until enabled.
 *
 * Never carries secrets — /api/ai/status is the client-safe projection.
 */

import { useEffect, useState } from "react";

export interface AiStatus {
  enabled: boolean;
  reason: "exam_mode" | "disabled" | "missing_key" | null;
  examMode: boolean;
  provider: string;
  model: string;
  hasKey: boolean;
  cloud: boolean;
}

let cached: Promise<AiStatus | null> | null = null;

function fetchStatus(): Promise<AiStatus | null> {
  if (!cached) {
    cached = fetch("/api/ai/status", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AiStatus>) : null))
      .catch(() => null);
  }
  return cached;
}

/** Test/util escape hatch — drop the cached status so the next call refetches. */
export function resetAiStatusCache(): void {
  cached = null;
}

export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    let alive = true;
    fetchStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return status;
}
