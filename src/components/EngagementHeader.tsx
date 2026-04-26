"use client";

/**
 * Engagement header — Modern IDE redesign (two-row layout).
 *
 * Row 1: ENGAGEMENT label, name, source + created chips, Palette button,
 *        Export dropdown.
 * Row 2: Target IP (inline edit), hostname (inline edit), port count +
 *        risk-distribution chips, and a progress stack aligned right.
 *
 * Preserves existing behavior:
 *   - Inline edit with empty-IP validation (restore on blur).
 *   - Export dropdown with Markdown / JSON / HTML / Print PDF.
 *   - Toast feedback (Phase 6 D-04).
 */

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCw, Search } from "lucide-react";
import { toast } from "sonner";
import { RescanModal } from "@/components/RescanModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/lib/store";
import { updateEngagementTarget } from "../../app/engagements/[id]/actions";

type RiskKey = "critical" | "high" | "medium" | "low" | "info";

const RISK_SHORT: Record<RiskKey, string> = {
  critical: "crit",
  high: "high",
  medium: "med",
  low: "low",
  info: "info",
};

const RISK_VAR: Record<RiskKey, string> = {
  critical: "var(--risk-crit)",
  high: "var(--risk-high)",
  medium: "var(--risk-med)",
  low: "var(--risk-low)",
  info: "var(--risk-info)",
};

const RISK_ORDER: RiskKey[] = ["critical", "high", "medium", "low", "info"];

interface EngagementHeaderProps {
  engagementId: number;
  name: string;
  source: string;
  createdAt: string;
  targetIp: string;
  targetHostname: string | null;
  portCount: number;
  totalChecks: number;
  doneChecks: number;
  riskCounts: Partial<Record<RiskKey, number>>;
  /** v2: optional scanner meta from `<nmaprun version args ...>`. */
  scanner?: { name?: string; version?: string; args?: string };
  /** v2: optional extra-ports summary from `<extraports>` / "Not shown:". */
  extraPorts?: { state: string; count: number }[];
  /** v2: optional finished-at timestamp from `<runstats><finished>`. */
  finishedAt?: string;
  /** v2: secondary addresses (IPv6 + MAC) — first IPv4/IPv6 already shown via targetIp. */
  addresses?: Array<{ addr: string; addrtype: string; vendor?: string }>;
  /** v2: secondary hostnames (PTR + user) — first hostname already shown via targetHostname. */
  hostnames?: Array<{ name: string; type: string }>;
  /** P1-F PR 4: every host in the engagement — drives the host selector row. */
  hosts?: Array<{
    id: number;
    ip: string;
    hostname: string | null;
    is_primary: boolean;
    /** Active host's OS chip uses these fields when present. */
    os_name?: string | null;
    os_accuracy?: number | null;
  }>;
  /** P1-F PR 4: id of the currently-selected host (driven by `?host=<id>`). */
  activeHostId?: number | null;
  /**
   * P1-G follow-up: total number of scan_history rows for this engagement.
   * The header surfaces a "scans: N" chip when > 1 so the operator knows
   * a re-import has happened and the closed/new lifecycle chips on the
   * heatmap are meaningful.
   */
  scanCount?: number;
}

