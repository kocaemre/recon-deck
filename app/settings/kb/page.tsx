/**
 * Settings → KB validation.
 *
 * Lets the operator paste a YAML KB entry, validate it against the
 * `KbEntrySchema`, and (when `RECON_KB_USER_DIR` is configured) save
 * it under that directory. The KB cache is invalidated on save so the
 * new entry surfaces in the engagement page on the next request
 * without a server restart.
 */

import { KbValidator } from "@/components/KbValidator";

export const dynamic = "force-dynamic";

export default function KbSettingsPage() {
  const userDir = process.env.RECON_KB_USER_DIR ?? null;

  return (
    <div className="px-8 py-8" style={{ maxWidth: 900, margin: "0 auto" }}>
      <header style={{ marginBottom: 20 }}>
        <div
          className="mono uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          SETTINGS · KB
        </div>
        <h1
          className="font-semibold"
          style={{
            fontSize: 24,
            letterSpacing: "-0.02em",
            margin: "4px 0 8px",
          }}
        >
          KB editor
        </h1>
        <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>
          Paste a YAML KB entry to validate it against the schema before
          dropping it into your user KB directory. The file system watcher
          picks up edits to existing files automatically; saving here also
          invalidates the in-memory cache so this engagement view sees the
          change immediately.
        </p>
      </header>

      <KbValidator userDir={userDir} />
    </div>
  );
}
