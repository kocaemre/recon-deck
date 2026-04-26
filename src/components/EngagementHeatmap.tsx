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
}

export function EngagementHeatmap({
  engagementId,
  ports,
  showAddPort = false,
  activeHostId = null,
}: EngagementHeatmapProps) {
  const activePortId = useUIStore((s) => s.activePortId);
  const setActivePortId = useUIStore((s) => s.setActivePortId);

  // P1-G PR 2: closed-port visibility toggle. Default-hide so the heatmap
  // stays focused on the live attack surface; the toolbar surfaces a
  // "Show N closed" button when applicable.
  const closedCount = ports.filter((p) => p.isClosed).length;
  const [showClosed, setShowClosed] = useState(false);
  const visiblePorts = showClosed ? ports : ports.filter((p) => !p.isClosed);

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
              data={p}
              active={p.id === selected.id}
              onClick={() => {
                setActivePortId(p.id);
                document
                  .getElementById("port-detail-pane")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
          arFiles={selected.arFiles}
          arCommands={selected.arCommands}
          userCommands={selected.userCommands}
          cpe={selected.cpe}
          evidence={selected.evidence}
          exploitQuery={selected.exploitQuery}
        />
      </div>
    </div>
  );
}

function PortTile({
  data,
  active,
  onClick,
}: {
  data: PortTileData;
  active: boolean;
  onClick: () => void;
}) {
  const pct = data.total === 0 ? 0 : (data.done / data.total) * 100;
  // P1-G PR 2: closed tile dims the entire content; new chip surfaces in
  // the top-right corner. Both render only when scan history has > 1 row.
  const dim = data.isClosed === true;
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
            right: 6,
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
