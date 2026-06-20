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
import { Wand2, Loader2, X, Plus, Check, Copy } from "lucide-react";
import { useAiStatus } from "@/components/ai/useAiStatus";
import { CopyButton } from "@/components/CopyButton";
import { AiContextPreview } from "@/components/ai/AiContextPreview";
import { AiErrorActions } from "@/components/ai/AiErrorActions";

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
  // Index → "saved" | "error" for the per-card "Add to My Commands" action.
  const [added, setAdded] = useState<Record<number, "saved" | "error">>({});
  const [copiedSafe, setCopiedSafe] = useState(false);

  if (!status || !status.enabled) return null;

  const safeCommands = items
    .filter((s) => s.risk !== "intrusive")
    .map((s) => s.command);

  async function addToMyCommands(s: Suggestion, idx: number) {
    try {
      const res = await fetch("/api/user-commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: props.service ?? null,
          port: props.port,
          label: `AI: ${s.command.split(/\s+/)[0]} (${props.service ?? props.port})`,
          template: s.command,
        }),
      });
      setAdded((a) => ({ ...a, [idx]: res.ok ? "saved" : "error" }));
    } catch {
      setAdded((a) => ({ ...a, [idx]: "error" }));
    }
  }

  async function copyAllSafe() {
    try {
      await navigator.clipboard.writeText(safeCommands.join("\n"));
      setCopiedSafe(true);
      window.setTimeout(() => setCopiedSafe(false), 1500);
    } catch {
      /* clipboard blocked — individual copy buttons still work */
    }
  }

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
            {error && <AiErrorActions error={error} onRetry={run} />}
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
                        <AddToCommandsButton
                          state={added[i]}
                          onClick={() => addToMyCommands(s, i)}
                        />
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
                {safeCommands.length > 0 && (
                  <button
                    type="button"
                    onClick={copyAllSafe}
                    style={{
                      alignSelf: "flex-start",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 9px",
                      borderRadius: 5,
                      border: "1px solid var(--border)",
                      background: "var(--bg-2)",
                      color: copiedSafe ? "var(--accent)" : "var(--fg-muted)",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {copiedSafe ? <Check size={12} /> : <Copy size={12} />}
                    {copiedSafe
                      ? "Copied"
                      : `Copy all safe (${safeCommands.length})`}
                  </button>
                )}
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
                <AiContextPreview
                  context={{
                    port: props.port,
                    protocol: props.protocol ?? null,
                    service: props.service ?? null,
                    version: props.version ?? null,
                    scanOutput: props.scanOutput,
                    kbCommands: props.kbCommands,
                  }}
                  cloud={status.cloud}
                />
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
      title={
        intrusive
          ? "Intrusive — may generate noisy or brute-force-like traffic. Run deliberately and only within scope."
          : "Low-impact — read-only / enumeration, generally safe to run."
      }
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.05em",
        padding: "1px 6px",
        borderRadius: 999,
        border: `1px solid ${intrusive ? "var(--warning-border, #b45309)" : "var(--border)"}`,
        background: intrusive ? "var(--warning-bg, rgba(180,83,9,0.14))" : "var(--bg-2)",
        color: intrusive ? "var(--warning, #d97706)" : "var(--fg-subtle)",
        cursor: "help",
      }}
    >
      {intrusive ? "INTRUSIVE" : "SAFE"}
    </span>
  );
}

/** Per-suggestion "Add to My Commands" button → POSTs to /api/user-commands. */
function AddToCommandsButton({
  state,
  onClick,
}: {
  state?: "saved" | "error";
  onClick: () => void;
}) {
  const saved = state === "saved";
  const errored = state === "error";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saved}
      title={
        saved
          ? "Saved to My Commands (refresh to see it on the port)"
          : errored
            ? "Could not save — try again"
            : "Add to My Commands for this port"
      }
      aria-label="Add to My Commands"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 6px",
        borderRadius: 5,
        border: "1px solid var(--border)",
        background: "var(--bg-2)",
        color: saved
          ? "var(--accent)"
          : errored
            ? "var(--danger, #dc2626)"
            : "var(--fg-subtle)",
        fontSize: 10.5,
        cursor: saved ? "default" : "pointer",
      }}
    >
      {saved ? <Check size={11} /> : <Plus size={11} />}
      {saved ? "Added" : "Add"}
    </button>
  );
}
