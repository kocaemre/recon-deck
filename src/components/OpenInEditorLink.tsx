"use client";

/**
 * OpenInEditorLink — opt-in vscode:// jump link (v1.4.0 #12).
 *
 * Behaviour:
 *   - Reads `recon-deck.openInEditor.enabled` from localStorage on mount.
 *     Toggle lives in /settings under "Editor integration".
 *   - When enabled, renders an `Open in editor` button that points at
 *     `vscode://file/{base}/{engagement-name}` where `base` comes from
 *     the `NEXT_PUBLIC_RECON_LOCAL_EXPORT_DIR` build-time env (operators
 *     are expected to mirror their actual local export directory there).
 *   - When disabled or no base configured, renders nothing — the link
 *     stays out of muscle memory until the operator opts in.
 *
 * No analytics, no fallback URL — relies on the OS protocol handler.
 * Caveat documented in CHANGELOG.
 */

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

const STORAGE_KEY = "recon-deck.openInEditor.enabled";

interface Props {
  engagementSlug: string;
  /**
   * v1.9.0: localExportDir resolved server-side via effectiveAppState.
   * Wins over the legacy NEXT_PUBLIC_RECON_LOCAL_EXPORT_DIR env var so
   * operators can change the path in /settings without a rebuild.
   */
  localExportDir?: string | null;
}

export function OpenInEditorLink({ engagementSlug, localExportDir }: Props) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      /* SSR / private mode — silent */
    }
  }, []);

  const base = localExportDir ?? process.env.NEXT_PUBLIC_RECON_LOCAL_EXPORT_DIR;
  if (!enabled || !base) return null;

  // Strip a single trailing slash so the join produces exactly one
  // separator regardless of how the env was set.
  const trimmedBase = base.replace(/\/+$/, "");
  // Slugify the engagement name so the URL stays predictable: lowercase,
  // alnum + hyphens. Matches the CLI conventions most operators use
  // when they `mkdir` their per-engagement export folder.
  const slug = engagementSlug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const href = `vscode://file/${trimmedBase}/${slug}`;

  return (
    <a
      href={href}
      title={`Open ${trimmedBase}/${slug} in VS Code`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 4,
        border: "1px solid var(--border)",
        background: "var(--bg-2)",
        color: "var(--fg-muted)",
        fontSize: 11,
        textDecoration: "none",
      }}
    >
      <ExternalLink size={11} />
      Open in editor
    </a>
  );
}

/**
 * Read-only hook for the toggle UI (consumed by Settings page).
 * Persists the new value to localStorage on change.
 */
export function useOpenInEditorPref(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      /* silent */
    }
  }, []);
  function set(next: boolean) {
    setEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* silent */
    }
  }
  return [enabled, set];
}
