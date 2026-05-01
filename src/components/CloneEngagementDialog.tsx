"use client";

/**
 * CloneEngagementDialog — shadcn AlertDialog for the "duplicate engagement"
 * path. Replaces the legacy unconditional "(copy)" suffix so the operator
 * can pick a meaningful name (e.g. "acme-prod-retest") without a follow-up
 * rename round-trip.
 *
 * Pre-fills the input with `${sourceName} (copy)` to match prior behavior;
 * clearing the field falls back to the API default on the server. Open
 * state is parent-owned (mirrors DeleteEngagementDialog).
 */

import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CloneEngagementDialogProps {
  engagementId: number;
  sourceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after a 200 from POST /clone with the new engagement id. */
  onCloned: (newId: number) => void;
}

export function CloneEngagementDialog({
  engagementId,
  sourceName,
  open,
  onOpenChange,
  onCloned,
}: CloneEngagementDialogProps) {
  const [name, setName] = useState(`${sourceName} (copy)`);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(`${sourceName} (copy)`);
      // Defer focus until the dialog has actually mounted in the DOM.
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
      return () => clearTimeout(t);
    }
  }, [open, sourceName]);

  async function confirmClone() {
    setPending(true);
    try {
      const trimmed = name.trim();
      const body = trimmed.length > 0 ? { name: trimmed } : {};
      const res = await fetch(`/api/engagements/${engagementId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Duplicate failed.");
        return;
      }
      const payload = await res.json().catch(() => ({}));
      toast.success("Engagement duplicated");
      onOpenChange(false);
      if (typeof payload.id === "number") onCloned(payload.id);
    } catch {
      toast.error("Duplicate failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle
            className="flex items-center gap-2"
            style={{ color: "var(--fg)" }}
          >
            <Copy
              size={16}
              style={{ color: "var(--accent)", flexShrink: 0 }}
            />
            Duplicate engagement
          </AlertDialogTitle>
          <AlertDialogDescription
            style={{ color: "var(--fg-muted)", lineHeight: 1.55 }}
          >
            Deep-copies hosts, ports, scripts, evidence, findings, and check
            states from{" "}
            <span
              className="mono"
              style={{ color: "var(--fg)", fontWeight: 500 }}
            >
              {sourceName}
            </span>
            . Pick a name for the new engagement.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5" style={{ marginTop: 4 }}>
          <label
            htmlFor="clone-engagement-name"
            className="mono"
            style={{ fontSize: 11, color: "var(--fg-muted)" }}
          >
            Name
          </label>
          <input
            ref={inputRef}
            id="clone-engagement-name"
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !pending) {
                ev.preventDefault();
                void confirmClone();
              }
            }}
            disabled={pending}
            maxLength={120}
            placeholder={`${sourceName} (copy)`}
            style={{
              padding: "8px 10px",
              borderRadius: 5,
              border: "1px solid var(--border)",
              background: "var(--bg-0)",
              color: "var(--fg)",
              fontSize: 13,
              outline: "none",
            }}
          />
          <span
            className="mono"
            style={{ fontSize: 10.5, color: "var(--fg-faint)" }}
          >
            Leave blank to use the default (&quot;{sourceName} (copy)&quot;).
          </span>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(ev) => {
              ev.preventDefault();
              void confirmClone();
            }}
            disabled={pending}
            style={{
              background: "var(--accent)",
              color: "#05170d",
              borderColor: "var(--accent)",
            }}
          >
            {pending ? "Duplicating…" : "Duplicate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
