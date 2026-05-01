"use client";

/**
 * DeleteEngagementDialog — shadcn AlertDialog for the destructive
 * "delete engagement" path.
 *
 * Used by the sidebar hover-kebab and the command palette so both
 * surfaces share one confirmation UI. The previous implementation
 * leaned on `window.confirm()`, which (1) blocks the entire main
 * thread, (2) cannot be themed, and (3) is invisible to the
 * Chrome-MCP browser tooling we use for live smoke tests. The Radix
 * `AlertDialog` keeps focus trapped, returns to the trigger on
 * close, and renders inside the page so we can screenshot it.
 *
 * Controlled by `open` / `onOpenChange` so the parent owns the open
 * state. `onDeleted` fires after a successful 200 from the DELETE
 * route, before any router navigation, so the parent decides whether
 * to push to "/" (active engagement removed) or just refresh.
 */

import { useState } from "react";
import { Trash2 } from "lucide-react";
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

interface DeleteEngagementDialogProps {
  engagementId: number;
  engagementName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after a 200 from the DELETE route. Parent does the navigation. */
  onDeleted: () => void;
}

export function DeleteEngagementDialog({
  engagementId,
  engagementName,
  open,
  onOpenChange,
  onDeleted,
}: DeleteEngagementDialogProps) {
  const [pending, setPending] = useState(false);

  async function confirmDelete() {
    setPending(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Delete failed.");
        return;
      }
      toast.success("Engagement deleted");
      onOpenChange(false);
      onDeleted();
    } catch {
      toast.error("Delete failed.");
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
            <Trash2
              size={16}
              style={{ color: "var(--risk-crit)", flexShrink: 0 }}
            />
            Move to recycle bin?
          </AlertDialogTitle>
          <AlertDialogDescription
            style={{ color: "var(--fg-muted)", lineHeight: 1.55 }}
          >
            <span
              className="mono"
              style={{ color: "var(--fg)", fontWeight: 500 }}
            >
              {engagementName}
            </span>
            {" "}will disappear from the sidebar and global search.
            Restore (or permanently purge) from{" "}
            <em>Settings → Recently deleted</em>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(ev) => {
              // Stop the default close-on-action behavior so we keep
              // the dialog up while the network round-trip resolves;
              // confirmDelete closes it manually on success.
              ev.preventDefault();
              void confirmDelete();
            }}
            disabled={pending}
            style={{
              background: "var(--risk-crit)",
              color: "#fff",
              borderColor: "var(--risk-crit)",
            }}
          >
            {pending ? "Moving…" : "Move to recycle bin"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
