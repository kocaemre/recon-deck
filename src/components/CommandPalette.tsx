"use client";

/**
 * CommandPalette — ⌘K command palette, Modern IDE redesign.
 *
 * Wraps the shadcn CommandDialog with bespoke chrome: bg-2 panel, 620px wide,
 * 10px radius, subtle shadow. Custom rows render a risk/generic dot, label,
 * mono hint, and an accent action chip on the selected/hovered row. Footer
 * strip shows kbd hints and the group counts.
 *
 * Behavior preserved from the previous implementation: Cmd+K open listener,
 * engagement-context-scoped Ports / Copy Command / Actions groups, clipboard
 * + toast on copy, export downloads, new-tab print report.
 */

import { useEffect, useState } from "react";
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
import { DeleteEngagementDialog } from "@/components/DeleteEngagementDialog";

type RiskLevel = "critical" | "high" | "medium" | "low" | "info";

const RISK_VAR: Record<string, string> = {
  critical: "var(--risk-crit)",
  high: "var(--risk-high)",
  medium: "var(--risk-med)",
  low: "var(--risk-low)",
  info: "var(--risk-info)",
};

export function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const engagementContext = useUIStore((s) => s.engagementContext);
  const pathname = usePathname();
  const router = useRouter();

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

  async function downloadExport(
    format:
      | "markdown"
      | "json"
      | "html"
      | "csv"
      | "sysreptor"
      | "pwndoc",
  ) {
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
      // Mirrors the API route's per-format extension (D-21). Keeping the
      // map alongside the label table below so adding a format only
      // touches one place.
      const ext =
        format === "markdown"
          ? "md"
          : format === "sysreptor"
            ? "sysreptor.json"
            : format === "pwndoc"
              ? "pwndoc.yaml"
              : format;
      a.download = `engagement-${engagementContext.engagementId}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const label =
        format === "markdown"
          ? "Markdown"
          : format === "json"
            ? "JSON"
            : format === "html"
              ? "HTML"
              : format === "csv"
                ? "CSV"
                : format === "sysreptor"
                  ? "SysReptor"
                  : "PwnDoc";
      toast.success(`${label} exported`);
    } catch {
      toast.error("Export failed.");
    }
  }

  // Selecting "Delete engagement" from the palette stages the
  // shadcn AlertDialog mounted below; the dialog itself owns the
  // network round-trip and the post-delete navigation.
  const [deleteOpen, setDeleteOpen] = useState(false);

  function deleteEngagementAction() {
    if (!engagementContext) return;
    setOpen(false);
    setDeleteOpen(true);
  }

  function openAddFinding() {
    if (!engagementContext) return;
    setOpen(false);
    // Stage an empty prefill — FindingsPanel's effect picks this up and
    // opens its modal in "new" mode with default severity. Scrolling
    // happens via the modal's own focus; the prefill's portId is null
    // so the finding defaults to engagement-level scope.
    useUIStore.getState().setFindingPrefill({
      title: "",
      severity: "medium",
      cve: null,
      description: "",
      portId: null,
    });
  }

  function openRescan() {
    if (!engagementContext) return;
    setOpen(false);
    useUIStore.getState().setRescanOpen(true);
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

  const portCount = engagementContext?.ports.length ?? 0;
  const commandCount = engagementContext?.kbCommands.length ?? 0;
  // Engagement-scoped: Add finding, Re-import, 6 export formats, Print,
  // Delete = 10. Off-engagement: just the 2 navigation rows.
  const actionCount = onEngagementPage ? 10 : 2;

  return (
    <>
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Jump to a port, copy a command, run an action"
      className="border-0 p-0 max-w-[620px]"
      showCloseButton={false}
    >
      <div
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Input row — shadcn CommandInput already provides the search icon */}
        <div
          className="flex items-center gap-2.5 px-[14px]"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <CommandInput
            placeholder="Jump to port, copy command, run action…"
            className="border-0 shadow-none px-0 h-auto bg-transparent text-[14px] flex-1"
          />
          <Kbd>ESC</Kbd>
        </div>

        <CommandList className="max-h-[380px]">
          <CommandEmpty>
            <div style={{ color: "var(--fg-subtle)" }}>No matching command.</div>
          </CommandEmpty>

          <CommandGroup
            heading="Navigation"
            className="[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:px-[14px] [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1"
          >
            <PaletteRow
              onSelect={() => {
                router.push("/");
                setOpen(false);
              }}
              label="New engagement"
              hint="/"
              actionLabel="Go"
            />
            <PaletteRow
              value="settings preferences config"
              onSelect={() => {
                router.push("/settings");
                setOpen(false);
              }}
              label="Settings"
              hint="/settings"
              actionLabel="Go"
            />
          </CommandGroup>

          {onEngagementPage && engagementContext && (
            <>
              {/* P1-F PR 4-B: host switcher group — only multi-host. */}
              {engagementContext.hosts &&
                engagementContext.hosts.length > 1 && (
                  <CommandGroup
                    heading="Hosts"
                    className="[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:px-[14px] [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1"
                  >
                    {engagementContext.hosts.map((h) => {
                      const display = h.hostname
                        ? `${h.hostname} (${h.ip})`
                        : h.ip;
                      const isActive =
                        engagementContext.activeHostId === h.id;
                      return (
                        <PaletteRow
                          key={`host-${h.id}`}
                          value={`switch host ${h.ip} ${h.hostname ?? ""}`}
                          onSelect={() => {
                            router.push(
                              `/engagements/${engagementContext.engagementId}?host=${h.id}`,
                            );
                            setOpen(false);
                          }}
                          label={display}
                          hint={
                            h.is_primary
                              ? "primary"
                              : isActive
                                ? "active"
                                : ""
                          }
                          actionLabel={isActive ? "Active" : "Switch"}
                        />
                      );
                    })}
                  </CommandGroup>
                )}

              <CommandGroup
                heading="Ports"
                className="[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:px-[14px] [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1"
              >
                {engagementContext.ports.map((p) => (
                  <PaletteRow
                    key={p.id}
                    value={`port ${p.port} ${p.service ?? ""}`}
                    onSelect={() => {
                      useUIStore.getState().setActivePortId(p.id);
                      setOpen(false);
                      document
                        .getElementById("port-detail-pane")
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                    }}
                    label={`${p.port} · ${p.service ?? "unknown"}`}
                    hint={p.service ?? ""}
                    actionLabel="Jump"
                    risk={p.risk as RiskLevel}
                  />
                ))}
              </CommandGroup>

              <CommandGroup
                heading="Commands"
                className="[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:px-[14px] [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1"
              >
                {engagementContext.kbCommands.map((c, i) => (
                  <PaletteRow
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
                    label={c.label}
                    hint={c.command}
                    actionLabel="Copy"
                  />
                ))}
              </CommandGroup>

              <CommandGroup
                heading="Actions"
                className="[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:px-[14px] [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1"
              >
                <PaletteRow
                  value="add finding new"
                  onSelect={openAddFinding}
                  label="Add finding"
                  hint="engagement-level"
                  actionLabel="Run"
                />
                <PaletteRow
                  value="re-import rescan reimport"
                  onSelect={openRescan}
                  label="Re-import nmap output"
                  hint="rescan"
                  actionLabel="Run"
                />
                <PaletteRow
                  onSelect={() => downloadExport("markdown")}
                  label="Export as Markdown"
                  hint=".md"
                  actionLabel="Run"
                />
                <PaletteRow
                  onSelect={() => downloadExport("json")}
                  label="Export as JSON"
                  hint=".json"
                  actionLabel="Run"
                />
                <PaletteRow
                  onSelect={() => downloadExport("html")}
                  label="Export as HTML"
                  hint=".html"
                  actionLabel="Run"
                />
                <PaletteRow
                  onSelect={() => downloadExport("csv")}
                  label="Export findings as CSV"
                  hint=".csv"
                  actionLabel="Run"
                />
                <PaletteRow
                  onSelect={() => downloadExport("sysreptor")}
                  label="Export as SysReptor"
                  hint=".sysreptor.json"
                  actionLabel="Run"
                />
                <PaletteRow
                  onSelect={() => downloadExport("pwndoc")}
                  label="Export as PwnDoc"
                  hint=".pwndoc.yaml"
                  actionLabel="Run"
                />
                <PaletteRow
                  onSelect={openPrintReport}
                  label="Print / PDF view"
                  hint="report"
                  actionLabel="Run"
                />
                <PaletteRow
                  value="delete engagement remove"
                  onSelect={deleteEngagementAction}
                  label="Delete engagement"
                  hint="cannot be undone"
                  actionLabel="Run"
                  risk="critical"
                />
              </CommandGroup>
            </>
          )}
        </CommandList>

        {/* Footer row */}
        <div
          className="flex items-center gap-4"
          style={{
            padding: "8px 14px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-1)",
            color: "var(--fg-subtle)",
            fontSize: 11,
          }}
        >
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>⏎</Kbd> select
          </span>
          <span className="flex items-center gap-1">
            <Kbd>ESC</Kbd> close
          </span>
          <span className="mono ml-auto">
            {portCount} ports · {commandCount} commands · {actionCount} actions
          </span>
        </div>
      </div>
    </CommandDialog>

    {engagementContext && (
      <DeleteEngagementDialog
        engagementId={engagementContext.engagementId}
        engagementName={engagementContext.engagementName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          // Bounce to dashboard + refresh the RSC tree so the deleted
          // row drops out of the sidebar immediately. router.push
          // alone keeps the cached layout.
          router.push("/");
          router.refresh();
        }}
      />
    )}
    </>
  );
}

/* ---------------- presentational helpers ---------------- */

function PaletteRow({
  value,
  onSelect,
  label,
  hint,
  actionLabel,
  risk,
}: {
  value?: string;
  onSelect: () => void;
  label: string;
  hint: string;
  actionLabel: string;
  risk?: RiskLevel;
}) {
  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      className="group flex items-center gap-3 px-[14px] py-2 data-[selected=true]:bg-[var(--bg-3)] data-[selected=true]:border-l-2 data-[selected=true]:border-[color:var(--accent)] rounded-none"
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: risk ? RISK_VAR[risk] : "var(--border-strong)",
          flexShrink: 0,
        }}
      />
      <span
        style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}
      >
        {label}
      </span>
      <span
        className="mono truncate"
        style={{
          fontSize: 11,
          color: "var(--fg-subtle)",
          flex: 1,
          minWidth: 0,
        }}
      >
        {hint}
      </span>
      <span
        className="hidden group-data-[selected=true]:inline-flex items-center gap-1"
        style={{
          padding: "2px 7px",
          borderRadius: 3,
          background: "var(--accent-bg)",
          border: "1px solid var(--accent-border)",
          color: "var(--accent)",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
        }}
      >
        {actionLabel} ↵
      </span>
    </CommandItem>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mono inline-flex items-center justify-center"
      style={{
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 3,
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        borderBottomWidth: 2,
        fontSize: 10,
        color: "var(--fg-muted)",
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}
