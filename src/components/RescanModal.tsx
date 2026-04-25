"use client";

/**
 * RescanModal — paste a fresh nmap output to reconcile against the
 * engagement's existing port surface (P1-G PR 1).
 *
 * Submits to POST /api/engagements/[id]/rescan, which appends a
 * scan_history row and updates ports' first_seen / last_seen /
 * closed_at lifecycle columns. Displays the reconciliation summary
 * (added / closed / reopened / reaffirmed / new hosts) on success.
 *
 * Style mirrors the existing modal aesthetic in this codebase: bg-2
 * panel, border-strong frame, mono input, accent CTA. Cancel via ESC
 * or backdrop click; submit via ⌘+Enter.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Props {
  engagementId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RescanResult {
  scanId: number;
  added: number;
  reopened: number;
  closed: number;
  reaffirmed: number;
  newHosts: number;
}

export function RescanModal({ engagementId, open, onOpenChange }: Props) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Focus the textarea when the modal opens; reset state when closed.
  useEffect(() => {
    if (open) {
      setRaw("");
      setError(null);
      setSubmitting(false);
      // Defer focus until the modal is actually mounted.
      const t = setTimeout(() => textareaRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ESC closes the modal regardless of focus position.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  async function submit() {
    if (!raw.trim()) {
      setError("Paste nmap output (-oN or -oX) to re-import.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/rescan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Rescan failed.");
        return;
      }
      const result = (await res.json()) as RescanResult;
      const summary = formatSummary(result);
      toast.success(`Scan #${result.scanId} imported`, {
        description: summary,
      });
      onOpenChange(false);
      router.refresh();
    } catch {
      setError("Rescan failed — could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  function onTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Re-import scan"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: 80,
      }}
    >
      <div
        style={{
          width: 720,
          maxWidth: "92vw",
          maxHeight: "80vh",
          background: "var(--bg-2)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "baseline",
            gap: 12,
          }}
        >
          <span
            className="mono uppercase tracking-[0.08em] font-medium"
            style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
          >
            RE-IMPORT SCAN
          </span>
          <h2
            className="font-semibold"
            style={{ fontSize: 14, letterSpacing: "-0.01em", margin: 0 }}
          >
            Reconcile against the existing port surface
          </h2>
        </header>

        <div style={{ padding: "12px 16px 0" }}>
          <p
            style={{
              fontSize: 12,
              color: "var(--fg-muted)",
              marginBottom: 10,
              lineHeight: 1.5,
            }}
          >
            Paste a fresh <code className="mono">nmap -oN</code> /{" "}
            <code className="mono">-oX</code> output. Re-observed ports keep
            their checks + notes; ports that disappear get marked closed,
            new ports surface with a fresh first-seen timestamp. ⌘+Enter
            to submit.
          </p>
        </div>

        <div
          style={{
            padding: "0 16px 12px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 240,
          }}
        >
          <textarea
            ref={textareaRef}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={onTextareaKeyDown}
            placeholder="# Nmap 7.94 scan initiated …"
            spellCheck={false}
            className="mono"
            style={{
              flex: 1,
              minHeight: 200,
              resize: "vertical",
              padding: 10,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-0)",
              color: "var(--fg)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              outline: "none",
              lineHeight: 1.45,
            }}
          />
          {error && (
            <p
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "var(--risk-crit)",
              }}
            >
              {error}
            </p>
          )}
        </div>

        <footer
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            className="mono"
            style={{ fontSize: 10.5, color: "var(--fg-faint)" }}
          >
            ESC to cancel
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              style={{
                height: 28,
                padding: "0 12px",
                borderRadius: 5,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--fg-muted)",
                fontSize: 12,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !raw.trim()}
              style={{
                height: 28,
                padding: "0 14px",
                borderRadius: 5,
                background: "var(--accent)",
                color: "#05170d",
                border: "1px solid var(--accent)",
                fontSize: 12,
                fontWeight: 600,
                cursor:
                  submitting || !raw.trim() ? "not-allowed" : "pointer",
                opacity: submitting || !raw.trim() ? 0.6 : 1,
              }}
            >
              {submitting ? "Importing…" : "Re-import"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function formatSummary(r: RescanResult): string {
  const parts: string[] = [];
  if (r.added > 0) parts.push(`${r.added} new`);
  if (r.reopened > 0) parts.push(`${r.reopened} reopened`);
  if (r.closed > 0) parts.push(`${r.closed} closed`);
  if (r.reaffirmed > 0) parts.push(`${r.reaffirmed} unchanged`);
  if (r.newHosts > 0) parts.push(`${r.newHosts} new host${r.newHosts === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(" · ") : "no changes";
}
