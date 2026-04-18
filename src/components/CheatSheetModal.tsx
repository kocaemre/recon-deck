"use client";

/**
 * CheatSheetModal — UI-09 keyboard shortcut cheat-sheet.
 *
 * Triggered by `?` (handled in KeyboardShortcutHandler). Mounted globally in
 * app/layout.tsx — open state is in zustand so the keypress can flip it from
 * any page.
 *
 * Esc-to-close, focus-trap, overlay-click-close are all built into Radix Dialog
 * — DO NOT bind Esc separately here or in KeyboardShortcutHandler.
 *
 * Static content — no props, no fetch, no server state. Purely presentational.
 */

import { useUIStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Shortcut {
  key: string;
  desc: string;
}

const SHORTCUTS: Shortcut[] = [
  { key: "j", desc: "Next port" },
  { key: "k", desc: "Previous port" },
  { key: "x", desc: "Toggle first unchecked check on active port" },
  { key: "c", desc: "Copy first command on active port" },
  { key: "/", desc: "Focus search (opens command palette)" },
  { key: "?", desc: "Show this cheat sheet" },
  { key: "⌘ K  /  Ctrl K", desc: "Command palette" },
  { key: "Esc", desc: "Close modal" },
];

export function CheatSheetModal() {
  const open = useUIStore((s) => s.cheatSheetOpen);
  const setOpen = useUIStore((s) => s.setCheatSheetOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription className="sr-only">
            Reference list of recon-deck keyboard shortcuts
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr
                key={s.key}
                className="border-b border-border/50 last:border-b-0"
              >
                <td className="py-2 pr-4 align-top">
                  <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                    {s.key}
                  </kbd>
                </td>
                <td className="py-2 align-top text-muted-foreground">
                  {s.desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
