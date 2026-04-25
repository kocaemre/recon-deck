"use client";

/**
 * EngagementExtras — collapsible panels for engagement-level v2 enrichment data.
 *
 * Renders sections only when their data is present. Sections:
 *   - OS Detection (osmatches + osclasses)
 *   - Traceroute (hops)
 *   - Pre-scan / Post-scan scripts (NSE)
 *   - AutoRecon Artifacts (loot, report, screenshots, exploit, service-nmap-xml,
 *     commands log) — patterns/errors are surfaced through the warnings banner.
 *
 * All sections are <details>/<summary> (native, no client state needed for
 * collapse). Screenshots render as inline base64 images.
 */

import type {
  OsMatch,
  Hop,
  ScriptOutput,
} from "@/lib/parser/types";

export type ExtrasArtifact = {
  kind:
    | "loot"
    | "report"
    | "screenshot"
    | "patterns"
    | "errors"
    | "commands"
    | "exploit"
    | "service-nmap-xml";
  filename: string;
  /** UTF-8 string for text artifacts; base64 for screenshots. */
  content: string;
  encoding: "utf8" | "base64";
};

interface EngagementExtrasProps {
  os?: {
    matches?: OsMatch[];
    fingerprint?: string;
  };
  traceroute?: { proto?: string; port?: number; hops: Hop[] };
  preScripts?: ScriptOutput[];
  postScripts?: ScriptOutput[];
  artifacts?: ExtrasArtifact[];
}

