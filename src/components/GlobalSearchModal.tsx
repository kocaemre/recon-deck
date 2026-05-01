"use client";

/**
 * GlobalSearchModal — cross-engagement full-text search dialog.
 *
 * Shortcut: Ctrl/Cmd + Shift + F. Backed by /api/search → SQLite FTS5.
 * Hits are grouped by engagement; clicking a hit navigates to the engagement
 * detail page (and scrolls to the relevant port for kind='port' / 'note').
 *
 * Independent of the engagement-scoped CommandPalette so it works on the
 * landing page too — and so the FTS query is scoped across the whole DB.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useUIStore } from "@/lib/store";

interface SearchHit {
  engagementId: number;
  engagementName: string;
  kind: "engagement" | "port" | "script" | "note" | "finding";
  refId: number;
  title: string;
  snippet: string;
  rank: number;
  /** P1-F PR 4 follow-up: host name (or IP) for port-bound hits. */
  hostLabel: string | null;
}

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  engagement: "ENGAGEMENT",
  port: "PORT",
  script: "SCRIPT",
  note: "NOTE",
  finding: "FINDING",
};

export function GlobalSearchModal() {
  const open = useUIStore((s) => s.globalSearchOpen);
  const setOpen = useUIStore((s) => s.setGlobalSearchOpen);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  // v1.4.0 #13: severity filter chip — narrows results to finding-kind
  // hits at or above the chosen level. Default "all" preserves the v1.3
  // behaviour byte-for-byte (no extra filter applied server-side).
  const [severity, setSeverity] = useState<
    "all" | "critical" | "high" | "medium-plus"
  >("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // ⌃⇧F / ⌘⇧F shortcut — open from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);

  // Focus input + reset state on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setActiveIdx(0);
      setSeverity("all");
      // Defer to next tick so the input mounts first.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounced fetch
  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query,
          limit: "40",
        });
        if (severity !== "all") params.set("severity", severity);
        const res = await fetch(`/api/search?${params.toString()}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        setHits(data.hits ?? []);
        setActiveIdx(0);
      } catch {
        /* aborted or network — silent */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query, open, severity]);

  // Group hits by engagement for visual clarity
  const grouped = useMemo(() => {
    const byEng = new Map<number, { name: string; items: SearchHit[] }>();
    for (const h of hits) {
      const g = byEng.get(h.engagementId) ?? {
        name: h.engagementName,
        items: [],
      };
      g.items.push(h);
      byEng.set(h.engagementId, g);
    }
    return Array.from(byEng.entries()).map(([id, g]) => ({
      engagementId: id,
      ...g,
    }));
  }, [hits]);

  function navigate(hit: SearchHit) {
    setOpen(false);
    const base = `/engagements/${hit.engagementId}`;
    // For port-bounded hits we set the active port via the store before
    // navigation so the heatmap opens with the right port selected.
    if (hit.kind === "port" || hit.kind === "note") {
      // refId = ports.id for port + note kinds
      useUIStore.getState().setActivePortId(hit.refId);
    }
    router.push(base);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[activeIdx];
      if (hit) navigate(hit);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Global search"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
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
        <div
          className="flex items-center gap-2.5"
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Search size={14} style={{ color: "var(--fg-subtle)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search across all engagements (ports, services, scripts, notes)…"
            style={{
              flex: 1,
              background: "transparent",
              border: 0,
              outline: "none",
              color: "var(--fg)",
              fontSize: 14,
            }}
          />
          {loading && (
            <span
              style={{
                fontSize: 11,
                color: "var(--fg-subtle)",
              }}
            >
              searching…
            </span>
          )}
          <Kbd>ESC</Kbd>
        </div>

        {/* v1.4.0 #13: severity filter chips. When non-"all" the result
            list narrows to finding-kind hits at or above the chosen
            level — surface text/host/port hits drop out so the
            operator gets a focused finding view. */}
        <div
          style={{
            padding: "6px 14px 4px",
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          {(
            [
              ["all", "all"],
              ["critical", "critical"],
              ["high", "high"],
              ["medium-plus", "medium+"],
            ] as const
          ).map(([key, label]) => {
            const active = severity === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSeverity(key)}
                style={{
                  padding: "2px 8px",
                  borderRadius: 3,
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  background: active ? "var(--bg-3)" : "var(--bg-2)",
                  color: active ? "var(--accent)" : "var(--fg-muted)",
                  fontSize: 10.5,
                  cursor: "pointer",
                  lineHeight: 1.55,
                  textTransform: "lowercase",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!query.trim() && (
            <div
              style={{
                padding: "32px 14px",
                textAlign: "center",
                color: "var(--fg-subtle)",
                fontSize: 12,
              }}
            >
              Type to search engagements, port services, NSE output, and notes.
              <div
                className="mono"
                style={{
                  marginTop: 12,
                  fontSize: 11,
                  color: "var(--fg-faint)",
                }}
              >
                examples: &quot;smb null&quot;, &quot;kerberoast&quot;, &quot;3306&quot;, &quot;anonymous ftp&quot;
              </div>
            </div>
          )}

          {query.trim() && !loading && hits.length === 0 && (
            <div
              style={{
                padding: "24px 14px",
                textAlign: "center",
                color: "var(--fg-subtle)",
                fontSize: 12,
              }}
            >
              No matches.
            </div>
          )}

          {grouped.map((g) => (
            <div key={g.engagementId} style={{ marginBottom: 6 }}>
              <div
                className="uppercase tracking-[0.08em] font-medium"
                style={{
                  padding: "8px 14px 4px",
                  fontSize: 10.5,
                  color: "var(--fg-subtle)",
                }}
              >
                {g.name}
                <span
                  className="mono"
                  style={{
                    marginLeft: 8,
                    color: "var(--fg-faint)",
                    fontSize: 10.5,
                  }}
                >
                  {g.items.length}
                </span>
              </div>
              {g.items.map((h) => {
                const idx = hits.indexOf(h);
                const active = idx === activeIdx;
                return (
                  <button
                    key={`${h.kind}-${h.refId}-${idx}`}
                    type="button"
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => navigate(h)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 14px",
                      background: active ? "var(--bg-3)" : "transparent",
                      borderLeft: active
                        ? "2px solid var(--accent)"
                        : "2px solid transparent",
                      border: "0",
                      cursor: "pointer",
                      color: "var(--fg)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 3,
                          background: "var(--bg-3)",
                          border: "1px solid var(--border)",
                          color: "var(--fg-muted)",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {KIND_LABEL[h.kind]}
                      </span>
                      {/* P1-F PR 4 follow-up: host label for port-bound hits
                          (multi-host engagements). Single-host hits and
                          engagement-level results render hostLabel === null
                          and skip this chip entirely. */}
                      {h.hostLabel && (
                        <span
                          className="mono"
                          style={{
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 3,
                            background: "transparent",
                            border: "1px solid var(--accent)",
                            color: "var(--accent)",
                            letterSpacing: "0.06em",
                          }}
                          title="Host"
                        >
                          {h.hostLabel}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--fg)",
                        }}
                      >
                        {h.title || "—"}
                      </span>
                    </div>
                    {h.snippet && (
                      <div
                        className="mono truncate"
                        style={{
                          fontSize: 11,
                          color: "var(--fg-muted)",
                        }}
                      >
                        {renderSnippet(h.snippet)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div
          className="flex items-center gap-4"
          style={{
            padding: "8px 14px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-1)",
            color: "var(--fg-subtle)",
            fontSize: 11,
          }}
        >
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>⏎</Kbd> open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>ESC</Kbd> close
          </span>
          <span className="mono ml-auto">
            {hits.length} {hits.length === 1 ? "match" : "matches"}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Render an FTS5 snippet() string as a React node array.
 *
 * SQLite produces snippets containing literal `<mark>…</mark>` markers we
 * passed as the open/close arguments to snippet(). Everything between them is
 * untrusted user-controlled text (NSE output, banners, notes). Splitting on
 * the markers and emitting matched segments as `<mark>` JSX while leaving the
 * surrounding text as React text nodes guarantees React's own escaping is in
 * play (SEC-03 invariant — no raw HTML sinks, see ESLint rule).
 */
function renderSnippet(snippet: string): React.ReactNode[] {
  const parts = snippet.split(/(<mark>|<\/mark>)/g);
  const out: React.ReactNode[] = [];
  let inMark = false;
  let buf = "";
  let key = 0;
  const flush = () => {
    if (buf === "") return;
    if (inMark) {
      out.push(
        <mark
          key={key++}
          style={{
            background: "var(--accent-bg)",
            color: "var(--accent)",
            padding: "0 1px",
            borderRadius: 2,
          }}
        >
          {buf}
        </mark>,
      );
    } else {
      out.push(<span key={key++}>{buf}</span>);
    }
    buf = "";
  };
  for (const p of parts) {
    if (p === "<mark>") {
      flush();
      inMark = true;
    } else if (p === "</mark>") {
      flush();
      inMark = false;
    } else {
      buf += p;
    }
  }
  flush();
  return out;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mono inline-flex items-center justify-center"
      style={{
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 3,
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        borderBottomWidth: 2,
        fontSize: 10,
        color: "var(--fg-muted)",
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}
