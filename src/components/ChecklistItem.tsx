"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleCheck } from "../../app/engagements/[id]/actions";

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
        // D-15: API failure silently reverts — useOptimistic auto-reverts
        // when the transition completes with the original server state
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="flex min-h-11 w-full items-center gap-3 rounded px-2 text-left transition-colors hover:bg-muted/50"
      role="checkbox"
      aria-checked={optimisticChecked}
    >
      {/* Custom checkbox visual — 16px square, 2px rounded */}
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-2 transition-colors",
          optimisticChecked
            ? "border-green-500 bg-green-500"
            : "border-zinc-600 bg-transparent",
        )}
      >
        {optimisticChecked && (
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        )}
      </span>

      {/* Check label */}
      <span
        className={cn(
          "text-sm",
          optimisticChecked
            ? "text-muted-foreground line-through"
            : "text-foreground",
        )}
      >
        {label}
      </span>
    </button>
  );
}
