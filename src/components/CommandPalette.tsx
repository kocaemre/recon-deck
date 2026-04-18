"use client";

/**
 * CommandPalette — UI-08 Cmd+K command palette.
 *
 * Mounted globally in app/layout.tsx so Cmd+K works from any page. Pulls
 * engagement-scoped data (port list, KB commands) from useUIStore.engagementContext,
 * which is set by <EngagementContextBridge> on the engagement page (Pitfall #3).
 *
 * Sections (per UI-08):
 *   - Always:        "Navigation → New engagement" (router.push("/"))
 *   - Engagement-scoped (only when engagementContext is non-null):
 *       - Jump to Port: enumerated from engagementContext.ports
 *       - Copy Command: enumerated from engagementContext.kbCommands
 *       - Export: Markdown / JSON / HTML / Print PDF
 *
 * Esc-to-close, arrow keys, fuzzy filter — handled natively by cmdk.
 * Cmd+K open trigger lives in KeyboardShortcutHandler (engagement page) AND
 * a small redundant listener inside this component (so Cmd+K works from
 * landing page where KeyboardShortcutHandler is not mounted).
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useUIStore } from "@/lib/store";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

export function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const engagementContext = useUIStore((s) => s.engagementContext);
  const pathname = usePathname();
  const router = useRouter();

  // Redundant Cmd+K listener so the palette opens on the LANDING page too
  // (KeyboardShortcutHandler is engagement-page-scoped). On the engagement
  // page both listeners fire setPaletteOpen(true) — idempotent, no double-open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const onEngagementPage =
    engagementContext !== null && /^\/engagements\/\d+/.test(pathname);

  async function downloadExport(format: "markdown" | "json" | "html") {
    if (!engagementContext) return;
    setOpen(false);
    try {
      const res = await fetch(
        `/api/engagements/${engagementContext.engagementId}/export/${format}`,
      );
      if (!res.ok) {
        toast.error("Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Filename hint — Content-Disposition from server is authoritative.
      const ext = format === "markdown" ? "md" : format;
      a.download = `engagement-${engagementContext.engagementId}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const label =
        format === "markdown" ? "Markdown" : format === "json" ? "JSON" : "HTML";
      toast.success(`${label} exported`);
    } catch {
      toast.error("Export failed.");
    }
  }

  function openPrintReport() {
    if (!engagementContext) return;
    setOpen(false);
    window.open(
      `/engagements/${engagementContext.engagementId}/report`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Type to search commands"
    >
      <CommandInput placeholder="Type a command..." />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => {
              router.push("/");
              setOpen(false);
            }}
          >
            New engagement
          </CommandItem>
        </CommandGroup>

        {onEngagementPage && engagementContext && (
          <>
            <CommandGroup heading="Jump to Port">
              {engagementContext.ports.map((p) => (
                <CommandItem
                  key={p.id}
                  // value provides cmdk's fuzzy search source — include port + service
                  value={`port ${p.port} ${p.service ?? ""}`}
                  onSelect={() => {
                    useUIStore.getState().setActivePortId(p.id);
                    setOpen(false);
                    // Scroll the port card into view (best-effort).
                    document
                      .getElementById(`port-card-${p.id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  {p.port} — {p.service ?? "unknown"}
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="Copy Command">
              {engagementContext.kbCommands.map((c, i) => (
                <CommandItem
                  key={`${c.portId}-${i}`}
                  value={`copy ${c.label} ${c.command}`}
                  onSelect={async () => {
                    try {
                      await navigator.clipboard.writeText(c.command);
                      toast(`Copied: ${c.label}`);
                    } catch {
                      toast.error("Could not copy");
                    }
                    setOpen(false);
                  }}
                >
                  {c.label}
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="Export">
              <CommandItem onSelect={() => downloadExport("markdown")}>
                Export Markdown
              </CommandItem>
              <CommandItem onSelect={() => downloadExport("json")}>
                Export JSON
              </CommandItem>
              <CommandItem onSelect={() => downloadExport("html")}>
                Export HTML
              </CommandItem>
              <CommandItem onSelect={openPrintReport}>
                Print / PDF
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
