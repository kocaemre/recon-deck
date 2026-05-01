"use client";

/**
 * EditorIntegrationToggle — opt-in surface for the v1.4.0 #12
 * "Open in editor" feature. Mounted in /settings.
 *
 * Persists the flag to localStorage so the toggle is per-machine
 * (single-user app — no DB column needed). Also surfaces the configured
 * `NEXT_PUBLIC_RECON_LOCAL_EXPORT_DIR` so the operator can see whether
 * the env is wired up before flipping the switch.
 */

import { useOpenInEditorPref } from "@/components/OpenInEditorLink";

export function EditorIntegrationToggle() {
  const [enabled, setEnabled] = useOpenInEditorPref();
  const base = process.env.NEXT_PUBLIC_RECON_LOCAL_EXPORT_DIR;

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--bg-2)",
      }}
    >
      <label
        className="flex items-center gap-3"
        style={{ cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(ev) => setEnabled(ev.target.checked)}
          style={{ accentColor: "var(--accent)" }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            Enable &ldquo;Open in editor&rdquo; links
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: "var(--fg-muted)",
              lineHeight: 1.5,
            }}
          >
            Surfaces a <code>vscode://file/…</code> link on the engagement
            header. Only works if VS Code (or another editor that
            registers the protocol handler) is installed on this machine.
            Off by default.
          </div>
        </div>
      </label>
      <div
        className="mono"
        style={{
          marginTop: 10,
          fontSize: 11,
          color: base ? "var(--fg-faint)" : "var(--risk-med)",
        }}
      >
        Local export dir:{" "}
        {base ? (
          <span style={{ color: "var(--fg-muted)" }}>{base}</span>
        ) : (
          <span>
            (unset — set <code>NEXT_PUBLIC_RECON_LOCAL_EXPORT_DIR</code>{" "}
            at build time)
          </span>
        )}
      </div>
    </div>
  );
}
