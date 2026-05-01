"use client";

/**
 * EngagementHeatmap — attack-surface grid + selected-port header + detail body.
 *
 * Renders a 128px-minmax grid of port tiles with a colored risk strip,
 * a sticky-feeling selected-port header, and the port detail body below.
 * Drives selection via `useUIStore.activePortId` so j/k keyboard navigation
 * (handled elsewhere) automatically updates the selection.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { useUIStore } from "@/lib/store";
import { PortDetailPane } from "@/components/PortDetailPane";
import { AddPortButton } from "@/components/AddPortButton";
import type { ScriptElem, ScriptTable } from "@/lib/parser/types";
import type { PortEvidence } from "@/lib/db/schema";

type RiskKey = "critical" | "high" | "medium" | "low" | "info";

const RISK_VAR: Record<string, string> = {
  critical: "var(--risk-crit)",
  high: "var(--risk-high)",
  medium: "var(--risk-med)",
  low: "var(--risk-low)",
  info: "var(--risk-info)",
};

const RISK_LABEL: Record<string, string> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "info",
};

function riskColor(risk: string): string {
  return RISK_VAR[risk] ?? "var(--risk-info)";
}

interface PortTileData {
  id: number;
  port: number;
  protocol: string;
  service: string | null;
  product: string | null;
  version: string | null;
  risk: string;
  total: number;
  done: number;
  reason?: string;
  cpe?: string[];
  /** P1-G PR 2: port lifecycle vs latest scan. */
  isClosed?: boolean;
  isNew?: boolean;
  /** v1.2.0 #11: operator-flagged port. Lifts to top of host group + ★ icon. */
  starred?: boolean;
  /** P2: searchsploit query (`product version` or fallback). */
  exploitQuery?: string;
  /** Detail pane data */
  scripts: Array<{
    id: number;
    script_id: string;
    output: string;
    structured?: Array<ScriptElem | ScriptTable>;
  }>;
  checks: Array<{ check_key: string; checked: boolean }>;
  notes: { body: string } | null;
  kbCommands: Array<{ label: string; command: string }>;
  kbChecks: Array<{ key: string; label: string }>;
  kbResources: Array<{ title: string; url: string }>;
  /** P2: KB known_vulns matches for this port's product+version. */
  knownVulns?: Array<{ match: string; note: string; link: string }>;
  /** v1.4.0 #10: KB-declared default credentials, surfaced as a hydra-ready helper panel. */
  defaultCreds?: Array<{ username: string; password: string; notes: string | null }>;
  /** v1.4.0 #10: host label (hostname when present, otherwise IP) so the hydra command picks the right target. */
  hostLabel?: string;
  arFiles: Array<{ filename: string; content: string }>;
  arCommands: Array<{ label: string; command: string }>;
  /** v2/P0-D: user-defined snippets that matched this port. */
  userCommands?: Array<{ label: string; command: string }>;
  evidence: PortEvidence[];
}

interface EngagementHeatmapProps {
  engagementId: number;
  ports: PortTileData[];
  /** v2/P0-D: render the "Add port" button in the heatmap toolbar. */
  showAddPort?: boolean;
  /**
   * Active host id (multi-host engagement). Forwarded to AddPortButton so
   * the manually-inserted port lands on the right host. Single-host
   * engagements pass null.
   */
  activeHostId?: number | null;
  /**
   * v1.4.0 user-feedback: OS label for the active host, surfaced in the
   * Attack Surface toolbar so the operator doesn't have to scroll to
   * the OS Detection panel to know whether they're hitting a Windows or
   * Linux box. Empty/undefined hides the chip.
   */
  osLabel?: string | null;
  osAccuracy?: number | null;
}

