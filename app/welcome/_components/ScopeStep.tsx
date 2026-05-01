"use client";

/**
 * Step 1 — Scope (v1.9.0).
 * Two-column layout: left side `// is / // is not` matrix, right side
 * the animated boot terminal.
 */

import { Check } from "lucide-react";
import { BootTerminal } from "./BootTerminal";

export function ScopeStep() {
  return (
    <div
      className="grid h-full"
      style={{
        gridTemplateColumns: "1.1fr 1fr",
      }}
    >
      <div
        className="flex flex-col justify-center"
        style={{ padding: "44px 36px 36px 56px" }}
      >
        <div
          className="mono uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginBottom: 14 }}
        >
          STEP 01 / 04 · SCOPE
        </div>
        <h1
          className="font-semibold"
          style={{
            fontSize: 36,
            letterSpacing: "-0.025em",
            lineHeight: 1.15,
            margin: "0 0 16px",
            color: "var(--fg)",
          }}
        >
          A post-scan workflow,
          <br />
          <span style={{ color: "var(--accent)" }}>not</span> a scanner.
        </h1>
        <p
          style={{
            fontSize: 14.5,
            color: "var(--fg-muted)",
            margin: "0 0 28px",
            maxWidth: 480,
            lineHeight: 1.6,
          }}
        >
          Drop nmap output or an AutoRecon zip. Every open port becomes a tile
          with KB-driven commands, checklists, notes, and evidence — ready to
          export to Markdown, SysReptor, PwnDoc, HTML or CSV.
        </p>
        <div
          className="grid"
          style={{ gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 600 }}
        >
          <ScopeCard
            label="// is"
            accent
            items={[
              [
                "Post-scan workflow tracker",
                "Every open port → tile with KB-driven commands, checks, notes, evidence.",
              ],
              [
                "Offline · single-user",
                "Local SQLite. No accounts, no telemetry, no cloud.",
              ],
              [
                "Export-friendly",
                "Markdown · SysReptor · PwnDoc · HTML · CSV.",
              ],
            ]}
          />
          <ScopeCard
            label="// is not"
            items={[
              [
                "A scanner",
                "Doesn't run nmap or AutoRecon. Bring your own scan output.",
              ],
              [
                "A reporting platform",
                "Exports clean handoff artifacts; the writeup happens elsewhere.",
              ],
              [
                "Multi-user / collaborative",
                "One operator, one machine. Use git or zip if you need to share.",
              ],
            ]}
          />
        </div>
      </div>

      <div
        className="flex flex-col justify-center"
        style={{
          padding: "44px 56px 36px 36px",
          background:
            "linear-gradient(180deg, var(--bg-0) 0%, rgba(74,222,128,0.02) 100%)",
        }}
      >
        <BootTerminal />
      </div>
    </div>
  );
}

function ScopeCard({
  label,
  accent,
  items,
}: {
  label: string;
  accent?: boolean;
  items: Array<[string, string]>;
}) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 6,
        background: "var(--bg-1)",
        border: `1px solid ${accent ? "var(--accent-border)" : "var(--border)"}`,
      }}
    >
      <div
        className="mono"
        style={{
          color: accent ? "var(--accent)" : "var(--fg-subtle)",
          fontSize: 11,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "grid",
          gap: 10,
        }}
      >
        {items.map(([h, b]) => (
          <li key={h} className="flex items-start" style={{ gap: 10 }}>
            <span
              className="grid place-items-center"
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: accent ? "var(--accent-bg)" : "var(--bg-3)",
                border: `1px solid ${accent ? "var(--accent-border)" : "var(--border)"}`,
                color: accent ? "var(--accent)" : "var(--fg-subtle)",
                fontSize: 10,
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              {accent ? <Check size={9} strokeWidth={3} /> : "×"}
            </span>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13.5 }}>{h}</div>
              <div
                style={{
                  color: "var(--fg-muted)",
                  fontSize: 12.5,
                  marginTop: 2,
                  lineHeight: 1.5,
                }}
              >
                {b}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