export function EngagementHeader({
  engagementId,
  name,
  source,
  createdAt,
  targetIp,
  targetHostname,
  portCount,
  totalChecks,
  doneChecks,
  riskCounts,
  scanner,
  extraPorts,
  finishedAt,
  addresses,
  hostnames,
  hosts,
  activeHostId,
  scanCount,
}: EngagementHeaderProps) {
  const [ip, setIp] = useState(targetIp);
  const [hostname, setHostname] = useState(targetHostname ?? "");
  const [ipError, setIpError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rescanOpen, setRescanOpen] = useState(false);
  const router = useRouter();
  const prevIpRef = useRef(targetIp);
  const prevHostnameRef = useRef(targetHostname ?? "");
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);

  async function handleTargetSave() {
    const trimmedIp = ip.trim();
    if (!trimmedIp) {
      setIpError("Target cannot be empty.");
      setIp(prevIpRef.current);
      return;
    }
    setIpError(null);
    if (
      trimmedIp === prevIpRef.current &&
      hostname.trim() === prevHostnameRef.current
    ) {
      return;
    }
    setSaving(true);
    try {
      await updateEngagementTarget(
        engagementId,
        trimmedIp,
        hostname.trim() || null,
      );
      prevIpRef.current = trimmedIp;
      prevHostnameRef.current = hostname.trim();
      router.refresh();
    } catch {
      setIp(prevIpRef.current);
      setHostname(prevHostnameRef.current);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  }

  async function downloadExport(
    format: "markdown" | "json" | "html" | "csv" | "sysreptor" | "pwndoc",
  ) {
    try {
      const res = await fetch(
        `/api/engagements/${engagementId}/export/${format}`,
      );
      if (!res.ok) {
        toast.error("Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Filename extension matches the route's FORMATS table — markdown→md,
      // sysreptor→sysreptor.json, pwndoc→pwndoc.yaml, others lower-cased.
      const ext =
        format === "markdown"
          ? "md"
          : format === "sysreptor"
            ? "sysreptor.json"
            : format === "pwndoc"
              ? "pwndoc.yaml"
              : format;
      a.download = `${targetIp}-${new Date().toISOString().slice(0, 10)}.${ext}`;
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
    window.open(
      `/engagements/${engagementId}/report`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  const createdLabel = (() => {
    try {
      return new Date(createdAt).toISOString().slice(0, 10);
    } catch {
      return createdAt;
    }
  })();

  const pct = totalChecks === 0 ? 0 : Math.round((doneChecks / totalChecks) * 100);

  return (
    <div
      className="px-6 pt-[18px] pb-4"
      style={{ background: "var(--bg-1)", borderBottom: "1px solid var(--border)" }}
    >
      {/* Row 1: label + name + chips + palette + export */}
      <div className="mb-[10px] flex items-center gap-3">
        <span
          className="uppercase tracking-[0.08em] font-medium mono"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          ENGAGEMENT
        </span>
        <h1
          className="font-semibold"
          style={{ fontSize: 17, letterSpacing: "-0.01em" }}
        >
          {name}
        </h1>
        <Chip mono>{source}</Chip>
        <Chip variant="solid" mono>
          created {createdLabel}
        </Chip>
        {scanner?.version && (
          <Chip variant="solid" mono title={scanner.args ?? `nmap ${scanner.version}`}>
            nmap {scanner.version}
          </Chip>
        )}
        {finishedAt && (
          <Chip variant="solid" mono title={finishedAt}>
            finished {finishedAt.slice(0, 10)}
          </Chip>
        )}
        {(() => {
          // OS chip — sourced from the active host (or primary, or
          // engagement-level fallback baked into hosts[0] by getById).
          const active = hosts?.find((h) => h.id === activeHostId)
            ?? hosts?.find((h) => h.is_primary)
            ?? hosts?.[0];
          if (!active?.os_name) return null;
          const accuracy = active.os_accuracy
            ? ` · ${active.os_accuracy}%`
            : "";
          return (
            <Chip
              variant="solid"
              mono
              title={`OS detection${accuracy} (active host)`}
            >
              OS {active.os_name}
              {accuracy}
            </Chip>
          );
        })()}
        {/* v2: secondary addresses/hostnames — render only the ones not already
           shown as primary (targetIp / targetHostname). */}
        {addresses
          ?.filter((a) => a.addr !== targetIp)
          .map((a, i) => (
            <Chip
              key={`addr-${i}`}
              variant="solid"
              mono
              title={a.vendor ? `${a.addrtype} · ${a.vendor}` : a.addrtype}
            >
              {a.addr}
            </Chip>
          ))}
        {hostnames
          ?.filter((h) => h.name !== (targetHostname ?? ""))
          .map((h, i) => (
            <Chip
              key={`host-${i}`}
              variant="solid"
              mono
              title={`hostname · ${h.type}`}
            >
              {h.name}
            </Chip>
          ))}

        <div className="ml-auto flex items-center gap-2">
          {scanCount && scanCount > 1 && (
            <Chip mono title={`${scanCount} nmap re-imports recorded`}>
              scans: {scanCount}
            </Chip>
          )}
          <button
            type="button"
            onClick={() => setRescanOpen(true)}
            className="inline-flex items-center gap-1.5"
            style={{
              height: 24,
              padding: "0 10px",
              borderRadius: 5,
              background: "var(--bg-2)",
              color: "var(--fg-muted)",
              fontSize: 11.5,
              fontWeight: 500,
              border: "1px solid var(--border)",
              cursor: "pointer",
            }}
            title="Re-import nmap output and reconcile ports"
          >
            <RotateCw size={11} />
            Re-import
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="btn-sm-ghost inline-flex items-center gap-1.5"
            style={{
              height: 24,
              padding: "0 8px",
              borderRadius: 5,
              background: "transparent",
              color: "var(--fg-muted)",
              fontSize: 11.5,
              fontWeight: 500,
              border: "1px solid transparent",
              cursor: "pointer",
            }}
          >
            <Search size={12} />
            Palette
            <Kbd>⌘K</Kbd>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1"
                style={{
                  height: 24,
                  padding: "0 8px",
                  borderRadius: 5,
                  background: "var(--bg-2)",
                  color: "var(--fg)",
                  fontSize: 11.5,
                  fontWeight: 500,
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                Export
                <span style={{ color: "var(--fg-subtle)" }}>▾</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => downloadExport("markdown")}>
                Markdown (.md)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => downloadExport("json")}>
                JSON (.json)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => downloadExport("html")}>
                HTML (.html)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* P1-H: reporting-tool feeds. Generic shapes operators map
                  onto their own SysReptor / PwnDoc design templates. CSV
                  is a flat findings dump for spreadsheet triage. */}
              <DropdownMenuItem onSelect={() => downloadExport("csv")}>
                Findings CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => downloadExport("sysreptor")}>
                SysReptor (.json)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => downloadExport("pwndoc")}>
                PwnDoc (.yaml)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={openPrintReport}>
                Print / PDF…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Row 2: targets + ports + progress */}
      <div className="flex items-end gap-6">
        <div className="min-w-[140px]">
          <Label>Target IP</Label>
          <input
            value={ip}
            onChange={(e) => {
              setIp(e.target.value);
              setIpError(null);
            }}
            onBlur={handleTargetSave}
            onKeyDown={handleKeyDown}
            placeholder="e.g. 10.10.10.1"
            disabled={saving}
            className="mono mt-1 w-full"
            style={{
              background: "transparent",
              border: "1px solid transparent",
              padding: "2px 6px",
              marginLeft: -6,
              borderRadius: 4,
              color: "var(--fg)",
              fontSize: 15,
              outline: "none",
            }}
          />
          {ipError && (
            <p
              className="mt-1"
              style={{ fontSize: 11, color: "var(--risk-crit)" }}
            >
              {ipError}
            </p>
          )}
        </div>

        <Divider />

        <div className="min-w-[140px]">
          <Label>Hostname</Label>
          <input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            onBlur={handleTargetSave}
            onKeyDown={handleKeyDown}
            placeholder="optional"
            disabled={saving}
            className="mono mt-1 w-full"
            style={{
              background: "transparent",
              border: "1px solid transparent",
              padding: "2px 6px",
              marginLeft: -6,
              borderRadius: 4,
              color: "var(--fg)",
              fontSize: 15,
              outline: "none",
            }}
          />
        </div>

        <Divider />

        <div>
          <Label>Ports</Label>
          <div className="mt-1 flex items-center gap-2">
            <span className="mono" style={{ fontSize: 15 }}>
              {portCount}
            </span>
            <div className="flex items-center gap-1">
              {RISK_ORDER.map((r) =>
                riskCounts[r] ? (
                  <Chip key={r} mono>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: RISK_VAR[r],
                        display: "inline-block",
                      }}
                    />{" "}
                    {riskCounts[r]}
                  </Chip>
                ) : null,
              )}
            </div>
          </div>
          {extraPorts && extraPorts.length > 0 && (
            <div
              className="mono mt-1"
              style={{ fontSize: 11, color: "var(--fg-faint)" }}
              title={extraPorts
                .map((g) => `${g.count} ${g.state}`)
                .join(", ")}
            >
              + {extraPorts.map((g) => `${g.count} ${g.state}`).join(" · ")}
            </div>
          )}
        </div>

        <div className="ml-auto" style={{ minWidth: 260 }}>
          <div className="mb-1 flex items-center">
            <Label>Progress</Label>
            <span
              className="mono ml-auto"
              style={{ fontSize: 12, color: "var(--fg-muted)" }}
            >
              {doneChecks} / {totalChecks} checks · {pct}%
            </span>
          </div>
          <ProgressLine done={doneChecks} total={totalChecks} height={4} />
        </div>
      </div>

      {/* P1-G PR 1: re-import modal. Mounted at the header so the trigger
          button can pop it without prop-drilling through the engagement
          page tree. */}
      <RescanModal
        engagementId={engagementId}
        open={rescanOpen}
        onOpenChange={setRescanOpen}
      />

      {/* P1-F PR 4: host selector — only rendered when the engagement has
          more than one host. Single-host engagements keep the legacy
          two-row header verbatim. Each chip is a `Link` to `?host=<id>`,
          which triggers a soft RSC re-render so the heatmap re-scopes. */}
      {hosts && hosts.length > 1 && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Label>Hosts</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {hosts.map((h) => {
              const isActive = activeHostId === h.id;
              const display = h.hostname ? `${h.hostname} (${h.ip})` : h.ip;
              return (
                <Link
                  key={h.id}
                  href={`/engagements/${engagementId}?host=${h.id}`}
                  scroll={false}
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    padding: "3px 8px",
                    borderRadius: 4,
                    border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                    background: isActive ? "var(--bg-3)" : "var(--bg-2)",
                    color: isActive ? "var(--accent)" : "var(--fg-muted)",
                    textDecoration: "none",
                    fontWeight: isActive ? 600 : 500,
                  }}
                  title={
                    h.is_primary
                      ? `Primary host · ${h.ip}`
                      : `Switch to ${h.ip}`
                  }
                >
                  {display}
                  {h.is_primary && (
                    <span
                      style={{
                        marginLeft: 4,
                        color: "var(--accent)",
                        fontSize: 9,
                      }}
                      aria-label="primary host"
                    >
                      ★
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------ small presentational helpers (co-located) ------------ */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="uppercase tracking-[0.08em] font-medium"
      style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div
      aria-hidden
      style={{ width: 1, height: 34, background: "var(--border)" }}
    />
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

function Chip({
  children,
  variant = "default",
  mono = false,
  title,
}: {
  children: React.ReactNode;
  variant?: "default" | "solid";
  mono?: boolean;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${mono ? "mono" : ""}`}
      title={title}
      style={{
        padding: "2px 7px",
        borderRadius: 3,
        background: variant === "solid" ? "var(--bg-1)" : "var(--bg-3)",
        border: "1px solid var(--border)",
        fontSize: 11,
        color: "var(--fg-muted)",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function ProgressLine({
  done,
  total,
  height = 2,
}: {
  done: number;
  total: number;
  height?: number;
}) {
  const pct = total === 0 ? 0 : (done / total) * 100;
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height,
        background: "var(--bg-3)",
        borderRadius: 2,
        overflow: "hidden",
      }}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      role="progressbar"
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: `${pct}%`,
          background: pct === 100 ? "var(--accent)" : "var(--accent-dim)",
        }}
      />
    </div>
  );
}

// (RISK_SHORT is module-internal — was exported but never imported elsewhere.)
