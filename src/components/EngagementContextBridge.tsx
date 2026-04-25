"use client";

/**
 * EngagementContextBridge — bridges RSC-computed engagement data into the
 * client zustand store so the global <CommandPalette /> can render
 * engagement-scoped Jump-to-Port + Copy-Command sections (Pitfall #3).
 *
 * Receives:
 *   - portIds (sorted) — feeds nextPort/prevPort navigation
 *   - context (engagementId + ports[] + kbCommands[]) — feeds the palette
 *
 * Cleanup: the useEffect cleanup function clears both slices on unmount, so
 * navigating away from the engagement page leaves no stale palette items.
 * (EngagementResetExpand also clears them on engagementId change — belt and
 * braces; both run, both idempotent.)
 *
 * Side-effect-only — renders nothing.
 */

import { useEffect } from "react";
import { useUIStore } from "@/lib/store";

interface Props {
  engagementId: number;
  ports: Array<{
    id: number;
    port: number;
    service: string | null;
    risk: string;
  }>;
  kbCommands: Array<{ portId: number; label: string; command: string }>;
  /** P1-F PR 4-B: hosts list for the palette "Switch to host" group. */
  hosts?: Array<{
    id: number;
    ip: string;
    hostname: string | null;
    is_primary: boolean;
  }>;
  /** P1-F PR 4-B: id of the currently-selected host. */
  activeHostId?: number | null;
}

export function EngagementContextBridge({
  engagementId,
  ports,
  kbCommands,
  hosts,
  activeHostId,
}: Props) {
  const setPortIds = useUIStore((s) => s.setPortIds);
  const setEngagementContext = useUIStore((s) => s.setEngagementContext);

  useEffect(() => {
    setPortIds(ports.map((p) => p.id));
    setEngagementContext({
      engagementId,
      ports,
      kbCommands,
      hosts,
      activeHostId,
    });
    return () => {
      setPortIds([]);
      setEngagementContext(null);
    };
  }, [
    engagementId,
    ports,
    kbCommands,
    hosts,
    activeHostId,
    setPortIds,
    setEngagementContext,
  ]);

  return null;
}
