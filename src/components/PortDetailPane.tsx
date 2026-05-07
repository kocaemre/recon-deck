"use client";

/**
 * PortDetailPane — body content for a single selected port (heatmap layout).
 *
 * Left column: Commands (per-command card with $ prefix + copy button),
 *              NSE Script Output (if any), AutoRecon Files (if any),
 *              AutoRecon Commands (if any).
 * Right column: Checklist (custom rows), Notes, Resources.
 *
 * Preserves the data contract of the old PortCard: same props, same server
 * actions, same optimistic UI. Only the rendering surface changed.
 */

import { useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/CopyButton";
import { ChecklistItem } from "@/components/ChecklistItem";
import { BulkCheckButton } from "@/components/BulkCheckButton";
import { NotesField } from "@/components/NotesField";
import { StructuredScriptOutput } from "@/components/StructuredScriptOutput";
import { EvidencePane } from "@/components/EvidencePane";
import { ExternalLink, Plus, Search as SearchIcon } from "lucide-react";
import type { ScriptElem, ScriptTable } from "@/lib/parser/types";
import type { PortEvidence } from "@/lib/db/schema";
import { useUIStore } from "@/lib/store";

type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

/**
 * Map a KB risk tier to the finding severity used when staging a prefill
 * from a known_vuln "+ Add as finding" click. Mirrors the canonical
 * severity ladder; defaults unrecognised values to "medium" so we never
 * stage a prefill with an invalid severity.
 */
function riskToSeverity(risk: string | undefined): FindingSeverity {
  switch (risk) {
    case "critical":
    case "high":
    case "medium":
    case "low":
    case "info":
      return risk;
    default:
      return "medium";
  }
}

/**
 * Try to extract the first CVE-NNNN-NNNNN identifier from a free-text
 * note. Used when prefilling a finding from a KB known_vuln so the CVE
 * field is populated automatically when the KB author embedded it in
 * the note string. Returns null when no match — callers should leave
 * the CVE field blank in that case rather than guess.
 */
function extractCve(text: string): string | null {
  const m = text.match(/CVE-\d{4}-\d{4,7}/i);
  return m ? m[0].toUpperCase() : null;
}

interface ScriptData {
  id: number;
  script_id: string;
  output: string;
  structured?: Array<ScriptElem | ScriptTable>;
}

interface PortDetailPaneProps {
  engagementId: number;
  portId: number;
  scripts: ScriptData[];
  checks: Array<{ check_key: string; checked: boolean }>;
  notes: { body: string } | null;
  kbCommands: Array<{
    label: string;
    command: string;
    /** v2.4.0 P5 (#30): conditional ids that modified this command's
     *  template (append + replace contributors). Surfaces the "+detected: X"
     *  badge next to the command label so operators understand why the
     *  rendered template differs from the baseline KB. */
    conditionalIds?: string[];
  }>;
  kbChecks: Array<{
    key: string;
    label: string;
    /** v2.4.0 P5 (#30): provenance for the checklist row.
     *  - "baseline" → from KB entry's checks[] (default when omitted)
     *  - "conditional" → added by a fired conditional this render
     *  - "orphan" → previously added by a conditional that's no longer
     *    matching, but the operator's toggle state survived in the DB */
    source?: "baseline" | "conditional" | "orphan";
    /** Set when source ∈ {"conditional", "orphan"}. Drives the badge label. */
    conditionalId?: string;
  }>;
  kbResources: Array<{ title: string; url: string }>;
  arFiles?: Array<{ filename: string; content: string; encoding?: "utf8" | "base64" }>;
  arCommands?: Array<{ label: string; command: string }>;
  /** v2/P0-D: user-defined snippets matching this (service, port). */
  userCommands?: Array<{ label: string; command: string }>;
  /** v2: CPE identifiers from nmap `<cpe>` (e.g. cpe:/a:apache:http_server:2.4.52). */
  cpe?: string[];
  /** v2: per-port evidence rows (screenshots / attachments). */
  evidence?: PortEvidence[];
  /**
   * P2: searchsploit query — typically `${product} ${version}` for the
   * port (or just `service` when product is unknown). Empty/undefined
   * suppresses the Exploits section entirely. The button-driven lookup
   * fires only when the operator clicks; results aren't cached across
   * port switches yet.
   */
  exploitQuery?: string;
  /**
   * P2 follow-up: KB known_vulns auto-matched against the port's
   * product+version. Empty array → section suppressed.
   */
  knownVulns?: Array<{ match: string; note: string; link: string }>;
  /**
   * KB risk tier for this port — drives the severity heuristic when
   * staging a finding prefill from a known_vuln "+ Add as finding"
   * click. Falls back to "medium" when undefined.
   */
  risk?: string;
  /**
   * v1.4.0 #10: KB-declared default credentials. Empty/undefined
   * suppresses the Default Credentials panel. Each row gets a
   * "Generate hydra command" button that copies a hydra invocation
   * to the clipboard (host + service inferred from `serviceName` /
   * `servicePortLabel`).
   */
  defaultCreds?: Array<{ username: string; password: string; notes: string | null }>;
  /**
   * v1.4.0 #10: passed to the hydra-command generator so the snippet
   * can interpolate the host:port pair without us re-walking the
   * engagement tree from inside the pane.
   */
  servicePortLabel?: string;
  serviceName?: string | null;
  /** v1.4.0 #10: host label for the hydra command (hostname or IP). */
  targetHost?: string;
}

export function PortDetailPane({
  engagementId,
  portId,
  scripts,
  checks,
  notes,
  kbCommands,
  kbChecks,
  kbResources,
  arFiles = [],
  arCommands = [],
  userCommands = [],
  cpe,
  evidence = [],
  exploitQuery,
  knownVulns = [],
  risk,
  defaultCreds = [],
  servicePortLabel,
  serviceName,
  targetHost,
}: PortDetailPaneProps) {
  const checkMap = new Map(checks.map((c) => [c.check_key, c.checked]));
  const setFindingPrefill = useUIStore((s) => s.setFindingPrefill);

  // Stage a finding prefill from a KB known_vuln. Severity follows the
  // port's KB risk tier (critical/high/medium/low/info); description
  // includes the original note and the reference link so the operator
  // doesn't lose context even if they discard the link in the modal.
  function addVulnAsFinding(v: { match: string; note: string; link: string }) {
    setFindingPrefill({
      title: v.note,
      severity: riskToSeverity(risk),
      cve: extractCve(v.note),
      description: `${v.note}\n\nMatched: ${v.match}\nReference: ${v.link}`,
      portId,
    });
  }

  return (
    <div
      className="grid gap-[22px]"
      style={{
        gridTemplateColumns: "1.1fr 1fr",
        padding: "14px 24px 18px",
      }}
    >
      {/* Left column */}
      <div className="flex flex-col gap-4">
        {knownVulns.length > 0 && (
          <Section label="Known Vulnerabilities" count={knownVulns.length}>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {knownVulns.map((v, i) => (
                <li
                  key={i}
                  style={{
                    padding: "6px 8px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)",
                    fontSize: 12,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="mono"
                      style={{
                        fontSize: 9.5,
                        letterSpacing: "0.06em",
                        padding: "1px 5px",
                        borderRadius: 3,
                        background: "transparent",
                        border: "1px solid var(--risk-high)",
                        color: "var(--risk-high)",
                      }}
                      title={`KB match string: ${v.match}`}
                    >
                      {v.match}
                    </span>
                    <span style={{ color: "var(--fg)", flex: 1, minWidth: 0 }}>
                      {v.note}
                    </span>
                    <a
                      href={v.link}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: "var(--accent)",
                        fontSize: 11,
                        textDecoration: "none",
                      }}
                      title={safeHostname(v.link) || "external link"}
                    >
                      ref ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => addVulnAsFinding(v)}
                      title="Add as finding"
                      aria-label="Add as finding"
                      style={addFindingBtn}
                    >
                      <Plus size={10} />
                      finding
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {defaultCreds.length > 0 && (
          <DefaultCredsSection
            creds={defaultCreds}
            host={targetHost ?? null}
            servicePortLabel={servicePortLabel ?? null}
            serviceName={serviceName ?? null}
          />
        )}

        {exploitQuery && (
          <ExploitsSection
            key={`exploits-${exploitQuery}`}
            query={exploitQuery}
            portId={portId}
          />
        )}

        {userCommands.length > 0 && (
          <Section label="My Commands" count={userCommands.length}>
            <div className="flex flex-col gap-2">
              {userCommands.map((cmd, i) => (
                <CommandCard key={i} label={cmd.label} command={cmd.command} />
              ))}
            </div>
          </Section>
        )}

        {kbCommands.length > 0 && (
          <Section label="Commands" count={kbCommands.length}>
            <div className="flex flex-col gap-2">
              {kbCommands.map((cmd, i) => (
                <CommandCard
                  key={i}
                  label={cmd.label}
                  command={cmd.command}
                  conditionalIds={cmd.conditionalIds}
                />
              ))}
            </div>
          </Section>
        )}

        {scripts.length > 0 && (
          <Section label="NSE Script Output" count={scripts.length}>
            <div className="flex flex-col gap-2">
              {scripts.map((s) => (
                <div
                  key={s.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 5,
                    background: "var(--code-surface)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    className="mono"
                    style={{
                      padding: "4px 10px",
                      borderBottom: "1px solid var(--border)",
                      background: "var(--bg-1)",
                      fontSize: 11,
                      color: "var(--fg-muted)",
                    }}
                  >
                    {s.script_id}
                  </div>
                  <div style={{ padding: 10 }}>
                    <StructuredScriptOutput script={s} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {arFiles.length > 0 && (
          <Section label="AutoRecon Files" count={arFiles.length}>
            <div className="flex flex-col gap-3">
              {arFiles.map((f, i) => (
                <div key={i}>
                  <div
                    className="mono"
                    style={{ fontSize: 11, color: "var(--fg)", fontWeight: 600 }}
                  >
                    {f.filename}
                  </div>
                  <pre
                    className="mono"
                    style={{
                      margin: "4px 0 0",
                      padding: 10,
                      maxHeight: 384,
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      borderRadius: 5,
                      background: "var(--code-surface)",
                      border: "1px solid var(--border)",
                      fontSize: 11.5,
                      color: "var(--fg-muted)",
                    }}
                  >
                    {f.content}
                  </pre>
                </div>
              ))}
            </div>
          </Section>
        )}

        {arCommands.length > 0 && (
          <Section label="AutoRecon Commands" count={arCommands.length}>
            <div className="flex flex-col gap-2">
              {arCommands.map((cmd, i) => (
                <CommandCard key={i} label={cmd.label} command={cmd.command} />
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-4">
        {cpe && cpe.length > 0 && (
          <Section label="CPE" count={cpe.length}>
            <ul
              className="mono"
              style={{
                margin: 0,
                paddingLeft: 0,
                listStyle: "none",
                fontSize: 11.5,
                color: "var(--fg-muted)",
                lineHeight: 1.6,
              }}
            >
              {cpe.map((c, i) => (
                <li key={i} className="truncate" title={c}>
                  {c}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {kbChecks.length > 0 && (
          <Section
            label={`Checklist · ${kbChecks.filter((c) => checkMap.get(c.key)).length}/${kbChecks.length}`}
            action={
              <BulkCheckButton
                engagementId={engagementId}
                portId={portId}
                checkKeys={kbChecks.map((c) => c.key)}
                checkedCount={
                  kbChecks.filter((c) => checkMap.get(c.key)).length
                }
              />
            }
          >
            <div className="flex flex-col" style={{ gap: 2 }}>
              {(() => {
                // v2.4.0 P5 (#30): group checks by provenance so the
                // baseline list reads cleanly and conditional / orphan
                // rows render below a subtle separator. Within each
                // group rows preserve the order the resolver emitted.
                const baseline = kbChecks.filter(
                  (c) => !c.source || c.source === "baseline",
                );
                const conditional = kbChecks.filter(
                  (c) => c.source === "conditional",
                );
                const orphan = kbChecks.filter((c) => c.source === "orphan");
                return (
                  <>
                    {baseline.map((check) => (
                      <ChecklistItem
                        key={check.key}
                        engagementId={engagementId}
                        portId={portId}
                        checkKey={check.key}
                        initialChecked={checkMap.get(check.key) === true}
                        label={check.label}
                      />
                    ))}
                    {conditional.length > 0 && (
                      <ConditionalGroupHeader label="Context-specific" />
                    )}
                    {conditional.map((check) => (
                      <ConditionalChecklistRow
                        key={check.key}
                        engagementId={engagementId}
                        portId={portId}
                        check={check}
                        initialChecked={checkMap.get(check.key) === true}
                      />
                    ))}
                    {orphan.length > 0 && (
                      <ConditionalGroupHeader
                        label="Orphaned · signal no longer present"
                        muted
                      />
                    )}
                    {orphan.map((check) => (
                      <ConditionalChecklistRow
                        key={check.key}
                        engagementId={engagementId}
                        portId={portId}
                        check={check}
                        initialChecked={checkMap.get(check.key) === true}
                        orphan
                      />
                    ))}
                  </>
                );
              })()}
            </div>
          </Section>
        )}

        <Section label="Notes">
          <NotesField
            engagementId={engagementId}
            portId={portId}
            initialBody={notes?.body ?? ""}
          />
        </Section>

        <Section label="Evidence" count={evidence.length || undefined}>
          <EvidencePane
            engagementId={engagementId}
            portId={portId}
            evidence={evidence}
          />
        </Section>

        {kbResources.length > 0 && (
          <Section label="Resources" count={kbResources.length}>
            <div className="flex flex-col gap-1">
              {kbResources.map((r, i) => (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5"
                  style={{
                    color: "var(--fg-muted)",
                    fontSize: 12,
                    textDecoration: "none",
                    padding: "4px 2px",
                  }}
                >
                  <ExternalLink
                    size={12}
                    style={{ color: "var(--fg-subtle)", flexShrink: 0 }}
                  />
                  <span style={{ color: "var(--accent)", flexShrink: 0 }}>
                    {r.title}
                  </span>
                  <span
                    className="mono ml-auto truncate"
                    style={{ color: "var(--fg-faint)", fontSize: 11 }}
                  >
                    {safeHostname(r.url)}
                  </span>
                </a>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function CommandCard({
  label,
  command,
  conditionalIds,
}: {
  label: string;
  command: string;
  conditionalIds?: string[];
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 5,
        background: "var(--code-surface)",
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center gap-2"
        style={{
          padding: "4px 10px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-1)",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{label}</span>
        {conditionalIds && conditionalIds.length > 0 && (
          <ProvenanceBadge ids={conditionalIds} />
        )}
        <span className="ml-auto">
          <CopyButton text={command} label={command} />
        </span>
      </div>
      <div
        className="mono"
        style={{
          padding: "8px 12px",
          fontSize: 12,
          color: "var(--fg)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        <span style={{ color: "var(--accent)" }}>$ </span>
        {command}
      </div>
    </div>
  );
}

/**
 * v2.4.0 P5 (#30): pill rendered next to a check label or command
 * label that came from a fired conditional group. The conditional ids
 * are concatenated with `+` so multiple-rule contributions read at a
 * glance ("+php-detected +wordpress-detected"). Hover surfaces the
 * raw ids via the title attribute — operators inspecting "why is this
 * here?" see exactly which rules fired.
 *
 * `muted` (orphan state) dims the pill so it reads as a "this used to
 * apply" hint rather than active context.
 */
function ProvenanceBadge({
  ids,
  muted = false,
}: {
  ids: ReadonlyArray<string>;
  muted?: boolean;
}) {
  const text = ids.map((id) => `+${id}`).join(" ");
  return (
    <span
      className="mono"
      title={`Triggered by conditional${ids.length === 1 ? "" : "s"}: ${ids.join(", ")}`}
      style={{
        fontSize: 9.5,
        letterSpacing: "0.04em",
        padding: "1px 6px",
        borderRadius: 999,
        background: muted ? "transparent" : "var(--accent-bg)",
        border: `1px solid ${muted ? "var(--border)" : "var(--accent-border)"}`,
        color: muted ? "var(--fg-faint)" : "var(--accent)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

/**
 * v2.4.0 P5 (#30): subtle separator that introduces the conditional /
 * orphan groups within the checklist section. Keeps the baseline list
 * scannable while still grouping context-specific rows below.
 */
function ConditionalGroupHeader({
  label,
  muted = false,
}: {
  label: string;
  muted?: boolean;
}) {
  return (
    <div
      className="mono uppercase tracking-[0.06em]"
      style={{
        fontSize: 9.5,
        marginTop: 6,
        paddingTop: 6,
        paddingLeft: 4,
        borderTop: "1px dashed var(--border-subtle)",
        color: muted ? "var(--fg-faint)" : "var(--fg-subtle)",
      }}
    >
      {label}
    </div>
  );
}

/**
 * v2.4.0 P5 (#30): wraps a ChecklistItem with a provenance badge to
 * its right. Orphan rows dim the label color via the badge's `muted`
 * flag and an opacity wrapper so the operator's prior toggle state is
 * still visible but visually deprioritised.
 */
function ConditionalChecklistRow({
  engagementId,
  portId,
  check,
  initialChecked,
  orphan = false,
}: {
  engagementId: number;
  portId: number;
  check: { key: string; label: string; conditionalId?: string };
  initialChecked: boolean;
  orphan?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2"
      style={{ opacity: orphan ? 0.65 : 1 }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <ChecklistItem
          engagementId={engagementId}
          portId={portId}
          checkKey={check.key}
          initialChecked={initialChecked}
          label={check.label}
        />
      </div>
      {check.conditionalId && (
        <ProvenanceBadge ids={[check.conditionalId]} muted={orphan} />
      )}
    </div>
  );
}

function Section({
  label,
  count,
  action,
  children,
}: {
  label: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span
          className="uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          {label}
        </span>
        {count !== undefined && (
          <span
            className="mono"
            style={{ fontSize: 10.5, color: "var(--fg-faint)" }}
          >
            {count}
          </span>
        )}
        <div
          className="flex-1"
          style={{
            height: 1,
            background: "var(--border-subtle)",
            marginLeft: 6,
          }}
        />
        {action}
      </div>
      {children}
    </section>
  );
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * v1.4.0 #10: surface KB-declared default credentials with a clipboard
 * helper that emits a hydra invocation per row. Hydra service mapping is
 * a best-effort lookup against common nmap services — operators can
 * still tweak the snippet in their terminal before running it.
 */
const HYDRA_SERVICE_MAP: Record<string, string> = {
  ftp: "ftp",
  ssh: "ssh",
  telnet: "telnet",
  smtp: "smtp",
  http: "http-get",
  https: "https-get",
  pop3: "pop3",
  imap: "imap",
  rdp: "rdp",
  smb: "smb",
  "microsoft-ds": "smb",
  netbios: "smb",
  "netbios-ssn": "smb",
  vnc: "vnc",
  mysql: "mysql",
  postgresql: "postgres",
  postgres: "postgres",
  mssql: "mssql",
  redis: "redis",
};

function hydraServiceFor(serviceName: string | null): string | null {
  if (!serviceName) return null;
  return HYDRA_SERVICE_MAP[serviceName.toLowerCase()] ?? null;
}

function DefaultCredsSection({
  creds,
  host,
  servicePortLabel,
  serviceName,
}: {
  creds: Array<{ username: string; password: string; notes: string | null }>;
  host: string | null;
  servicePortLabel: string | null;
  serviceName: string | null;
}) {
  const hydraService = hydraServiceFor(serviceName);
  const target = host ?? "<host>";
  const port = servicePortLabel?.split("/")[0] ?? "<port>";

  function buildHydraCommand(user: string, pass: string): string {
    if (hydraService) {
      return `hydra -l ${user} -p ${pass} -s ${port} ${target} ${hydraService}`;
    }
    // Unknown service — emit a generic skeleton so the operator still gets
    // a starting point without having to look up the syntax.
    return `hydra -l ${user} -p ${pass} ${target}:${port} <service>`;
  }

  async function copyHydra(user: string, pass: string) {
    const cmd = buildHydraCommand(user, pass);
    try {
      await navigator.clipboard.writeText(cmd);
      toast.success("hydra command copied");
    } catch {
      toast.error("Clipboard unavailable.");
    }
  }

  return (
    <Section label="Default Credentials" count={creds.length}>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {creds.map((c, i) => (
          <li
            key={i}
            style={{
              padding: "6px 8px",
              borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)",
              fontSize: 12,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="mono"
                style={{
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                  fontSize: 11,
                }}
                title={c.notes ?? undefined}
              >
                {c.username || "<empty>"}
                {" / "}
                {c.password || "<empty>"}
              </span>
              {c.notes && (
                <span
                  style={{
                    color: "var(--fg-subtle)",
                    fontSize: 11,
                    flex: 1,
                    minWidth: 0,
                  }}
                  className="truncate"
                >
                  {c.notes}
                </span>
              )}
              {!c.notes && <span style={{ flex: 1 }} />}
              <button
                type="button"
                onClick={() => copyHydra(c.username, c.password)}
                title={
                  hydraService
                    ? `Copy: hydra -l … -p … -s ${port} ${target} ${hydraService}`
                    : "Service unknown — generic hydra skeleton (edit before running)"
                }
                style={{
                  fontSize: 10.5,
                  padding: "2px 8px",
                  borderRadius: 3,
                  border: "1px solid var(--border)",
                  background: "var(--bg-2)",
                  color: "var(--fg-muted)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                hydra
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * P2: searchsploit-backed exploit lookup. Fires only when the operator
 * clicks "Lookup exploits" — searchsploit shell-out is up to 5 s wall
 * time, too slow for an auto-fire. Per-query results live in a module-
 * level Map so jumping back to the same port (or to another port that
 * happens to share product+version) returns instantly without another
 * subprocess. Cache survives across port switches but resets on full
 * page reload — that's the right TTL for an interactive recon session.
 */
interface ExploitHit {
  id: string;
  title: string;
  type: string;
  platform: string;
  date?: string;
  url?: string;
}

interface ExploitCacheEntry {
  hits: ExploitHit[];
  broaderHits?: ExploitHit[];
  broaderQuery?: string;
}
const exploitCache = new Map<string, ExploitCacheEntry>();

function ExploitsSection({
  query,
  portId,
}: {
  query: string;
  portId: number;
}) {
  const setFindingPrefill = useUIStore((s) => s.setFindingPrefill);
  // P2 follow-up: seed state from the cache so a port switch back into a
  // previously-looked-up product surfaces results without re-hitting
  // searchsploit. Cache key is the verbatim query string (already trimmed
  // by engagement page derivation).
  const cached = exploitCache.get(query) ?? null;
  const [hits, setHits] = useState<ExploitHit[] | null>(cached?.hits ?? null);
  const [broaderHits, setBroaderHits] = useState<ExploitHit[] | null>(
    cached?.broaderHits ?? null,
  );
  const [broaderQuery, setBroaderQuery] = useState<string | null>(
    cached?.broaderQuery ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runLookup() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/exploits/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Lookup failed.");
        setHits(null);
        setBroaderHits(null);
        setBroaderQuery(null);
        return;
      }
      const next = Array.isArray(body.hits)
        ? (body.hits as ExploitHit[])
        : [];
      const broader = Array.isArray(body.broaderHits)
        ? (body.broaderHits as ExploitHit[])
        : null;
      const broaderQ =
        typeof body.broaderQuery === "string" ? body.broaderQuery : null;
      exploitCache.set(query, {
        hits: next,
        broaderHits: broader ?? undefined,
        broaderQuery: broaderQ ?? undefined,
      });
      setHits(next);
      setBroaderHits(broader);
      setBroaderQuery(broaderQ);
    } catch (err) {
      setError((err as Error).message ?? "Lookup failed.");
      setHits(null);
      setBroaderHits(null);
      setBroaderQuery(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section
      label="Exploits"
      count={
        hits === null
          ? undefined
          : hits.length + (broaderHits?.length ?? 0)
      }
    >
      <div className="flex flex-col gap-2">
        {hits === null && !loading && !error && (
          <button
            type="button"
            onClick={runLookup}
            className="mono inline-flex items-center justify-center gap-1.5"
            style={{
              alignSelf: "flex-start",
              height: 26,
              padding: "0 10px",
              borderRadius: 5,
              border: "1px solid var(--border)",
              background: "var(--bg-2)",
              color: "var(--fg-muted)",
              fontSize: 11.5,
              cursor: "pointer",
            }}
            title={`searchsploit -t "${query}"`}
          >
            <SearchIcon size={11} />
            Lookup exploits for{" "}
            <span style={{ color: "var(--accent)" }}>{query}</span>
          </button>
        )}

        {loading && (
          <div
            className="mono"
            style={{ fontSize: 11, color: "var(--fg-subtle)" }}
          >
            Querying searchsploit…
          </div>
        )}

        {error && (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--risk-crit)",
              padding: "6px 8px",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--bg-1)",
            }}
          >
            {error}
          </div>
        )}

        {hits !== null &&
          hits.length === 0 &&
          (!broaderHits || broaderHits.length === 0) &&
          !loading && (
            <div
              className="mono"
              style={{ fontSize: 11, color: "var(--fg-subtle)" }}
            >
              No matches for{" "}
              <span style={{ color: "var(--accent)" }}>{query}</span>.
            </div>
          )}

        {hits !== null && hits.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {hits.map((h) => (
              <li
                key={h.id}
                style={{
                  padding: "6px 8px",
                  borderTop: "1px solid var(--border-subtle)",
                  fontSize: 12,
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="mono uppercase"
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.06em",
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: "var(--bg-3)",
                      border: "1px solid var(--border)",
                      color: "var(--fg-muted)",
                    }}
                    title={`${h.type} · ${h.platform}`}
                  >
                    {h.type}
                  </span>
                  <span style={{ color: "var(--fg)", flex: 1, minWidth: 0 }}>
                    {h.title}
                  </span>
                  {h.url && (
                    <a
                      href={h.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: "var(--accent)",
                        fontSize: 11,
                        textDecoration: "none",
                      }}
                      title="Open exploit-db entry"
                    >
                      EDB-{h.id} ↗
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setFindingPrefill({
                        title: h.title,
                        // searchsploit hits aren't tier-tagged — surface
                        // them as "medium" by default; the operator
                        // adjusts in the modal before saving.
                        severity: "medium",
                        cve: extractCve(h.title),
                        description: `Exploit hit (${h.type} · ${h.platform}) for "${query}"\n\n${h.title}${h.url ? `\n${h.url}` : ""}`,
                        portId,
                      })
                    }
                    title="Add as finding"
                    aria-label="Add as finding"
                    style={addFindingBtn}
                  >
                    <Plus size={10} />
                    finding
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {broaderHits && broaderHits.length > 0 && (
          <div style={{ marginTop: hits && hits.length > 0 ? 10 : 0 }}>
            <div
              className="mono uppercase tracking-[0.06em]"
              style={{
                fontSize: 10,
                color: "var(--fg-subtle)",
                padding: "4px 0",
              }}
              title={`Fallback search ran with "${broaderQuery}" because the versioned query had no hits.`}
            >
              Broader matches · no version filter (
              <span style={{ color: "var(--accent)" }}>{broaderQuery}</span>)
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {broaderHits.map((h) => (
                <li
                  key={`broad-${h.id}`}
                  style={{
                    padding: "6px 8px",
                    borderTop: "1px solid var(--border-subtle)",
                    fontSize: 12,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="mono uppercase"
                      style={{
                        fontSize: 9.5,
                        letterSpacing: "0.06em",
                        padding: "1px 5px",
                        borderRadius: 3,
                        background: "var(--bg-3)",
                        border: "1px solid var(--border)",
                        color: "var(--fg-muted)",
                      }}
                      title={`${h.type} · ${h.platform}`}
                    >
                      {h.type}
                    </span>
                    <span
                      style={{ color: "var(--fg)", flex: 1, minWidth: 0 }}
                    >
                      {h.title}
                    </span>
                    {h.url && (
                      <a
                        href={h.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: "var(--accent)",
                          fontSize: 11,
                          textDecoration: "none",
                        }}
                        title="Open exploit-db entry"
                      >
                        EDB-{h.id} ↗
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setFindingPrefill({
                          title: h.title,
                          severity: "medium",
                          cve: extractCve(h.title),
                          description: `Exploit hit (${h.type} · ${h.platform}) for broader query "${broaderQuery}" (no version filter)\n\n${h.title}${h.url ? `\n${h.url}` : ""}`,
                          portId,
                        })
                      }
                      title="Add as finding"
                      aria-label="Add as finding"
                      style={addFindingBtn}
                    >
                      <Plus size={10} />
                      finding
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}

const addFindingBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  padding: "1px 6px",
  borderRadius: 3,
  border: "1px solid var(--border)",
  background: "var(--bg-2)",
  color: "var(--fg-muted)",
  fontSize: 10.5,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
