"use client";

/**
 * Step 4 — Updates (v1.9.0).
 *
 * Single column with the opt-in checkbox card, a "what you'll see"
 * toast preview, and the closing accent banner. Pressing ⏎ here
 * triggers the parent's `finish()` (handled in WelcomeFlow).
 */

import { Check, ExternalLink, X } from "lucide-react";

export function UpdatesStep({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      style={{
        padding: "48px 56px",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <div
        className="mono uppercase tracking-[0.08em] font-medium"
        style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginBottom: 14 }}
      >
        STEP 04 / 04 · UPDATES
      </div>
      <h1
        className="font-semibold"
        style={{
          fontSize: 28,
          letterSpacing: "-0.02em",
          margin: "0 0 12px",
          color: "var(--fg)",
        }}
      >
        One last thing.
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--fg-muted)",
          margin: "0 0 24px",
          lineHeight: 1.6,
        }}
      >
        recon-deck is offline-by-default (
        <span className="mono" style={{ color: "var(--fg)" }}>
          OPS-03
        </span>
        ). Anything that talks to the internet is opt-in — including version
        checks.
      </p>

      <UpdateOptIn checked={checked} onChange={onChange} />

      <div
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 6,
          background: "var(--bg-1)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          className="mono"
          style={{ fontSize: 11, color: "var(--fg-subtle)", marginBottom: 12 }}
        >
          {"// "}what you&apos;ll see
        </div>
        <ToastPreview />
      </div>

      <div
        className="flex items-start"
        style={{
          marginTop: 12,
          padding: 14,
          borderRadius: 6,
          background: "var(--accent-bg)",
          border: "1px solid var(--accent-border)",
          gap: 10,
        }}
      >
        <span
          className="grid place-items-center"
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "var(--accent)",
            color: "#05170d",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <Check size={11} strokeWidth={3} />
        </span>
        <span
          style={{ fontSize: 13, color: "var(--fg)", lineHeight: 1.55 }}
        >
          Almost done. Hitting{" "}
          <span
            className="mono"
            style={{
              padding: "1px 5px",
              borderRadius: 3,
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              fontSize: 11,
            }}
          >
            ⏎
          </span>{" "}
          writes <span className="mono">onboarded_at</span> and drops you on
          the paste panel for your first engagement.
        </span>
      </div>
    </div>
  );
}

function UpdateOptIn({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 6,
        background: "var(--bg-1)",
        border: `1px solid ${checked ? "var(--accent-border)" : "var(--border)"}`,
      }}
    >
      <label
        className="flex items-start"
        style={{ gap: 12, cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
        />
        <span
          className="grid place-items-center"
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            flexShrink: 0,
            marginTop: 1,
            background: checked ? "var(--accent)" : "var(--bg-2)",
            border: `1px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
            color: "#05170d",
          }}
        >
          {checked && <Check size={11} strokeWidth={3} />}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 13.5 }}>
            Check GitHub for new releases
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--fg-muted)",
              marginTop: 4,
              lineHeight: 1.55,
            }}
          >
            Once at startup, recon-deck pings{" "}
            <span className="mono" style={{ color: "var(--fg)" }}>
              api.github.com/repos/kocaemre/recon-deck/releases/latest
            </span>
            .<br />
            If a newer tag exists, you&apos;ll see a non-blocking toast.
          </div>
        </div>
      </label>
      <div
        className="flex items-center"
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid var(--border)",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Chip>
          <span className="mono">{"// "}only this single request leaves your machine</span>
        </Chip>
        <Chip>no telemetry</Chip>
        <Chip>no analytics</Chip>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--fg-subtle)",
          }}
        >
          Toggleable later in{" "}
          <span className="mono" style={{ color: "var(--fg-muted)" }}>
            /settings → updates
          </span>
        </span>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 3,
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        fontSize: 10.5,
        color: "var(--fg-muted)",
      }}
    >
      {children}
    </span>
  );
}

function ToastPreview() {
  return (
    <div
      className="flex items-start"
      style={{
        padding: "10px 14px",
        borderRadius: 6,
        background: "var(--bg-2)",
        border: "1px solid var(--accent-border)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        gap: 10,
        maxWidth: 360,
        marginLeft: "auto",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: "var(--accent)",
          marginTop: 6,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          v2.1.0 available
        </div>
        <a
          className="mono inline-flex items-center"
          style={{
            fontSize: 11,
            color: "var(--accent)",
            textDecoration: "none",
            gap: 4,
            marginTop: 2,
          }}
        >
          github.com/kocaemre/recon-deck/releases
          <ExternalLink size={9} />
        </a>
      </div>
      <X size={12} style={{ color: "var(--fg-subtle)", marginTop: 2 }} />
    </div>
  );
}
