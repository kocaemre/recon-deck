"use client";

/**
 * FindingsPanel — engagement-level findings catalog UI.
 *
 * Renders a severity-grouped list of findings with inline create/edit/delete
 * actions. Per-port findings show a port chip; engagement-level findings
 * show "engagement" badge instead.
 *
 * Lives in EngagementExtras-style collapsible at the bottom of the engagement
 * page, but always defaults open when at least one finding exists. Empty
 * state explains how to add one.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Pencil, Trash2, Clipboard } from "lucide-react";
import { toast } from "sonner";
import type { Finding } from "@/lib/db/schema";
import { useUIStore } from "@/lib/store";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

const SEVERITY_ORDER: Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "info",
};

const SEVERITY_VAR: Record<Severity, string> = {
  critical: "var(--risk-crit)",
  high: "var(--risk-high)",
  medium: "var(--risk-med)",
  low: "var(--risk-low)",
  info: "var(--risk-info)",
};

interface FindingsPanelProps {
  engagementId: number;
  findings: Finding[];
  /**
   * P1-F PR 4-B: every port across the entire engagement (not just the
   * active host). Findings span the whole engagement; restricting to the
   * active host's ports would hide findings from other hosts. Each port
   * carries optional `hostIp`/`hostHostname` so multi-host engagements can
   * label "DC01:445" instead of just "445".
   */
  ports: Array<{
    id: number;
    port: number;
    protocol: string;
    service: string | null;
    hostIp?: string | null;
    hostHostname?: string | null;
  }>;
  /** Multi-host: render "<host>:<port>" labels in the FindingRow. */
  isMultiHost?: boolean;
}

