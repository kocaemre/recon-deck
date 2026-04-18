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
  ports: Array<{ id: number; port: number; service: string | null }>;
  kbCommands: Array<{ portId: number; label: string; command: string }>;
}

export function EngagementContextBridge({
  engagementId,
  ports,
  kbCommands,
}: Props) {
  const setPortIds = useUIStore((s) => s.setPortIds);
  const setEngagementContext = useUIStore((s) => s.setEngagementContext);

  useEffect(() => {
    setPortIds(ports.map((p) => p.id));
    setEngagementContext({ engagementId, ports, kbCommands });
    return () => {
      setPortIds([]);
      setEngagementContext(null);
    };
  }, [engagementId, ports, kbCommands, setPortIds, setEngagementContext]);

  return null;
}
