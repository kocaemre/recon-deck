"use client";

/**
 * ChecklistItem — custom 14x14 checkbox row (redesign).
 *
 * Uses useOptimistic for snappy toggles; server action reverts silently on failure.
 * Checked state: accent-filled square with dark check glyph; label struck-through
 * and muted. Unchecked: hollow square with strong border.
 */

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { toggleCheck } from "../../app/(app)/engagements/[id]/actions";

interface ChecklistItemProps {
  engagementId: number;
  portId: number;
  checkKey: string;
  initialChecked: boolean;
  label: string;
}

export function ChecklistItem({
  engagementId,
  portId,
  checkKey,
  initialChecked,
  label,
}: ChecklistItemProps) {
  const [optimisticChecked, setOptimistic] = useOptimistic(initialChecked);
  const [, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      setOptimistic(!optimisticChecked);
      try {
        await toggleCheck(engagementId, portId, checkKey, !optimisticChecked);
      } catch {
        /* optimistic revert handled by transition completing with server state */
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      role="checkbox"
      aria-checked={optimisticChecked}
      className="flex w-full items-center gap-2 text-left"
      style={{
        padding: "5px 6px",
        borderRadius: 3,
        background: "transparent",
        border: 0,
        cursor: "pointer",
        color: "inherit",
      }}
    >
      <span
        aria-hidden
        className="grid place-items-center"
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          flexShrink: 0,
          border: `1px solid ${optimisticChecked ? "var(--accent)" : "var(--border-strong)"}`,
          background: optimisticChecked ? "var(--accent)" : "transparent",
          color: "#05170d",
        }}
      >
        {optimisticChecked && <Check size={8} strokeWidth={3} />}
      </span>
      <span
        style={{
          fontSize: 12.5,
          color: optimisticChecked ? "var(--fg-muted)" : "var(--fg)",
          textDecoration: optimisticChecked ? "line-through" : "none",
          textDecorationColor: "var(--fg-faint)",
        }}
      >
        {label}
      </span>
    </button>
  );
}