export function EngagementExtras({
  os,
  traceroute,
  preScripts,
  postScripts,
  artifacts,
}: EngagementExtrasProps) {
  const hasOs =
    (os?.matches && os.matches.length > 0) || os?.fingerprint;
  const hasTrace = traceroute && traceroute.hops.length > 0;
  const hasPrePost =
    (preScripts && preScripts.length > 0) ||
    (postScripts && postScripts.length > 0);
  const hasArtifacts = artifacts && artifacts.length > 0;

  if (!hasOs && !hasTrace && !hasPrePost && !hasArtifacts) {
    return null;
  }

  const screenshots =
    artifacts?.filter((a) => a.kind === "screenshot") ?? [];
  const loot = artifacts?.filter((a) => a.kind === "loot") ?? [];
  const report = artifacts?.filter((a) => a.kind === "report") ?? [];
  const exploit = artifacts?.filter((a) => a.kind === "exploit") ?? [];
  const serviceXml =
    artifacts?.filter((a) => a.kind === "service-nmap-xml") ?? [];
  const cmdLog = artifacts?.filter((a) => a.kind === "commands") ?? [];

  return (
    <div
      className="px-6 py-4 flex flex-col gap-3"
      style={{ borderTop: "1px solid var(--border)", background: "var(--bg-0)" }}
    >
      {hasOs && (
        <Panel title="OS Detection" count={os?.matches?.length ?? 0}>
          {os?.matches && os.matches.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {os.matches.map((m, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2"
                  style={{
                    padding: "6px 0",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                  {m.accuracy !== undefined && (
                    <span
                      className="mono"
                      style={{ fontSize: 11, color: "var(--accent)" }}
                    >
                      {m.accuracy}%
                    </span>
                  )}
                  {m.classes && m.classes.length > 0 && (
                    <span
                      className="mono"
                      style={{
                        fontSize: 11,
                        color: "var(--fg-subtle)",
                        marginLeft: "auto",
                      }}
                    >
                      {m.classes
                        .map((c) =>
                          [c.vendor, c.family, c.gen, c.type]
                            .filter(Boolean)
                            .join(" / "),
                        )
                        .join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {os?.fingerprint && (
            <details style={{ marginTop: 8 }}>
              <summary
                className="uppercase tracking-[0.08em] font-medium"
                style={{
                  fontSize: 10.5,
                  color: "var(--fg-subtle)",
                  cursor: "pointer",
                }}
              >
                TCP/IP fingerprint
              </summary>
              <pre
                className="mono"
                style={{
                  margin: "6px 0 0",
                  padding: 8,
                  background: "var(--code-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  fontSize: 11,
                  color: "var(--fg-muted)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {os.fingerprint}
              </pre>
            </details>
          )}
        </Panel>
      )}

      {hasTrace && traceroute && (
        <Panel title="Traceroute" count={traceroute.hops.length}>
          <div
            className="mono"
            style={{ fontSize: 11.5, color: "var(--fg-muted)" }}
          >
            {traceroute.proto && (
              <div style={{ marginBottom: 6, color: "var(--fg-subtle)" }}>
                proto: {traceroute.proto}
                {traceroute.port !== undefined && ` · port: ${traceroute.port}`}
              </div>
            )}
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {traceroute.hops.map((h, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3"
                  style={{ padding: "3px 0" }}
                >
                  <span
                    style={{
                      width: 32,
                      color: "var(--fg-faint)",
                      textAlign: "right",
                    }}
                  >
                    {h.ttl}
                  </span>
                  <span style={{ color: "var(--fg)" }}>{h.ipaddr}</span>
                  {h.host && (
                    <span style={{ color: "var(--fg-subtle)" }}>{h.host}</span>
                  )}
                  {h.rtt !== undefined && (
                    <span style={{ marginLeft: "auto", color: "var(--fg-faint)" }}>
                      {h.rtt} ms
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      )}

      {hasPrePost && (
        <Panel
          title="Pre / Post Scan Scripts"
          count={(preScripts?.length ?? 0) + (postScripts?.length ?? 0)}
        >
          {preScripts?.map((s, i) => (
            <ScriptBlock key={`pre-${i}`} label={`pre · ${s.id}`} body={s.output} />
          ))}
          {postScripts?.map((s, i) => (
            <ScriptBlock key={`post-${i}`} label={`post · ${s.id}`} body={s.output} />
          ))}
        </Panel>
      )}

      {screenshots.length > 0 && (
        <Panel title="Screenshots" count={screenshots.length}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 8,
            }}
          >
            {screenshots.map((s, i) => {
              const ext = s.filename.match(/\.(\w+)$/)?.[1]?.toLowerCase();
              const mime =
                ext === "jpg" || ext === "jpeg"
                  ? "image/jpeg"
                  : ext === "png"
                    ? "image/png"
                    : ext === "gif"
                      ? "image/gif"
                      : ext === "webp"
                        ? "image/webp"
                        : "image/png";
              return (
                <a
                  key={i}
                  href={`data:${mime};base64,${s.content}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.filename}
                  style={{
                    display: "block",
                    border: "1px solid var(--border)",
                    borderRadius: 5,
                    overflow: "hidden",
                    background: "var(--bg-2)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:${mime};base64,${s.content}`}
                    alt={s.filename}
                    style={{ width: "100%", display: "block" }}
                  />
                  <div
                    className="mono truncate"
                    style={{
                      padding: "4px 8px",
                      fontSize: 10.5,
                      color: "var(--fg-subtle)",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    {s.filename.split("/").pop()}
                  </div>
                </a>
              );
            })}
          </div>
        </Panel>
      )}

      {loot.length > 0 && (
        <Panel title="Loot" count={loot.length}>
          {loot.map((a, i) => (
            <ArtifactFile key={i} a={a} />
          ))}
        </Panel>
      )}

      {report.length > 0 && (
        <Panel title="Report (operator notes)" count={report.length}>
          {report.map((a, i) => (
            <ArtifactFile key={i} a={a} />
          ))}
        </Panel>
      )}

      {exploit.length > 0 && (
        <Panel title="Exploit hints" count={exploit.length}>
          {exploit.map((a, i) => (
            <ArtifactFile key={i} a={a} />
          ))}
        </Panel>
      )}

      {serviceXml.length > 0 && (
        <Panel title="Per-service nmap XML" count={serviceXml.length}>
          {serviceXml.map((a, i) => (
            <ArtifactFile key={i} a={a} compact />
          ))}
        </Panel>
      )}

      {cmdLog.length > 0 && (
        <Panel title="AutoRecon command log" count={cmdLog.length}>
          {cmdLog.map((a, i) => (
            <ArtifactFile key={i} a={a} />
          ))}
        </Panel>
      )}
    </div>
  );
}

/* ---------------- helpers ---------------- */

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <details
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        background: "var(--bg-1)",
        padding: "8px 12px",
      }}
    >
      <summary
        className="flex items-center gap-2"
        style={{ cursor: "pointer", listStyle: "none" }}
      >
        <span
          className="uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          {title}
        </span>
        {count !== undefined && (
          <span
            className="mono"
            style={{ fontSize: 10.5, color: "var(--fg-faint)" }}
          >
            {count}
          </span>
        )}
        <span
          className="mono"
          style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-subtle)" }}
        >
          ▾
        </span>
      </summary>
      <div style={{ marginTop: 10 }}>{children}</div>
    </details>
  );
}

function ScriptBlock({ label, body }: { label: string; body: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        className="mono"
        style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 4 }}
      >
        {label}
      </div>
      <pre
        className="mono"
        style={{
          margin: 0,
          padding: 8,
          background: "var(--code-surface)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          fontSize: 11.5,
          color: "var(--fg-muted)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {body}
      </pre>
    </div>
  );
}

function ArtifactFile({
  a,
  compact = false,
}: {
  a: ExtrasArtifact;
  compact?: boolean;
}) {
  return (
    <details style={{ marginBottom: 6 }}>
      <summary
        className="mono"
        style={{
          cursor: "pointer",
          fontSize: 11.5,
          color: "var(--fg)",
          padding: "4px 0",
        }}
      >
        {a.filename}
      </summary>
      {!compact && (
        <pre
          className="mono"
          style={{
            margin: "6px 0 0",
            padding: 8,
            maxHeight: 300,
            overflowY: "auto",
            background: "var(--code-surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            fontSize: 11.5,
            color: "var(--fg-muted)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {a.content}
        </pre>
      )}
    </details>
  );
}
