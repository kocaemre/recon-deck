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

interface ShortcutGroup {
  scope: string;
  items: Shortcut[];
}

// v1.4.0 #14: shortcuts grouped by where they fire so the cheat sheet
// doubles as a discoverability surface — operators learning the app
// see "what works on the engagement page" vs "what works anywhere".
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    scope: "Global",
    items: [
      { key: "n", desc: "New engagement (focus landing page)" },
      { key: "/", desc: "Focus the sidebar filter input" },
      { key: "⌘ K  /  Ctrl K", desc: "Command palette" },
      { key: "⇧ ⌘ F", desc: "Search across all engagements" },
      { key: "?", desc: "Show this cheat sheet" },
      { key: "Esc", desc: "Close modal" },
    ],
  },
  {
    scope: "Engagement page",
    items: [
      { key: "j", desc: "Next port" },
      { key: "k", desc: "Previous port" },
      { key: "x", desc: "Toggle first unchecked check on active port" },
      { key: "c", desc: "Copy first command on active port" },
    ],
  },
  {
    scope: "Findings",
    items: [
      { key: "⇧ ⌘ C", desc: "Copy first finding as Markdown" },
    ],
  },
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
        <div className="flex flex-col gap-4">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.scope}>
              <div
                className="mono uppercase tracking-[0.08em] font-medium"
                style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginBottom: 6 }}
              >
                {group.scope}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {group.items.map((s) => (
                    <tr
                      key={`${group.scope}-${s.key}`}
                      className="border-b border-border/50 last:border-b-0"
                    >
                      <td className="py-2 pr-4 align-top" style={{ width: 130 }}>
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
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
