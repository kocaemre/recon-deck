"use client";

/**
 * OnboardingSettingsSection — v1.9.0 settings rows.
 *
 * Two controls bundled together because they share the same conceptual
 * surface ("first-run / install-wide preferences"):
 *
 *   • Replay onboarding — clears app_state.onboarded_at and redirects to
 *     /welcome. Useful for showing a teammate around or resetting paths.
 *   • Check GitHub for updates — flips app_state.update_check. When on,
 *     UpdateAvailableToast fires once per app boot.
 *
 * The component is a client island purely so the toggle can give an
 * optimistic UI (the action revalidates /settings, but the input state
 * needs to feel instant). Replay uses a plain `<form action>` so Next.js
 * handles the redirect transition for us.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  replayOnboardingAction,
  setUpdateCheckAction,
} from "../../app/(app)/settings/_actions";

export function OnboardingSettingsSection({
  initialUpdateCheck,
  currentVersion,
}: {
  initialUpdateCheck: boolean;
  currentVersion: string;
}) {
  const [updateCheck, setUpdateCheck] = useState(initialUpdateCheck);
  const [checking, setChecking] = useState(false);
  const [, startTransition] = useTransition();

  function handleToggle(next: boolean) {
    const prev = updateCheck;
    setUpdateCheck(next);
    startTransition(async () => {
      try {
        await setUpdateCheckAction(next);
      } catch {
        setUpdateCheck(prev);
        toast.error("Could not save preference.");
      }
    });
  }

  // Manual "Check now" — bypasses both the auto-check toggle and the
  // 1-hour process cache via ?force=1, hits api.github.com once, toasts
  // the result. Useful for operators who want to test the version check
  // without flipping the toggle on.
  async function checkNow() {
    if (checking) return;
    setChecking(true);
    try {
      const res = await fetch("/api/update-check?force=1");
      const data = (await res.json()) as {
        latest?: string;
        hasUpdate?: boolean;
        url?: string;
      };
      if (data.hasUpdate && data.latest) {
        toast(`v${data.latest} available`, {
          description:
            "Re-run the install one-liner (or git pull for local dev) to upgrade — your data stays.",
          duration: 12000,
          action: data.url
            ? {
                label: "Release notes",
                onClick: () =>
                  window.open(data.url, "_blank", "noopener,noreferrer"),
              }
            : undefined,
        });
      } else if (data.latest) {
        toast.success(`You're on the latest version (v${data.latest}).`);
      } else {
        toast.message(
          "Could not reach api.github.com. Check your connection or try again later.",
        );
      }
    } catch {
      toast.error("Update check failed.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--bg-2)",
      }}
    >
      {/* Update-check toggle + manual "Check now" */}
      <div className="flex items-start gap-3">
        <label
          className="flex items-start gap-3"
          style={{ cursor: "pointer", flex: 1 }}
        >
          <input
            type="checkbox"
            checked={updateCheck}
            onChange={(e) => handleToggle(e.target.checked)}
            style={{ accentColor: "var(--accent)", marginTop: 3 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              Check GitHub for new releases
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: "var(--fg-muted)",
                lineHeight: 1.5,
              }}
            >
              Once at startup, recon-deck pings{" "}
              <code className="mono">
                api.github.com/repos/kocaemre/recon-deck/releases/latest
              </code>
              . Notify-only — installs are manual (
              <code className="mono">docker pull</code> or{" "}
              <code className="mono">git pull</code>).
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 11.5,
                color: "var(--fg-faint)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Currently running <span style={{ color: "var(--fg-muted)" }}>v{currentVersion}</span>
            </div>
          </div>
        </label>
        <button
          type="button"
          onClick={checkNow}
          disabled={checking}
          style={{
            height: 28,
            padding: "0 12px",
            borderRadius: 5,
            background: "var(--bg-1)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            fontSize: 12,
            fontWeight: 500,
            cursor: checking ? "wait" : "pointer",
            opacity: checking ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {checking ? "Checking…" : "Check now"}
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid var(--border)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600 }}>Replay onboarding</div>
        <div
          style={{
            marginTop: 4,
            marginBottom: 10,
            fontSize: 12,
            color: "var(--fg-muted)",
            lineHeight: 1.5,
          }}
        >
          Clears <code className="mono">onboarded_at</code> and reopens the
          4-step welcome flow. Saved paths are preserved.
        </div>
        <form action={replayOnboardingAction}>
          <button
            type="submit"
            style={{
              height: 28,
              padding: "0 12px",
              borderRadius: 5,
              background: "var(--bg-1)",
              color: "var(--fg)",
              border: "1px solid var(--border)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Replay onboarding…
          </button>
        </form>
      </div>
    </div>
  );
}
