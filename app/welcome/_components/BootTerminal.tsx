"use client";

/**
 * BootTerminal — animated `rd init` log on Step 1 (v1.9.0).
 *
 * Honours `prefers-reduced-motion: reduce` by rendering the final
 * state immediately. Otherwise the lines reveal sequentially: 200ms
 * intro pause, 220ms per line, 480ms to "type" line 1, 600ms to
 * land the final ready prompt.
 */

import { useEffect, useState } from "react";

interface Line {
  glyph: "$" | "→" | "✓" | "✗";
  text: string;
  style: "cmd" | "info" | "ok" | "warn" | "ready";
}

const BOOT_LINES: Line[] = [
  { glyph: "$", text: "rd init", style: "cmd" },
  { glyph: "→", text: "loading recon-deck v2.0.1", style: "info" },
  { glyph: "✓", text: "local sqlite · /data/recon.db", style: "ok" },
  { glyph: "✓", text: "knowledge base · 33 entries loaded", style: "ok" },
  { glyph: "✓", text: "kb editor · /knowledge/*.yaml", style: "ok" },
  {
    glyph: "✓",
    text: "exporters · md sysreptor pwndoc html csv",
    style: "ok",
  },
  { glyph: "✓", text: "network · offline-by-default", style: "ok" },
  { glyph: "✗", text: "telemetry · disabled (OPS-03)", style: "warn" },
  { glyph: "→", text: "operator · single-user session", style: "info" },
  { glyph: "$", text: "ready. press ⏎ to begin.", style: "ready" },
];

const GLYPH_COLOR: Record<Line["style"], string> = {
  cmd: "var(--fg-subtle)",
  info: "var(--fg-subtle)",
  ok: "var(--accent)",
  warn: "var(--risk-high)",
  ready: "var(--accent)",
};

const TEXT_COLOR: Record<Line["style"], string> = {
  cmd: "var(--fg)",
  info: "var(--fg-muted)",
  ok: "var(--fg-muted)",
  warn: "var(--fg-muted)",
  ready: "var(--accent)",
};

export function BootTerminal() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setCount(BOOT_LINES.length);
      return;
    }
    let i = 0;
    const tick = () => {
      i += 1;
      setCount(i);
      if (i >= BOOT_LINES.length) return;
      const delay =
        i === 1 ? 480 : i === BOOT_LINES.length - 1 ? 600 : 220;
      handle = setTimeout(tick, delay);
    };
    let handle = setTimeout(tick, 200);
    return () => clearTimeout(handle);
  }, []);

  return (
    <div
      style={{
        background: "var(--code)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        lineHeight: 1.7,
        overflow: "hidden",
        boxShadow:
          "0 0 0 1px var(--border-subtle), 0 30px 60px -20px rgba(0,0,0,0.6)",
        maxWidth: 520,
      }}
    >
      <div
        className="flex items-center"
        style={{
          padding: "9px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-2)",
          gap: 8,
        }}
      >
        <span
          style={{ width: 9, height: 9, borderRadius: 999, background: "#3a3b40" }}
        />
        <span
          style={{ width: 9, height: 9, borderRadius: 999, background: "#3a3b40" }}
        />
        <span
          style={{ width: 9, height: 9, borderRadius: 999, background: "#3a3b40" }}
        />
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--fg-subtle)",
            marginLeft: 6,
          }}
        >
          ~/recon-deck — bash
        </span>
        <span
          className="mono"
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--fg-subtle)",
          }}
        >
          tty · 80×24
        </span>
      </div>

      <div style={{ padding: "16px 18px", minHeight: 320 }}>
        {BOOT_LINES.slice(0, count).map((ln, i) => {
          const isLastTyping = i === count - 1 && count < BOOT_LINES.length;
          return (
            <div
              key={i}
              className="flex"
              style={{ gap: 10 }}
            >
              <span style={{ color: GLYPH_COLOR[ln.style], width: 10 }}>
                {ln.glyph}
              </span>
              <span style={{ color: TEXT_COLOR[ln.style] }}>
                {ln.text}
                {isLastTyping && <Caret />}
              </span>
            </div>
          );
        })}
        {count >= BOOT_LINES.length && (
          <div
            className="flex"
            style={{ gap: 10, marginTop: 4 }}
          >
            <span style={{ color: "var(--accent)" }}>$</span>
            <Caret />
          </div>
        )}
      </div>
    </div>
  );
}

function Caret() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 14,
        background: "var(--accent)",
        marginLeft: 4,
        verticalAlign: -2,
        animation: "rd-blink 1s steps(2) infinite",
      }}
    />
  );
}
