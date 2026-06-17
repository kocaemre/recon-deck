"use client";

/**
 * SuggestButton — "Suggest commands" AI affordance for a port (v2.5.0, Sprint 3).
 *
 * Hidden unless the AI co-pilot is enabled (and not in Exam Mode). On click it
 * POSTs the port context + the vetted baseline KB commands to /api/ai
 * (task: suggest_commands) and renders the validated suggestions as copyable
 * cards with a risk badge. Suggest-only — nothing is ever executed.
 */

import { useState } from "react";
import { Wand2, Loader2, X } from "lucide-react";
import { useAiStatus } from "@/components/ai/useAiStatus";
import { CopyButton } from "@/components/CopyButton";

interface Suggestion {
  command: string;
  why?: string;
  risk?: "safe" | "intrusive";
}

export interface SuggestContext {
  port: number;
  protocol?: string | null;
  service?: string | null;
  version?: string | null;
  scanOutput: string;
  kbCommands: Array<{ label: string; command: string }>;
}

export function SuggestButton(props: SuggestContext) {
  const status = useAiStatus();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  if (!status || !status.enabled) return null;

  async function run() {
    setOpen(true);
    setItems([]);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "suggest_commands",
          context: {
            port: props.port,
            protocol: props.protocol ?? null,
            service: props.service ?? null,
            version: props.version ?? null,
            scanOutput: props.scanOutput,
            kbCommands: props.kbCommands,
          },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        suggestions?: Suggestion[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setItems(Array.isArray(json.suggestions) ? json.suggestions : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the assistant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        title={`Suggest commands with AI (${status.provider}${status.cloud ? " · cloud" : " · local"})`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 9px",
          borderRadius: 5,
          border: "1px solid var(--accent-border)",
          background: "var(--accent-bg)",
          color: "var(--accent)",
          fontSize: 11.5,
          fontWeight: 600,
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {loading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Wand2 size={12} />
        )}
        {loading ? "Suggesting…" : "Suggest commands"}
      </button>

      {open && (
        <div
          style={{
            marginTop: 8,
            border: "1px solid var(--accent-border)",
            borderRadius: 6,
            background: "var(--bg-1)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "5px 10px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-2)",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: "var(--fg-subtle)",
            }}
          >
            <span>
              AI SUGGESTIONS · {status.model}
              {status.cloud ? " · cloud" : " · local"}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                background: "none",
                border: "none",
                color: "var(--fg-subtle)",
                cursor: "pointer",
                display: "flex",
              }}
            >
              <X size={13} />
            </button>
          </div>
          <div style={{ padding: 10 }}>
            {loading && (
              <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                Asking the model…
              </div>
            )}
            {error && (
              <div style={{ fontSize: 12, color: "var(--danger, #dc2626)" }}>
                {error}
              </div>
            )}
            {!loading && !error && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 5,
                      background: "var(--code-surface)",
                      padding: "8px 10px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        justifyContent: "space-between",
                      }}
                    >
                      <code
                        className="mono"
                        style={{ fontSize: 12, color: "var(--fg)", wordBreak: "break-all" }}
                      >
                        {s.command}
                      </code>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <RiskBadge risk={s.risk} />
                        <CopyButton text={s.command} />
                      </div>
                    </div>
                    {s.why && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11.5,
                          color: "var(--fg-muted)",
                          lineHeight: 1.5,
                        }}
                      >
                        {s.why}
                      </div>
                    )}
                  </div>
                ))}
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--fg-subtle)",
                    fontStyle: "italic",
                  }}
                >
                  AI-generated — review each command before running it yourself.
                  Nothing here is executed automatically.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RiskBadge({ risk }: { risk?: "safe" | "intrusive" }) {
  const intrusive = risk === "intrusive";
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.05em",
        padding: "1px 6px",
        borderRadius: 999,
        border: `1px solid ${intrusive ? "var(--warning-border, #b45309)" : "var(--border)"}`,
        background: intrusive ? "var(--warning-bg, rgba(180,83,9,0.14))" : "var(--bg-2)",
        color: intrusive ? "var(--warning, #d97706)" : "var(--fg-subtle)",
      }}
    >
      {intrusive ? "INTRUSIVE" : "SAFE"}
    </span>
  );
}
