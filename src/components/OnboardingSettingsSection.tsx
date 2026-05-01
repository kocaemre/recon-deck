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
}: {
  initialUpdateCheck: boolean;
}) {
  const [updateCheck, setUpdateCheck] = useState(initialUpdateCheck);
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

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--bg-2)",
      }}
    >
      {/* Update-check toggle */}
      <label
        className="flex items-center gap-3"
        style={{ cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={updateCheck}
          onChange={(e) => handleToggle(e.target.checked)}
          style={{ accentColor: "var(--accent)" }}
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
        </div>
      </label>

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
