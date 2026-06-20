"use client";

/**
 * SummarizeEngagementButton — engagement-level AI summary (beta-test feature).
 *
 * Per-port Explain/Suggest stay the default; this opt-in button asks the model
 * for ONE prioritized plan across all open ports of the active host — "what to
 * attack first and why". Hidden unless the AI co-pilot is enabled (and not in
 * Exam Mode). Streams plain text like ExplainButton; suggest-only, never runs
 * anything. Larger context than a single port, so it's a deliberate click.
 *
 * On MULTI-HOST engagements a second button summarizes the whole engagement —
 * a cross-host plan over every host's open ports (which host/service to attack
 * first, pivot hints). Shown only when `allHosts` carries more than one host.
 */

import { useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { useAiStatus } from "@/components/ai/useAiStatus";
import { AiErrorActions } from "@/components/ai/AiErrorActions";

export interface SummaryPort {
  port: number;
  protocol?: string | null;
  service?: string | null;
  version?: string | null;
  scanOutput?: string | null;
}

export interface SummaryHost {
  target: string | null;
  ports: SummaryPort[];
}

type Scope = "host" | "all";

export function SummarizeEngagementButton({
  engagementId,
  target,
  ports,
  allHosts,
}: {
  engagementId: number;
  target: string | null;
  ports: SummaryPort[];
  /** Every host with its open ports — enables the cross-host summary button. */
  allHosts?: SummaryHost[];
}) {
  const status = useAiStatus();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("host");

  const multiHost = (allHosts?.length ?? 0) > 1;

  if (!status || !status.enabled || ports.length === 0) return null;

  async function run(which: Scope) {
    setScope(which);
    setOpen(true);
    setText("");
    setError(null);
    setStreaming(true);
    try {
      const body =
        which === "all"
          ? {
              task: "summarize_all_hosts",
              engagementId,
              host: target,
              context: { hosts: allHosts },
            }
          : {
              task: "summarize_engagement",
              engagementId,
              host: target,
              context: { target, ports },
            };
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        setText((t) => t + dec.decode(value, { stream: true }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the assistant.");
    } finally {
      setStreaming(false);
    }
  }

  const hostCount = allHosts?.length ?? 0;
  const buttonStyle = {
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: 6,
    padding: "5px 11px",
    borderRadius: 5,
    border: "1px solid var(--accent-border)",
    background: "var(--accent-bg)",
    color: "var(--accent)",
    fontSize: 12,
    fontWeight: 600,
  };

  return (
    <div style={{ padding: "10px 24px", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => run("host")}
          disabled={streaming}
          title={`Summarize ${multiHost ? "this host's" : "all"} ${ports.length} ports with AI (${status.provider}${status.cloud ? " · cloud" : " · local"})`}
          style={{ ...buttonStyle, cursor: streaming ? "wait" : "pointer" }}
        >
          {streaming && scope === "host" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Sparkles size={13} />
          )}
          {streaming && scope === "host"
            ? "Summarizing…"
            : multiHost
              ? "AI: summarize this host"
              : "AI: summarize attack surface"}
        </button>

        {multiHost && (
          <button
            type="button"
            onClick={() => run("all")}
            disabled={streaming}
            title={`Cross-host AI summary over all ${hostCount} hosts (${status.provider}${status.cloud ? " · cloud" : " · local"})`}
            style={{ ...buttonStyle, cursor: streaming ? "wait" : "pointer" }}
          >
            {streaming && scope === "all" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            {streaming && scope === "all"
              ? "Summarizing…"
              : `AI: summarize all ${hostCount} hosts`}
          </button>
        )}
      </div>

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
              {scope === "all"
                ? `AI CROSS-HOST SUMMARY · ${hostCount} HOSTS`
                : "AI ATTACK-SURFACE SUMMARY"}{" "}
              · {status.model}
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
              <AiErrorActions error={error} onRetry={() => run(scope)} />
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
                {streaming && <span style={{ opacity: 0.5 }}>▍</span>}
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
                AI-generated — verify before acting. The model only prioritizes
                the scan; it does not run anything.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
