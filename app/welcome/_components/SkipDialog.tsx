"use client";

/**
 * SkipDialog — confirmation modal for "Skip configuration…" on Step 3.
 *
 * Steps 1, 2, 4 use a plain skip link (one click); step 3 is the only
 * place where a hasty exit costs the operator something (their path
 * config) so it gets a confirm dialog. Per the design spec the skip
 * button is *not* destructive-styled — this isn't dangerous, just
 * worth a beat.
 */

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

export function SkipDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--border-strong)",
          maxWidth: 440,
        }}
      >
        <AlertDialogHeader>
          <div
            className="mono uppercase tracking-[0.08em]"
            style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginBottom: 4 }}
          >
            {"// "}confirm
          </div>
          <AlertDialogTitle style={{ color: "var(--fg)", fontSize: 18 }}>
            Skip the path config?
          </AlertDialogTitle>
          <AlertDialogDescription
            style={{ color: "var(--fg-muted)", lineHeight: 1.6 }}
          >
            recon-deck will use defaults: empty export dir, no user KB, no
            wordlist override. You can edit these any time under{" "}
            <span className="mono" style={{ color: "var(--fg)" }}>
              /settings
            </span>
            .
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep configuring</AlertDialogCancel>
          <AlertDialogAction
            onClick={(ev) => {
              ev.preventDefault();
              onConfirm();
            }}
            style={{
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
            }}
          >
            Skip · use defaults
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
