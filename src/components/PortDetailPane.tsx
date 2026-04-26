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
import { CopyButton } from "@/components/CopyButton";
import { ChecklistItem } from "@/components/ChecklistItem";
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
  kbCommands: Array<{ label: string; command: string }>;
  kbChecks: Array<{ key: string; label: string }>;
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
                <CommandCard key={i} label={cmd.label} command={cmd.command} />
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
          >
            <div className="flex flex-col" style={{ gap: 2 }}>
              {kbChecks.map((check) => (
                <ChecklistItem
                  key={check.key}
                  engagementId={engagementId}
                  portId={portId}
                  checkKey={check.key}
                  initialChecked={checkMap.get(check.key) === true}
                  label={check.label}
                />
              ))}
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

function CommandCard({ label, command }: { label: string; command: string }) {
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
        className="flex items-center"
        style={{
          padding: "4px 10px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-1)",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{label}</span>
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

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
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

const exploitCache = new Map<string, ExploitHit[]>();

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
  const [hits, setHits] = useState<ExploitHit[] | null>(cached);
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
        return;
      }
      const next = Array.isArray(body.hits)
        ? (body.hits as ExploitHit[])
        : [];
      exploitCache.set(query, next);
      setHits(next);
    } catch (err) {
      setError((err as Error).message ?? "Lookup failed.");
      setHits(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section
      label="Exploits"
      count={hits === null ? undefined : hits.length}
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

        {hits !== null && hits.length === 0 && !loading && (
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
