"use client";

/**
 * Markdown — a tiny, dependency-free renderer for AI panel output.
 *
 * The co-pilot replies in Markdown (`**bold**`, `### headings`, `-`/`1.` lists,
 * `` `code` ``); the panels used to print it raw, so operators saw literal
 * `**` and `###`. This renders a safe SUBSET into React nodes.
 *
 * SECURITY: AI output can echo attacker-controlled scan text, so we never use
 * dangerouslySetInnerHTML. Everything becomes React text nodes (auto-escaped),
 * and inline links are deliberately NOT rendered as anchors — no clickable
 * surface is created from model output.
 */

import React from "react";
import { parseBlocks } from "./markdown-parse";

/** Inline: `code`, **bold**, *italic* / _italic_ → React spans (code wins). */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Split on inline code first so ** inside backticks stays literal.
  const codeParts = text.split(/(`[^`]+`)/g);
  codeParts.forEach((part, ci) => {
    if (/^`[^`]+`$/.test(part)) {
      out.push(
        <code
          key={`${keyBase}-c${ci}`}
          className="mono"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 3,
            padding: "0 4px",
            fontSize: "0.92em",
          }}
        >
          {part.slice(1, -1)}
        </code>,
      );
      return;
    }
    // Bold, then italic, within non-code text.
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    boldParts.forEach((bp, bi) => {
      if (/^\*\*[^*]+\*\*$/.test(bp)) {
        out.push(
          <strong key={`${keyBase}-b${ci}-${bi}`} style={{ fontWeight: 600, color: "var(--fg)" }}>
            {bp.slice(2, -2)}
          </strong>,
        );
        return;
      }
      const italParts = bp.split(/(\*[^*]+\*|_[^_]+_)/g);
      italParts.forEach((ip, ii) => {
        if (/^\*[^*]+\*$/.test(ip) || /^_[^_]+_$/.test(ip)) {
          out.push(<em key={`${keyBase}-i${ci}-${bi}-${ii}`}>{ip.slice(1, -1)}</em>);
        } else if (ip) {
          out.push(<React.Fragment key={`${keyBase}-t${ci}-${bi}-${ii}`}>{ip}</React.Fragment>);
        }
      });
    });
  });
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--fg)" }}>
      {blocks.map((b, i) => {
        if (b.type === "h") {
          const size = b.level! <= 1 ? 15 : b.level === 2 ? 13.5 : 12.5;
          return (
            <div
              key={i}
              style={{
                fontWeight: 600,
                fontSize: size,
                color: "var(--fg)",
                margin: i === 0 ? "0 0 6px" : "12px 0 6px",
              }}
            >
              {renderInline(b.text!, `h${i}`)}
            </div>
          );
        }
        if (b.type === "ul" || b.type === "ol") {
          const Tag = b.type === "ul" ? "ul" : "ol";
          return (
            <Tag
              key={i}
              style={{
                margin: "4px 0 8px",
                paddingLeft: 20,
                listStyle: b.type === "ul" ? "disc" : "decimal",
              }}
            >
              {b.items!.map((it, j) => (
                <li key={j} style={{ margin: "2px 0" }}>
                  {renderInline(it, `l${i}-${j}`)}
                </li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={i} style={{ margin: "0 0 8px" }}>
            {renderInline(b.text!, `p${i}`)}
          </p>
        );
      })}
    </div>
  );
}
