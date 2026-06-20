"use client";

/**
 * AiContextPreview — collapsible "what gets sent" disclosure for the AI panels.
 *
 * Privacy affordance (P5): before trusting a cloud provider with scan data, an
 * operator can expand this to see exactly what leaves the machine — the port
 * identity, the NSE/scan output, and (for Suggest) the baseline KB commands.
 * Shown for every provider; the wording leans on the cloud/local distinction.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface AiContextView {
  port: number;
  protocol?: string | null;
  service?: string | null;
  version?: string | null;
  scanOutput: string;
  kbCommands?: Array<{ label: string; command: string }>;
}

export function AiContextPreview({
  context,
  cloud,
}: {
  context: AiContextView;
  cloud: boolean;
}) {
  const [open, setOpen] = useState(false);

  const portLine = [
    `${context.port}/${context.protocol ?? "tcp"}`,
    context.service ?? null,
    context.version ?? null,
  ]
    .filter(Boolean)
    .join(" ");

  const scan = (context.scanOutput ?? "").trim();
  const kb = context.kbCommands ?? [];

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 4px",
          marginLeft: -4,
          background: "none",
          border: "none",
          color: "var(--fg-subtle)",
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {cloud ? "What gets sent to the provider" : "What the model sees"}
      </button>

      {open && (
        <div
          style={{
            marginTop: 4,
            border: "1px solid var(--border)",
            borderRadius: 5,
            background: "var(--code-surface, var(--bg-2))",
            padding: "8px 10px",
            fontSize: 11,
            color: "var(--fg-muted)",
            lineHeight: 1.5,
          }}
        >
          <div>
            <span style={{ color: "var(--fg-subtle)" }}>port:</span>{" "}
            <span className="mono" style={{ color: "var(--fg)" }}>
              {portLine}
            </span>
          </div>
          <div style={{ marginTop: 6, color: "var(--fg-subtle)" }}>
            scan output:
          </div>
          <pre
            className="mono"
            style={{
              margin: "2px 0 0",
              padding: "6px 8px",
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              fontSize: 10.5,
              color: "var(--fg)",
              maxHeight: 160,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {scan || "(none)"}
          </pre>
          {kb.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <span style={{ color: "var(--fg-subtle)" }}>
                baseline KB commands ({kb.length}):
              </span>
              <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>
                {kb.map((c, i) => (
                  <li key={i} className="mono" style={{ fontSize: 10.5, color: "var(--fg)" }}>
                    {c.command}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div
            style={{
              marginTop: 8,
              fontSize: 10,
              fontStyle: "italic",
              color: "var(--fg-subtle)",
            }}
          >
            {cloud
              ? "Plus a fixed system prompt. This is the only data that leaves your machine."
              : "Plus a fixed system prompt. Stays on your configured local endpoint."}
          </div>
        </div>
      )}
    </div>
  );
}
