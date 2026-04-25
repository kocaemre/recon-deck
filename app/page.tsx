/**
 * Landing — Modern IDE redesign.
 *
 * Centered 640px column on a fluid main area. Renders a hero eyebrow + h1 +
 * subtitle, then the redesigned PastePanel (with its own window-chrome and
 * action row), an "or" divider, and the AutoRecon ImportPanel drop zone.
 */

import { PastePanel } from "@/components/PastePanel";
import { ImportPanel } from "@/components/ImportPanel";

export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div style={{ width: 640 }}>
        <div
          className="mono uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginBottom: 10 }}
        >
          NEW ENGAGEMENT · 01
        </div>
        <h1
          className="font-semibold"
          style={{
            fontSize: 28,
            letterSpacing: "-0.02em",
            margin: "0 0 6px",
            color: "var(--fg)",
          }}
        >
          Paste nmap output.
        </h1>
        <p
          style={{
            color: "var(--fg-muted)",
            margin: "0 0 22px",
            fontSize: 14,
          }}
        >
          Text <span className="mono">(-oN)</span> or XML{" "}
          <span className="mono">(-oX)</span>. Every open port becomes a card
          with commands, checks, notes.
        </p>

        <PastePanel />

        {/* "or" divider */}
        <div className="my-[26px] flex items-center gap-2.5">
          <div
            style={{ height: 1, background: "var(--border)", flex: 1 }}
          />
          <span
            className="uppercase tracking-[0.08em] font-medium"
            style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
          >
            or
          </span>
          <div
            style={{ height: 1, background: "var(--border)", flex: 1 }}
          />
        </div>

        <ImportPanel />
      </div>
    </div>
  );
}
