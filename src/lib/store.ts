/**
 * Client-side UI state store (Phase 4, Plan 04-02) — CD-02 / RESEARCH Pattern 4.
 *
 * Tracks port card expand/collapse state across the engagement detail view.
 * This is the ONLY state kept in zustand: everything else (check state,
 * note bodies, engagement metadata) is server-authoritative and loaded via
 * React Server Components.
 *
 * IMPORTANT: This file is NOT guarded by a server-only sentinel — it runs
 * in the browser. It must also stay free of any server-only imports to
 * avoid bundling drizzle/better-sqlite3 into the client chunk.
 *
 * Phase 7 additions (UI-07/UI-08/UI-09): paletteOpen, cheatSheetOpen,
 * activePortId, portIds, engagementContext slices for keyboard shortcuts
 * and the global command palette. All session-scoped — no persist
 * middleware (per RESEARCH State of the Art: localStorage is never used
 * for palette state; reload-resets-everything is the desired behavior).
 *
 * Usage (client component):
 *   "use client";
 *   import { useUIStore } from "@/lib/store";
 *   const expanded = useUIStore((s) => s.expandedPorts.has(portId));
 *   const toggle = useUIStore((s) => s.togglePort);
 *
 *   const open = useUIStore((s) => s.paletteOpen);
 *   const setOpen = useUIStore((s) => s.setPaletteOpen);
 *   const next = useUIStore((s) => s.nextPort);
 */

import { create } from "zustand";

interface UIState {
  /** Set of port IDs (database primary keys) that are currently expanded. */
  expandedPorts: Set<number>;
  /** Toggle a port card between expanded and collapsed. */
  togglePort: (portId: number) => void;
  /** Collapse all port cards (e.g. when navigating to a new engagement). */
  collapseAll: () => void;

  // ---- Phase 7 additions (UI-07 / UI-08 / UI-09) ----

  /** Cmd+K command palette open/closed (UI-08). */
  paletteOpen: boolean;
  /** Set the palette open state. */
  setPaletteOpen: (open: boolean) => void;

  /** `?` shortcut cheat-sheet modal open/closed (UI-09). */
  cheatSheetOpen: boolean;
  /** Set the cheat-sheet open state. */
  setCheatSheetOpen: (open: boolean) => void;

  /** Global cross-engagement search modal open/closed. */
  globalSearchOpen: boolean;
  /** Set global search open state. */
  setGlobalSearchOpen: (open: boolean) => void;

  /**
   * Currently-active port id for j/k navigation (UI-07). Null when no port
   * has been focused yet (initial state) or when navigating between engagements.
   */
  activePortId: number | null;
  /** Set the active port id (used for highlight + as the target of `x` / `c` shortcuts). */
  setActivePortId: (portId: number | null) => void;

  /**
   * Sorted list of port ids on the current engagement, set by the engagement
   * page on mount. j/k navigate through this array. Empty when no engagement
   * is active. Owned by the engagement page — do NOT replicate sort logic
   * client-side (Anti-pattern #2 in RESEARCH).
   */
  portIds: number[];
  /** Replace the port list (call from the engagement page on mount/data-change). */
  setPortIds: (ids: number[]) => void;

  /** Advance activePortId to the next port (wrap-around). No-op when portIds is empty. */
  nextPort: () => void;
  /** Move activePortId to the previous port (wrap-around). No-op when portIds is empty. */
  prevPort: () => void;

  /**
   * Engagement-scoped context for the global CommandPalette (UI-08, Pitfall 3).
   *
   * Set by a small client island on the engagement page; cleared on navigation
   * away. Lets the global palette render "Jump to port" and "Copy command"
   * sections only when the user is on /engagements/[id], without prop-drilling
   * through the layout tree.
   *
   * Shape:
   *   - engagementId: id of the currently-viewed engagement
   *   - ports: { id, port, service }[] — sorted, for "Jump to port: 80 (http)" items
   *   - kbCommands: { portId, label, command }[] — for "Copy command for port 80: ..." items
   */
  engagementContext: {
    engagementId: number;
    ports: Array<{
      id: number;
      port: number;
      service: string | null;
      risk: string;
    }>;
    kbCommands: Array<{ portId: number; label: string; command: string }>;
    /**
     * P1-F PR 4-B: hosts in the engagement, drives the palette's "Switch
     * to host: …" group. Empty/undefined for single-host engagements (no
     * group rendered). Active host is identified by `?host=<id>` and
     * resolved server-side in the page route.
     */
    hosts?: Array<{
      id: number;
      ip: string;
      hostname: string | null;
      is_primary: boolean;
    }>;
    /** Active host id when set — chip highlight uses this. */
    activeHostId?: number | null;
  } | null;
  /** Set or clear the engagement context. */
  setEngagementContext: (ctx: UIState["engagementContext"]) => void;

  /**
   * Prefill payload for FindingsPanel's "New finding" modal. Set by
   * "+ Add as finding" buttons on KB known_vulns / searchsploit hits in
   * PortDetailPane; consumed (and cleared) by FindingsPanel which opens
   * the modal with these fields populated. Null when no prefill is
   * pending. Auto-cleared after the panel handles it so re-clicking the
   * same hit re-opens the modal.
   */
  findingPrefill: {
    title: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    cve: string | null;
    description: string;
    portId: number | null;
  } | null;
  /** Stage a prefill — FindingsPanel auto-opens its modal when this is set. */
  setFindingPrefill: (prefill: UIState["findingPrefill"]) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // ---- Existing slices (preserved verbatim) ----
  expandedPorts: new Set<number>(),
  togglePort: (portId) =>
    set((state) => {
      const next = new Set(state.expandedPorts);
      if (next.has(portId)) {
        next.delete(portId);
      } else {
        next.add(portId);
      }
      return { expandedPorts: next };
    }),
  collapseAll: () => set({ expandedPorts: new Set<number>() }),

  // ---- Phase 7 additions ----

  paletteOpen: false,
  setPaletteOpen: (open) => set({ paletteOpen: open }),

  cheatSheetOpen: false,
  setCheatSheetOpen: (open) => set({ cheatSheetOpen: open }),

  globalSearchOpen: false,
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),

  activePortId: null,
  setActivePortId: (portId) => set({ activePortId: portId }),

  portIds: [],
  setPortIds: (ids) => set({ portIds: ids }),

  nextPort: () =>
    set((state) => {
      if (state.portIds.length === 0) return {};
      if (state.activePortId === null) {
        return { activePortId: state.portIds[0] };
      }
      const idx = state.portIds.indexOf(state.activePortId);
      // Wrap-around: from last → first; if active id no longer in list (-1) → first.
      const nextIdx = idx === -1 ? 0 : (idx + 1) % state.portIds.length;
      return { activePortId: state.portIds[nextIdx] };
    }),

  prevPort: () =>
    set((state) => {
      if (state.portIds.length === 0) return {};
      if (state.activePortId === null) {
        return { activePortId: state.portIds[state.portIds.length - 1] };
      }
      const idx = state.portIds.indexOf(state.activePortId);
      // Wrap-around: from first → last; if active id no longer in list (-1) → last.
      const prevIdx =
        idx === -1
          ? state.portIds.length - 1
          : (idx - 1 + state.portIds.length) % state.portIds.length;
      return { activePortId: state.portIds[prevIdx] };
    }),

  engagementContext: null,
  setEngagementContext: (ctx) => set({ engagementContext: ctx }),

  findingPrefill: null,
  setFindingPrefill: (prefill) => set({ findingPrefill: prefill }),
}));
