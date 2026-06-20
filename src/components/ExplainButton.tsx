"use client";

/**
 * ExplainButton — "Explain this" AI affordance for a port (v2.5.0, Sprint 2).
 *
 * Renders nothing unless the AI co-pilot is enabled (and not in Exam Mode).
 * On click it POSTs the port's scan context to the server proxy /api/ai and
 * streams the plain-text explanation into a panel, token by token.
 *
 * Suggest-only: this never runs a command — it describes the scan output and
 * surfaces considerations. Output carries an explicit "verify" disclaimer.
 */

import { useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { useAiStatus } from "@/components/ai/useAiStatus";
import { AiContextPreview } from "@/components/ai/AiContextPreview";

export interface ExplainContext {
  port: number;
  protocol?: string | null;
  service?: string | null;
  version?: string | null;
  scanOutput: string;
}

export function ExplainButton(props: ExplainContext) {
  const status = useAiStatus();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [open, setOpen] = useState(false);

  // Hidden entirely unless the assistant is usable right now.
  if (!status || !status.enabled) return null;

  async function run() {
    setOpen(true);
    setText("");
    setError(null);
    setStreaming(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "explain",
          context: {
            port: props.port,
            protocol: props.protocol ?? null,
            service: props.service ?? null,
            version: props.version ?? null,
            scanOutput: props.scanOutput,
          },
        }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setText((t) => t + chunk);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the assistant.");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={streaming}
        title={`Explain with AI (${status.provider}${status.cloud ? " · cloud" : " · local"})`}
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
          cursor: streaming ? "wait" : "pointer",
        }}
      >
        {streaming ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Sparkles size={12} />
        )}
        {streaming ? "Explaining…" : "Explain"}
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
              AI EXPLANATION · {status.model}
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
            {error ? (
              <div style={{ fontSize: 12, color: "var(--danger, #dc2626)" }}>
                {error}
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: "var(--fg)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {text}
                {streaming && (
                  <span style={{ opacity: 0.5 }}>▍</span>
                )}
              </div>
            )}
            {!streaming && !error && text && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 10.5,
                  color: "var(--fg-subtle)",
                  fontStyle: "italic",
                }}
              >
                AI-generated — verify before acting. The model only describes
                the scan; it does not run anything.
              </div>
            )}
            <AiContextPreview
              context={{
                port: props.port,
                protocol: props.protocol ?? null,
                service: props.service ?? null,
                version: props.version ?? null,
                scanOutput: props.scanOutput,
              }}
              cloud={status.cloud}
            />
          </div>
        </div>
      )}
    </div>
  );
}
