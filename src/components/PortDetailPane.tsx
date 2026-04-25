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

import { CopyButton } from "@/components/CopyButton";
import { ChecklistItem } from "@/components/ChecklistItem";
import { NotesField } from "@/components/NotesField";
import { StructuredScriptOutput } from "@/components/StructuredScriptOutput";
import { EvidencePane } from "@/components/EvidencePane";
import { ExternalLink } from "lucide-react";
import type { ScriptElem, ScriptTable } from "@/lib/parser/types";
import type { PortEvidence } from "@/lib/db/schema";

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
}: PortDetailPaneProps) {
  const checkMap = new Map(checks.map((c) => [c.check_key, c.checked]));

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
