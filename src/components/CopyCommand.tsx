"use client";

/**
 * CopyCommand — a single shell command in a mono pill with a one-click copy
 * button. Shared by the paste "how to scan" helper, the onboarding wordlist
 * step, and the Settings SecLists-install nudge so the copy affordance looks
 * and behaves the same everywhere.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyCommand({
  command,
  label,
}: {
  command: string;
  /** Optional caption rendered above the command. */
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the command is still selectable in the field */
    }
  }

  return (
    <div className="mt-2 first:mt-0">
      {label && (
        <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginBottom: 4 }}>
          {label}
        </div>
      )}
      <div
        className="flex items-center gap-2"
        style={{
          padding: "7px 8px 7px 12px",
          borderRadius: 5,
          background: "var(--code, var(--bg-2))",
          border: "1px solid var(--border)",
        }}
      >
        <code
          className="mono"
          style={{
            flex: 1,
            fontSize: 12,
            color: "var(--fg)",
            overflowX: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy command"
          className="inline-flex items-center gap-1 shrink-0"
          style={{
            padding: "3px 8px",
            borderRadius: 4,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            color: copied ? "var(--accent)" : "var(--fg-muted)",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** The two canonical ways to install SecLists, reused by every nudge. */
export const SECLISTS_INSTALL = {
  apt: "sudo apt install seclists",
  git: "git clone https://github.com/danielmiessler/SecLists /usr/share/seclists",
} as const;
