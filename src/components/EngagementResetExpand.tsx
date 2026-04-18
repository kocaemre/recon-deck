"use client";

/**
 * Reset zustand UI state when the active engagement changes.
 *
 * Clears:
 *   - expandedPorts (WR-03 fix — port IDs are globally unique but stale entries
 *     leak across navigations).
 *   - activePortId, portIds, engagementContext (Phase 7 / Pitfall #4) — j/k
 *     shortcut navigation must not point at a port from a different engagement,
 *     and the global CommandPalette must not show jump-to-port for a stale ports list.
 *
 * Render as: <EngagementResetExpand engagementId={id} />
 * It renders nothing visible — pure side-effect component.
 */

import { useEffect } from "react";
import { useUIStore } from "@/lib/store";

interface Props {
  engagementId: number;
}

export function EngagementResetExpand({ engagementId }: Props) {
  const collapseAll = useUIStore((s) => s.collapseAll);
  const setActivePortId = useUIStore((s) => s.setActivePortId);
  const setPortIds = useUIStore((s) => s.setPortIds);
  const setEngagementContext = useUIStore((s) => s.setEngagementContext);

  useEffect(() => {
    collapseAll();
    setActivePortId(null);
    setPortIds([]);
    setEngagementContext(null);
  }, [
    engagementId,
    collapseAll,
    setActivePortId,
    setPortIds,
    setEngagementContext,
  ]);

  return null;
}
