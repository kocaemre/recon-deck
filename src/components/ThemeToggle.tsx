"use client";

/**
 * ThemeToggle — tri-state (system / dark / light) radio that persists to
 * app_state.theme via the setThemeAction server action.
 *
 * Optimistic UI: we flip the `<html>` className client-side on click for
 * instant feedback, then call the action which revalidates the layout so
 * the SSR class on next nav matches. The pre-paint script in the root
 * layout reads app_state on every server render so OS-prefers changes
 * survive a refresh.
 *
 * Component is a client island purely for the optimistic class flip and
 * useTransition affordance. Persistence stays server-authoritative.
 */

import { useState, useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { setThemeAction } from "../../app/(app)/settings/_actions";
import type { ThemeMode } from "../lib/db/app-state-repo";

const OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  icon: typeof Sun;
  description: string;
}> = [
  {
    value: "system",
    label: "System",
    icon: Monitor,
    description: "Follow the OS prefers-color-scheme setting.",
  },
  {
    value: "dark",
    label: "Dark",
    icon: Moon,
    description: "Always dark — original recon-deck palette.",
  },
  {
    value: "light",
    label: "Light",
    icon: Sun,
    description: "Always light — paired-pentest demos, screen share.",
  },
];

function applyClassOptimistic(value: ThemeMode) {
  const html = document.documentElement;
  html.classList.remove("dark", "light");
  if (value === "dark" || value === "light") {
    html.classList.add(value);
  } else {
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    html.classList.add(prefersLight ? "light" : "dark");
  }
  html.dataset.themePref = value;
}

export function ThemeToggle({ initial }: { initial: ThemeMode }) {
  const [theme, setTheme] = useState<ThemeMode>(initial);
  const [pending, startTransition] = useTransition();

  function pick(value: ThemeMode) {
    if (value === theme) return;
    const prev = theme;
    setTheme(value);
    applyClassOptimistic(value);
    startTransition(async () => {
      try {
        await setThemeAction(value);
      } catch {
        setTheme(prev);
        applyClassOptimistic(prev);
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
      <div
        role="radiogroup"
        aria-label="Theme"
        className="grid grid-cols-3 gap-2"
        style={{ marginBottom: 10 }}
      >
        {OPTIONS.map((opt) => {
          const active = theme === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(opt.value)}
              disabled={pending}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "10px 8px",
                borderRadius: 6,
                border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
                background: active ? "var(--accent-bg)" : "var(--bg-1)",
                color: active ? "var(--accent)" : "var(--fg-muted)",
                cursor: pending ? "wait" : "pointer",
                fontSize: 12,
                fontWeight: 500,
                opacity: pending ? 0.7 : 1,
              }}
            >
              <Icon size={16} />
              {opt.label}
            </button>
          );
        })}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--fg-muted)",
          lineHeight: 1.5,
        }}
      >
        {OPTIONS.find((o) => o.value === theme)?.description}
      </div>
    </div>
  );
}
