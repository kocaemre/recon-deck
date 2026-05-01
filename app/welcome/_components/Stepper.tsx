"use client";

/**
 * Stepper — horizontal 4-step progress + jump-back-to-done (v1.9.0).
 *
 * Spec from design_handoff_onboarding/README.md:
 *   - done   (id < current): accent-bg square with check icon, accent border
 *   - active (id === current): bg-1 square with the number, fg label
 *   - future (id > current): bg-2 square, fg-subtle label
 * Connecting hairline is accent-border when the prior step is done.
 * Done steps are clickable; active/future are inert.
 */

import { Check } from "lucide-react";

export interface StepDef {
  id: 1 | 2 | 3 | 4;
  label: string;
}

export const STEPS: StepDef[] = [
  { id: 1, label: "Scope" },
  { id: 2, label: "Tour" },
  { id: 3, label: "Paths" },
  { id: 4, label: "Updates" },
];

export function Stepper({
  current,
  onJump,
}: {
  current: 1 | 2 | 3 | 4;
  onJump?: (id: 1 | 2 | 3 | 4) => void;
}) {
  return (
    <div className="flex items-center" style={{ gap: 0 }}>
      {STEPS.map((s, i) => {
        const done = s.id < current;
        const active = s.id === current;
        const future = s.id > current;
        return (
          <div key={s.id} className="flex items-center">
            <button
              type="button"
              onClick={done ? () => onJump?.(s.id) : undefined}
              disabled={!done}
              className="flex items-center"
              style={{
                gap: 8,
                padding: "6px 10px",
                borderRadius: 5,
                background: active ? "var(--bg-3)" : "transparent",
                border: active
                  ? "1px solid var(--border-strong)"
                  : "1px solid transparent",
                color: active
                  ? "var(--fg)"
                  : done
                    ? "var(--fg-muted)"
                    : "var(--fg-subtle)",
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                cursor: done ? "pointer" : "default",
                opacity: future ? 0.7 : 1,
              }}
            >
              <span
                className="grid place-items-center"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 3,
                  background: done
                    ? "var(--accent-bg)"
                    : active
                      ? "var(--bg-1)"
                      : "var(--bg-2)",
                  border: `1px solid ${done ? "var(--accent-border)" : "var(--border)"}`,
                  color: done ? "var(--accent)" : "var(--fg-muted)",
                  fontSize: 10.5,
                }}
              >
                {done ? <Check size={10} strokeWidth={3} /> : s.id}
              </span>
              <span>{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  width: 28,
                  height: 1,
                  background:
                    s.id < current
                      ? "var(--accent-border)"
                      : "var(--border)",
                  margin: "0 4px",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