export function FindingsPanel({
  engagementId,
  findings,
  ports,
  isMultiHost = false,
}: FindingsPanelProps) {
  const [editing, setEditing] = useState<Finding | "new" | null>(null);
  const router = useRouter();
  const findingPrefill = useUIStore((s) => s.findingPrefill);
  const setFindingPrefill = useUIStore((s) => s.setFindingPrefill);

  // PortDetailPane stages a prefill when the operator clicks "+ Add as
  // finding" on a KB known_vuln or searchsploit hit. Open the modal in
  // "new" mode (FindingFormModal seeds its inputs from the prefill via
  // initial* props) and clear the slot so re-clicking the same hit fires
  // again. Setting `editing` to a Finding object would mean "edit existing"
  // — we explicitly stay in "new" so the POST hits /findings, not PATCH.
  useEffect(() => {
    if (findingPrefill) {
      setEditing("new");
    }
  }, [findingPrefill]);

  // Group by severity, in canonical order. Skip empty groups but keep the
  // section header visible when total > 0 to communicate the dimension.
  const grouped = SEVERITY_ORDER.map((sev) => ({
    severity: sev,
    items: findings.filter((f) => f.severity === sev),
  }));

  const portMap = new Map(ports.map((p) => [p.id, p]));

  async function onDelete(f: Finding) {
    if (!confirm(`Delete finding "${f.title}"?`)) return;
    try {
      const res = await fetch(
        `/api/engagements/${engagementId}/findings/${f.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        toast.error("Delete failed.");
        return;
      }
      toast.success("Finding removed");
      router.refresh();
    } catch {
      toast.error("Delete failed.");
    }
  }

  return (
    <div
      className="px-6 py-4"
      style={{ borderTop: "1px solid var(--border)", background: "var(--bg-0)" }}
    >
      <div className="flex items-center mb-3">
        <span
          className="uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          Findings
        </span>
        <span
          className="mono"
          style={{
            marginLeft: 8,
            fontSize: 10.5,
            color: "var(--fg-faint)",
          }}
        >
          {findings.length}
        </span>
        <SeverityCountBar findings={findings} />
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="ml-auto inline-flex items-center gap-1.5"
          style={{
            height: 24,
            padding: "0 8px",
            borderRadius: 5,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            fontSize: 11.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <Plus size={11} />
          Add finding
        </button>
      </div>

      {findings.length === 0 ? (
        <div
          style={{
            padding: "16px 12px",
            border: "1px dashed var(--border-strong)",
            borderRadius: 6,
            textAlign: "center",
            fontSize: 12,
            color: "var(--fg-subtle)",
            background: "var(--bg-1)",
          }}
        >
          No findings yet — click <strong>Add finding</strong> to record what you
          discovered (default credentials, vulnerable service, privesc path,
          etc.). Findings are surfaced in exports for reporting.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {grouped.map(
            (g) =>
              g.items.length > 0 && (
                <div key={g.severity}>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: SEVERITY_VAR[g.severity],
                      }}
                    />
                    <span
                      className="uppercase tracking-[0.08em] font-medium"
                      style={{
                        fontSize: 10.5,
                        color: SEVERITY_VAR[g.severity],
                      }}
                    >
                      {SEVERITY_LABEL[g.severity]}
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10.5,
                        color: "var(--fg-faint)",
                      }}
                    >
                      {g.items.length}
                    </span>
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {g.items.map((f) => (
                      <li key={f.id}>
                        <FindingRow
                          finding={f}
                          portInfo={
                            f.port_id !== null
                              ? portMap.get(f.port_id)
                              : undefined
                          }
                          isMultiHost={isMultiHost}
                          onEdit={() => setEditing(f)}
                          onDelete={() => onDelete(f)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}
        </div>
      )}

      {editing !== null && (
        <FindingFormModal
          engagementId={engagementId}
          ports={ports}
          finding={editing === "new" ? null : editing}
          prefill={editing === "new" ? findingPrefill : null}
          onClose={() => {
            setEditing(null);
            setFindingPrefill(null);
          }}
        />
      )}
    </div>
  );
}

function SeverityCountBar({ findings }: { findings: Finding[] }) {
  const counts = SEVERITY_ORDER.map((sev) => ({
    severity: sev,
    n: findings.filter((f) => f.severity === sev).length,
  })).filter((c) => c.n > 0);
  if (counts.length === 0) return null;
  return (
    <div className="flex items-center gap-1 ml-3">
      {counts.map((c) => (
        <span
          key={c.severity}
          className="mono inline-flex items-center gap-1"
          style={{
            padding: "1px 6px",
            borderRadius: 3,
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            fontSize: 10.5,
            color: "var(--fg-muted)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 2,
              background: SEVERITY_VAR[c.severity],
              display: "inline-block",
            }}
          />
          {c.n}
        </span>
      ))}
    </div>
  );
}

function FindingRow({
  finding,
  portInfo,
  isMultiHost,
  onEdit,
  onDelete,
}: {
  finding: Finding;
  portInfo:
    | {
        port: number;
        protocol: string;
        service: string | null;
        hostIp?: string | null;
        hostHostname?: string | null;
      }
    | undefined;
  isMultiHost: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // P1-F PR 4-B: in multi-host engagements the port chip prefixes the
  // host's hostname (or IP) so operators can distinguish "DC01:445" from
  // "ws01:445" at a glance.
  const hostLabel =
    isMultiHost && portInfo
      ? portInfo.hostHostname ?? portInfo.hostIp ?? null
      : null;
  return (
    <div
      className="flex items-start gap-3"
      style={{
        padding: "8px 10px",
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        borderRadius: 5,
        marginBottom: 4,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {portInfo ? (
            <span
              className="mono inline-flex items-center"
              style={{
                padding: "1px 6px",
                borderRadius: 3,
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                fontSize: 10.5,
                color: "var(--fg-muted)",
              }}
            >
              {hostLabel && (
                <span style={{ marginRight: 4, color: "var(--accent)" }}>
                  {hostLabel}:
                </span>
              )}
              {portInfo.port}/{portInfo.protocol}
              {portInfo.service && (
                <span style={{ marginLeft: 4, color: "var(--fg-subtle)" }}>
                  {portInfo.service}
                </span>
              )}
            </span>
          ) : (
            <span
              className="uppercase tracking-[0.08em] font-medium"
              style={{
                padding: "1px 6px",
                borderRadius: 3,
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                fontSize: 9.5,
                color: "var(--fg-subtle)",
              }}
            >
              ENGAGEMENT
            </span>
          )}
          <span
            style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}
          >
            {finding.title}
          </span>
          {finding.cve && (
            <span
              className="mono"
              style={{ fontSize: 11, color: "var(--accent)" }}
            >
              {finding.cve}
            </span>
          )}
        </div>
        {finding.description && (
          <div
            style={{
              fontSize: 12,
              color: "var(--fg-muted)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {finding.description}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                findingToMarkdown(finding, portInfo ?? null),
              );
              toast.success("Finding copied as Markdown");
            } catch {
              toast.error("Clipboard unavailable.");
            }
          }}
          aria-label="Copy as Markdown"
          title="Copy as Markdown"
          style={iconBtn}
        >
          <Clipboard size={11} />
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit"
          title="Edit"
          style={iconBtn}
        >
          <Pencil size={11} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete"
          title="Delete"
          style={{ ...iconBtn, color: "var(--risk-crit)" }}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 22,
  height: 22,
  display: "grid",
  placeItems: "center",
  border: "1px solid var(--border)",
  borderRadius: 4,
  background: "var(--bg-2)",
  color: "var(--fg-muted)",
  cursor: "pointer",
};

function FindingFormModal({
  engagementId,
  ports,
  finding,
  prefill,
  onClose,
}: {
  engagementId: number;
  ports: Array<{ id: number; port: number; protocol: string; service: string | null }>;
  finding: Finding | null;
  /**
   * One-shot seed used only when `finding === null` (new-finding flow).
   * Powers the "+ Add as finding" buttons on KB known_vulns and
   * searchsploit hits in PortDetailPane. Editing an existing finding
   * always wins over the prefill — the prefill is ignored when `finding`
   * is non-null.
   */
  prefill?: {
    title: string;
    severity: Severity;
    cve: string | null;
    description: string;
    portId: number | null;
  } | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(
    finding?.title ?? prefill?.title ?? "",
  );
  const [description, setDescription] = useState(
    finding?.description ?? prefill?.description ?? "",
  );
  const [severity, setSeverity] = useState<Severity>(
    (finding?.severity as Severity) ?? prefill?.severity ?? "medium",
  );
  const [cve, setCve] = useState(finding?.cve ?? prefill?.cve ?? "");
  const [portId, setPortId] = useState<number | null>(
    finding?.port_id ?? prefill?.portId ?? null,
  );
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save() {
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    setSaving(true);
    try {
      const url =
        finding === null
          ? `/api/engagements/${engagementId}/findings`
          : `/api/engagements/${engagementId}/findings/${finding.id}`;
      const res = await fetch(url, {
        method: finding === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description,
          severity,
          cve: cve.trim() || null,
          portId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Save failed.");
        return;
      }
      toast.success(finding === null ? "Finding added" : "Finding updated");
      router.refresh();
      onClose();
    } catch {
      toast.error("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 65,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        display: "grid",
        placeItems: "start center",
        paddingTop: 80,
      }}
    >
      <div
        style={{
          width: 520,
          background: "var(--bg-2)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div
          className="flex items-center"
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            className="uppercase tracking-[0.08em] font-medium"
            style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
          >
            {finding === null ? "New finding" : "Edit finding"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              marginLeft: "auto",
              width: 22,
              height: 22,
              display: "grid",
              placeItems: "center",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--bg-3)",
              color: "var(--fg-muted)",
              cursor: "pointer",
            }}
          >
            <X size={12} />
          </button>
        </div>

        <div
          className="flex flex-col gap-3"
          style={{ padding: "14px" }}
        >
          <Field label="Title">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Anonymous FTP login allowed"
              style={inputStyle}
            />
          </Field>
          <div className="flex gap-3">
            <Field label="Severity" style={{ flex: 1 }}>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
                style={inputStyle}
              >
                <option value="info">info</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </Field>
            <Field label="Scope" style={{ flex: 1 }}>
              <select
                value={portId ?? ""}
                onChange={(e) =>
                  setPortId(e.target.value === "" ? null : Number(e.target.value))
                }
                style={inputStyle}
              >
                <option value="">engagement-level</option>
                {ports.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.port}/{p.protocol}
                    {p.service ? ` · ${p.service}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="CVE (optional)">
            <input
              value={cve}
              onChange={(e) => setCve(e.target.value)}
              placeholder="CVE-2017-7494, CVE-2020-1472"
              style={inputStyle}
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you find? How to reproduce? Impact?"
              rows={5}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-ui)" }}
            />
          </Field>
        </div>

        <div
          className="flex items-center gap-2"
          style={{
            padding: "10px 14px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-1)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={btnSecondary(saving)}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !title.trim()}
            style={{ ...btnPrimary(saving || !title.trim()), marginLeft: "auto" }}
          >
            {saving ? "Saving…" : finding === null ? "Add finding" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  background: "var(--bg-1)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  color: "var(--fg)",
  fontSize: 13,
  outline: "none",
};

function btnSecondary(disabled: boolean): React.CSSProperties {
  return {
    height: 30,
    padding: "0 12px",
    borderRadius: 5,
    background: "var(--bg-2)",
    color: "var(--fg)",
    border: "1px solid var(--border)",
    fontSize: 12.5,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    height: 30,
    padding: "0 14px",
    borderRadius: 5,
    background: "var(--accent)",
    color: "#05170d",
    border: "1px solid var(--accent)",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <div
        className="uppercase tracking-[0.08em] font-medium"
        style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginBottom: 4 }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * v1.4.0 #5: render a finding as a self-contained Markdown block. Used
 * by the per-row "copy md" button and the Cmd+Shift+C keyboard shortcut.
 * Format chosen so the block can be pasted straight into a Notion /
 * Obsidian / SysReptor draft without further formatting.
 */
export function findingToMarkdown(
  finding: Finding,
  port?: {
    port: number;
    protocol: string;
    service: string | null;
    hostIp?: string | null;
    hostHostname?: string | null;
  } | null,
): string {
  const lines: string[] = [];
  lines.push(`### ${finding.severity}: ${finding.title}`);
  lines.push("");
  if (finding.description?.trim()) {
    lines.push(finding.description.trim());
    lines.push("");
  }
  if (finding.cve) lines.push(`_CVE:_ ${finding.cve}`);
  if (port) {
    const host = port.hostHostname ?? port.hostIp;
    const target = host ? `${host}:${port.port}` : `${port.port}`;
    lines.push(`_Port:_ ${target}/${port.protocol}`);
  } else if (finding.port_id == null) {
    lines.push(`_Scope:_ engagement-level`);
  }
  return lines.join("\n").trimEnd() + "\n";
}