export function EngagementHeatmap({
  engagementId,
  ports,
  showAddPort = false,
  activeHostId = null,
  osLabel = null,
  osAccuracy = null,
}: EngagementHeatmapProps) {
  const activePortId = useUIStore((s) => s.activePortId);
  const setActivePortId = useUIStore((s) => s.setActivePortId);

  // P1-G PR 2: closed-port visibility toggle. Default-hide so the heatmap
  // stays focused on the live attack surface; the toolbar surfaces a
  // "Show N closed" button when applicable.
  const closedCount = ports.filter((p) => p.isClosed).length;
  const [showClosed, setShowClosed] = useState(false);
  const filtered = showClosed ? ports : ports.filter((p) => !p.isClosed);
  // v1.2.0 #11: starred ports float to the top inside the visible set.
  // Stable secondary sort preserves the original order (importers already
  // hand us ports sorted by host then port number).
  const visiblePorts = filtered
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const sa = a.p.starred ? 1 : 0;
      const sb = b.p.starred ? 1 : 0;
      if (sa !== sb) return sb - sa;
      return a.i - b.i;
    })
    .map((x) => x.p);

  // Ensure we always have a selection as long as there are ports.
  // Choose the first port by default; use layout effect so the selected-port
  // header renders on first paint instead of flashing empty.
  useEffect(() => {
    if (visiblePorts.length === 0) return;
    if (
      !activePortId ||
      !visiblePorts.some((p) => p.id === activePortId)
    ) {
      setActivePortId(visiblePorts[0].id);
    }
  }, [visiblePorts, activePortId, setActivePortId]);

  if (ports.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "var(--fg-muted)", fontSize: 13 }}>
          No open ports found in this scan.
        </p>
      </div>
    );
  }

  const selected =
    visiblePorts.find((p) => p.id === activePortId) ??
    visiblePorts[0] ??
    ports[0];

  const riskLevels: RiskKey[] = ["critical", "high", "medium", "low", "info"];

  return (
    <div className="flex flex-col">
      {/* Attack-surface grid */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-1)",
        }}
      >
        <div className="mb-3 flex items-center">
          <span
            className="uppercase tracking-[0.08em] font-medium"
            style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
          >
            Attack Surface · {visiblePorts.length} open port
            {visiblePorts.length === 1 ? "" : "s"}
          </span>
          {/* v1.4.0 user-feedback: surface OS up-top so the operator
              can shape their attack plan (Windows vs Linux) without
              scrolling to the OS Detection panel. */}
          {osLabel && (
            <span
              className="mono ml-3 inline-flex items-center gap-1.5"
              style={{
                padding: "1px 8px",
                borderRadius: 3,
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                color: "var(--fg-muted)",
                fontSize: 10.5,
                lineHeight: 1.5,
              }}
              title={
                osAccuracy
                  ? `OS detection · ${osAccuracy}%`
                  : "OS detection"
              }
            >
              <span style={{ color: "var(--fg-subtle)" }}>OS</span>
              <span style={{ color: "var(--fg)" }}>{osLabel}</span>
              {osAccuracy != null && (
                <span style={{ color: "var(--fg-faint)" }}>· {osAccuracy}%</span>
              )}
            </span>
          )}
          {/* P1-G PR 2: closed-port toggle — only renders when there is at
              least one closed port (i.e. the engagement has been re-imported
              and a previously-open port disappeared). */}
          {closedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowClosed((v) => !v)}
              className="mono ml-3"
              style={{
                fontSize: 10.5,
                padding: "2px 8px",
                borderRadius: 4,
                border: showClosed
                  ? "1px solid var(--accent)"
                  : "1px solid var(--border)",
                background: showClosed ? "var(--bg-3)" : "var(--bg-2)",
                color: showClosed ? "var(--accent)" : "var(--fg-muted)",
                cursor: "pointer",
              }}
              title={
                showClosed
                  ? "Hide closed ports"
                  : `Show ${closedCount} closed port${closedCount === 1 ? "" : "s"}`
              }
            >
              {showClosed ? "Hide" : "Show"} {closedCount} closed
            </button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {riskLevels.map((r) => (
              <span
                key={r}
                className="flex items-center gap-1"
                style={{ fontSize: 11, color: "var(--fg-muted)" }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: RISK_VAR[r],
                    display: "inline-block",
                  }}
                />
                {RISK_LABEL[r]}
              </span>
            ))}
            {showAddPort && (
            <AddPortButton
              engagementId={engagementId}
              activeHostId={activeHostId}
            />
          )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))",
            gap: 8,
          }}
        >
          {visiblePorts.map((p) => (
            <PortTile
              key={p.id}
              engagementId={engagementId}
              data={p}
              active={p.id === selected.id}
              onClick={() => {
                // v1.4.0 user-feedback: tile click selects the port
                // without yanking the viewport — the detail pane is
                // already in view and the heatmap shouldn't fight the
                // operator's scroll position.
                setActivePortId(p.id);
              }}
            />
          ))}
        </div>
      </div>

      {/* Selected-port header */}
      <div
        style={{
          padding: "14px 24px 8px",
          background: "var(--bg-1)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1 mono"
            style={{
              padding: "2px 7px",
              borderRadius: 3,
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              fontSize: 11,
              color: "var(--fg-muted)",
              lineHeight: 1.4,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: RISK_VAR[selected.risk] ?? "var(--risk-info)",
                display: "inline-block",
              }}
            />
            <span style={{ color: riskColor(selected.risk) }}>
              {RISK_LABEL[selected.risk] ?? selected.risk}
            </span>
          </span>
          <span
            className="mono font-semibold"
            style={{ fontSize: 18 }}
          >
            {selected.port}
            <span style={{ color: "var(--fg-subtle)" }}>/{selected.protocol}</span>
          </span>
          <span className="font-medium" style={{ fontSize: 14 }}>
            {selected.service ?? "unknown"}
          </span>
          {(selected.product || selected.version) && (
            <span
              className="mono truncate"
              style={{ fontSize: 11.5, color: "var(--fg-muted)", minWidth: 0 }}
            >
              {[selected.product, selected.version].filter(Boolean).join(" ")}
            </span>
          )}
          {selected.reason && (
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: "var(--fg-faint)",
              }}
              title={`state reason: ${selected.reason}`}
            >
              ({selected.reason})
            </span>
          )}
          <span
            className="mono ml-auto"
            style={{ fontSize: 11, color: "var(--fg-muted)" }}
          >
            {selected.done}/{selected.total} checks
          </span>
        </div>
      </div>

      {/* Detail body */}
      <div id="port-detail-pane">
        <PortDetailPane
          engagementId={engagementId}
          portId={selected.id}
          scripts={selected.scripts}
          checks={selected.checks}
          notes={selected.notes}
          kbCommands={selected.kbCommands}
          kbChecks={selected.kbChecks}
          kbResources={selected.kbResources}
          knownVulns={selected.knownVulns}
          defaultCreds={selected.defaultCreds}
          servicePortLabel={`${selected.port}/${selected.protocol}`}
          serviceName={selected.service}
          targetHost={selected.hostLabel}
          arFiles={selected.arFiles}
          arCommands={selected.arCommands}
          userCommands={selected.userCommands}
          cpe={selected.cpe}
          evidence={selected.evidence}
          exploitQuery={selected.exploitQuery}
          risk={selected.risk}
        />
      </div>
    </div>
  );
}

