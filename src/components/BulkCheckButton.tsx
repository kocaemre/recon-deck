"use client";

/**
 * BulkCheckButton — "Check all / Uncheck all" header shortcut (#1).
 *
 * Three states driven by checkedCount vs total:
 *   0 / N     → "Check all"
 *   N / N     → "Uncheck all"
 *   anything  → "Check all" (fills the gaps)
 *
 * Server action wraps the whole batch in a transaction so toggling 12
 * checks fires one revalidate, not twelve. No optimistic state — the
 * RSC re-render after revalidatePath repaints the per-row checkboxes
 * fast enough for a single-click bulk action.
 */

import { useTransition } from "react";
import { setAllChecksForPort } from "../../app/(app)/engagements/[id]/actions";

export function BulkCheckButton({
  engagementId,
  portId,
  checkKeys,
  checkedCount,
}: {
  engagementId: number;
  portId: number;
  checkKeys: ReadonlyArray<string>;
  checkedCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const total = checkKeys.length;
  if (total === 0) return null;

  const allChecked = checkedCount === total;
  const label = allChecked ? "Uncheck all" : "Check all";
  const next = !allChecked;

  function onClick() {
    startTransition(async () => {
      await setAllChecksForPort(engagementId, portId, [...checkKeys], next);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      style={{
        fontSize: 10.5,
        padding: "2px 8px",
        height: 20,
        borderRadius: 4,
        background: "var(--bg-2)",
        color: "var(--fg-muted)",
        border: "1px solid var(--border)",
        cursor: pending ? "not-allowed" : "pointer",
        opacity: pending ? 0.5 : 1,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        fontWeight: 500,
      }}
    >
      {label}
    </button>
  );
}
