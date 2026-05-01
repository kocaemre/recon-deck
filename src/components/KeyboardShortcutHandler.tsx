"use client";

/**
 * KeyboardShortcutHandler — UI-07 / UI-08 / UI-09 keybindings.
 *
 * Side-effect-only client island. Renders nothing visible. Mount ONCE inside
 * the engagement page (next to EngagementResetExpand) so the listener lives
 * with the engagement context and is torn down when the user navigates away.
 *
 * Bindings (RESEARCH §Pattern 1, Open Decisions #3 / #4 / #5):
 *   Global (fire even inside form inputs — they're "global intents"):
 *     Cmd+K / Ctrl+K  → open palette (preventDefault to override browser URL bar)
 *     ?               → open cheat-sheet
 *     /               → open palette + auto-focus input (synonym for Cmd+K
 *                        per Open Decision #5; avoids a separate search field)
 *
 *   Port-context (early-return when typing in INPUT/TEXTAREA/contentEditable):
 *     j               → nextPort
 *     k               → prevPort
 *     x               → toggle FIRST unchecked KB check on activePortId (Open #3)
 *     c               → copy FIRST KB command on activePortId + toast (Open #4)
 *
 *   Esc — DELIBERATELY NOT bound here. Radix Dialog (CheatSheetModal) and cmdk
 *   (CommandPalette) handle Esc-to-close natively — binding it here would race
 *   them and produce double-close bugs.
 *
 * Pitfall #1 — input focus traps: ALL port-context shortcuts early-return when
 * `event.target` is INPUT/TEXTAREA/contentEditable. Verified manually in UAT.
 *
 * Pitfall #2 — Cmd+K browser default: e.preventDefault() before setPaletteOpen.
 * Tested on Chromium AND Firefox per ARCHITECTURE.md browser constraint.
 */

import { useEffect } from "react";
import { toast } from "sonner";
import { useUIStore } from "@/lib/store";
import { toggleCheck } from "../../app/engagements/[id]/actions";

interface Props {
  engagementId: number;
  /**
   * KB-resolved checks per port — used by the `x` shortcut to identify the
   * first unchecked check on activePortId. Sourced from page.tsx where the
   * server has already done KB matching.
   */
  checksByPort: Map<
    number,
    Array<{ key: string; label: string; checked: boolean }>
  >;
}

export function KeyboardShortcutHandler({ engagementId, checksByPort }: Props) {
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const setCheatSheetOpen = useUIStore((s) => s.setCheatSheetOpen);
  const nextPort = useUIStore((s) => s.nextPort);
  const prevPort = useUIStore((s) => s.prevPort);

  useEffect(() => {
    function isInForm(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable
      );
    }

    async function copyActiveCommand(activePortId: number | null) {
      if (activePortId === null) return;
      // Read engagementContext fresh from store (avoid stale closure).
      const ctx = useUIStore.getState().engagementContext;
      if (!ctx) return;
      const cmd = ctx.kbCommands.find((c) => c.portId === activePortId);
      if (!cmd) return;
      try {
        await navigator.clipboard.writeText(cmd.command);
        toast(`Copied: ${cmd.label}`);
      } catch {
        toast.error("Could not copy to clipboard");
      }
    }

    async function toggleActiveCheck(activePortId: number | null) {
      if (activePortId === null) return;
      const checks = checksByPort.get(activePortId);
      if (!checks || checks.length === 0) return;
      // Open Decision #3: toggle FIRST unchecked check; if all checked,
      // toggle the first one (effectively unchecking it).
      const target = checks.find((c) => !c.checked) ?? checks[0];
      try {
        // toggleCheck signature: (engagementId, portId, checkKey, checked)
        // Pass the NEW desired state, not the current one.
        await toggleCheck(engagementId, activePortId, target.key, !target.checked);
        toast(`Toggled: ${target.label}`);
      } catch {
        toast.error("Could not toggle check");
      }
    }

    function onKey(e: KeyboardEvent) {
      // ---- Global shortcuts (fire even inside form inputs) ----

      // Cmd+K / Ctrl+K — palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); // Pitfall #2: override Chromium URL bar / Firefox search bar
        setPaletteOpen(true);
        return;
      }

      // ? — cheat-sheet (matches typed `?` regardless of Shift handling)
      if (e.key === "?") {
        e.preventDefault();
        setCheatSheetOpen(true);
        return;
      }

      // `/` is owned by Sidebar — focuses the engagement filter input.
      // Used to open the palette here (Open Decision #5) but the Kbd hint
      // next to "Filter engagements" promises a focus, so the listener
      // moved to Sidebar to match the UI's own contract.

      // ---- Port-context shortcuts (early-return when typing) ----
      if (isInForm(e.target)) return;

      const activePortId = useUIStore.getState().activePortId;

      if (e.key === "j") {
        e.preventDefault();
        nextPort();
        return;
      }
      if (e.key === "k") {
        e.preventDefault();
        prevPort();
        return;
      }
      if (e.key === "x") {
        e.preventDefault();
        void toggleActiveCheck(activePortId);
        return;
      }
      if (e.key === "c") {
        e.preventDefault();
        void copyActiveCommand(activePortId);
        return;
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    engagementId,
    checksByPort,
    setPaletteOpen,
    setCheatSheetOpen,
    nextPort,
    prevPort,
  ]);

  return null;
}