function PortTile({
  engagementId,
  data,
  active,
  onClick,
}: {
  engagementId: number;
  data: PortTileData;
  active: boolean;
  onClick: () => void;
}) {
  const pct = data.total === 0 ? 0 : (data.done / data.total) * 100;
  const dim = data.isClosed === true;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // Optimistic ★ state — flip locally, RSC refresh syncs the truth.
  const [starred, setStarred] = useState<boolean>(data.starred ?? false);
  useEffect(() => {
    setStarred(data.starred ?? false);
  }, [data.starred]);

  async function toggleStar(ev: React.MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    if (pending) return;
    const next = !starred;
    setStarred(next);
    setPending(true);
    try {
      const res = await fetch(
        `/api/engagements/${engagementId}/ports/${data.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ starred: next }),
        },
      );
      if (!res.ok) {
        setStarred(!next);
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Star toggle failed.");
        return;
      }
      // Refresh so the heatmap sort + dedicated SSR fields catch up.
      router.refresh();
    } catch {
      setStarred(!next);
      toast.error("Star toggle failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "relative",
        textAlign: "left",
        padding: "10px 12px",
        border: `1px solid ${active ? "var(--border-strong)" : "var(--border)"}`,
        background: active ? "var(--bg-3)" : "var(--bg-2)",
        borderRadius: 6,
        cursor: "pointer",
        color: "inherit",
        overflow: "hidden",
        outline: active ? "1px solid var(--accent)" : "none",
        outlineOffset: -1,
        opacity: dim ? 0.55 : 1,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 2,
          background: RISK_VAR[data.risk] ?? "var(--risk-info)",
        }}
      />
      {(data.isClosed || data.isNew) && (
        <span
          className="mono uppercase"
          style={{
            position: "absolute",
            top: 6,
            right: 28, // shift left so the ★ sits in the corner
            fontSize: 9,
            letterSpacing: "0.08em",
            padding: "1px 5px",
            borderRadius: 3,
            border: data.isClosed
              ? "1px solid var(--risk-crit)"
              : "1px solid var(--accent)",
            color: data.isClosed ? "var(--risk-crit)" : "var(--accent)",
            background: "var(--bg-2)",
          }}
        >
          {data.isClosed ? "closed" : "new"}
        </span>
      )}
      {/* v1.2.0 #11: star toggle. Always rendered so a starred tile is
          discoverable; idle state stays subtle (faint outline) until hover. */}
      <span
        role="button"
        tabIndex={0}
        aria-label={starred ? "Unstar port" : "Star port"}
        aria-pressed={starred}
        onClick={toggleStar}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            ev.stopPropagation();
            toggleStar(ev as unknown as React.MouseEvent);
          }
        }}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          width: 18,
          height: 18,
          display: "grid",
          placeItems: "center",
          borderRadius: 3,
          cursor: pending ? "wait" : "pointer",
          color: starred ? "var(--accent)" : "var(--fg-faint)",
          opacity: starred ? 1 : 0.55,
          transition: "opacity 0.15s",
          zIndex: 1,
        }}
        onMouseEnter={(ev) => (ev.currentTarget.style.opacity = "1")}
        onMouseLeave={(ev) =>
          (ev.currentTarget.style.opacity = starred ? "1" : "0.55")
        }
      >
        <Star
          size={12}
          strokeWidth={starred ? 2.5 : 1.75}
          fill={starred ? "var(--accent)" : "transparent"}
        />
      </span>
      <div className="flex items-center gap-2">
        <span className="mono font-semibold" style={{ fontSize: 14 }}>
          {data.port}
        </span>
        <span
          className="mono"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          {data.protocol}
        </span>
      </div>
      <div
        className="truncate"
        style={{ fontSize: 11.5, marginTop: 2 }}
      >
        {data.service ?? "unknown"}
      </div>
      <div
        className="flex items-center"
        style={{
          marginTop: 8,
          fontSize: 10.5,
          color: "var(--fg-muted)",
        }}
      >
        <span style={{ color: riskColor(data.risk) }}>
          {RISK_LABEL[data.risk] ?? data.risk}
        </span>
        <span className="mono ml-auto">
          {data.done}/{data.total}
        </span>
      </div>
      <div style={{ marginTop: 6 }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 2,
            background: "var(--bg-3)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${pct}%`,
              background:
                pct === 100 ? "var(--accent)" : "var(--accent-dim)",
            }}
          />
        </div>
      </div>
    </button>
  );
}
