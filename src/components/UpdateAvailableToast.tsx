"use client";

/**
 * UpdateAvailableToast — v1.9.0 notify-only update prompt.
 *
 * Side-effect-only client island mounted in (app)/layout. On mount it
 * fires GET /api/update-check exactly once per browser session
 * (sessionStorage dedupe key). When the route reports a newer release,
 * sonner toasts the tag with a "Release notes" link and a one-shot
 * "How to upgrade" hint.
 *
 * Honors the toggle entirely on the server — when `app_state.update_check`
 * is OFF the route returns `{ enabled: false }` and this component
 * silently no-ops.
 */

import { useEffect } from "react";
import { toast } from "sonner";

const SESSION_KEY = "recon-deck:update-toast-shown";

interface UpdatePayload {
  enabled: boolean;
  current: string;
  latest?: string;
  hasUpdate?: boolean;
  url?: string;
}

export function UpdateAvailableToast() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
    // NOTE: don't set the dedupe key up-front — only mark "shown" once a
    // toast actually fires. Otherwise toggling the auto-check on after a
    // page that fetched while it was off would silently swallow the
    // toast for the rest of the session, and the user has no way to
    // recover except a hard browser restart. The fetch itself is cheap
    // (server-side cache + sessionStorage scope), so re-firing it on
    // navigation is fine until something is actually shown.

    const ac = new AbortController();
    fetch("/api/update-check", { signal: ac.signal })
      .then((r) => r.json() as Promise<UpdatePayload>)
      .then((data) => {
        if (!data.enabled || !data.hasUpdate || !data.latest) return;
        sessionStorage.setItem(SESSION_KEY, "1");
        toast(`v${data.latest} available`, {
          description:
            "Re-run the install one-liner (or git pull for local dev) to upgrade — your data stays.",
          duration: 12000,
          action: data.url
            ? {
                label: "Release notes",
                onClick: () => window.open(data.url, "_blank", "noopener,noreferrer"),
              }
            : undefined,
        });
      })
      .catch(() => {
        /* network errors are silent — recon-deck is offline-by-default */
      });

    return () => ac.abort();
  }, []);

  return null;
}
