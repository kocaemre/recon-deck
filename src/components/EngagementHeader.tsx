"use client";

/**
 * Engagement header bar (Phase 4, Plan 04-05 Task 1; Phase 6, Plan 06-06 Task 2).
 *
 * Displays engagement name, inline-editable target IP/hostname,
 * port count, global progress bar, and an Export dropdown menu with
 * Markdown / JSON / HTML download items plus a Print / PDF item that opens
 * the print-optimized `/engagements/[id]/report` route in a new tab.
 *
 * Design refs: D-12 (header bar layout), INPUT-03 (target edit),
 * CD-06 (copywriting), UI-05 (progress bar),
 * Phase 6 D-01/D-02/D-03/D-04 (Export dropdown UX + toast feedback).
 *
 * Target IP validates non-empty on blur — restores previous value
 * and shows inline error per Copywriting Contract.
 */

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProgressBar } from "@/components/ProgressBar";
import { updateEngagementTarget } from "../../app/engagements/[id]/actions";

interface EngagementHeaderProps {
  engagementId: number;
  name: string;
  targetIp: string;
  targetHostname: string | null;
  portCount: number;
  totalChecks: number;
  doneChecks: number;
}

export function EngagementHeader({
  engagementId,
  name,
  targetIp,
  targetHostname,
  portCount,
  totalChecks,
  doneChecks,
}: EngagementHeaderProps) {
  const [ip, setIp] = useState(targetIp);
  const [hostname, setHostname] = useState(targetHostname ?? "");
  const [ipError, setIpError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const prevIpRef = useRef(targetIp);
  const prevHostnameRef = useRef(targetHostname ?? "");

  // NOTE (v1 acceptable): Both IP and Hostname inputs trigger handleTargetSave
  // on blur. When the user edits IP then tabs to hostname, blur fires with the
  // new IP + old hostname. When the user then clicks away, blur fires again with
  // new IP + new hostname. The short-circuit check (trimmedIp === prevIpRef etc.)
  // prevents redundant saves when nothing changed, but when both fields are edited
  // the first blur persists an intermediate state that the second blur immediately
  // overwrites. This results in two sequential server action calls — functionally
  // correct in the end, just slightly chatty. A debounced form-level save would
  // eliminate this, but is deferred to a future polish pass.
  async function handleTargetSave() {
    const trimmedIp = ip.trim();
    if (!trimmedIp) {
      setIpError("Target cannot be empty.");
      setIp(prevIpRef.current);
      return;
    }
    setIpError(null);

    if (
      trimmedIp === prevIpRef.current &&
      hostname.trim() === prevHostnameRef.current
    ) {
      return; // No change
    }

    setSaving(true);
    try {
      await updateEngagementTarget(
        engagementId,
        trimmedIp,
        hostname.trim() || null,
      );
      prevIpRef.current = trimmedIp;
      prevHostnameRef.current = hostname.trim();
      router.refresh();
    } catch {
      setIp(prevIpRef.current);
      setHostname(prevHostnameRef.current);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  }

  // Download helper: fetch the server-generated export, create an object URL,
  // trigger anchor-click, revoke URL, fire success toast. Co-located with the
  // DropdownMenu because `targetIp` and `engagementId` are already in scope
  // here; a separate helper module would require threading both through
  // parameters without any additional reuse benefit today.
  async function downloadExport(format: "markdown" | "json" | "html") {
    try {
      const res = await fetch(
        `/api/engagements/${engagementId}/export/${format}`,
      );
      if (!res.ok) {
        toast.error("Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Content-Disposition filename is authoritative for downloads in modern
      // Chrome/Firefox, but passing `a.download` as fallback mirrors D-21 so
      // the user sees the same filename even if the header is stripped by a
      // middlebox (rare, but zero-cost belt-and-braces).
      const ext = format === "markdown" ? "md" : format;
      a.download = `${targetIp}-${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a); // required for Firefox to honor the click
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      // D-04: success toast mirrors Phase 4 D-14 "Copied!" pattern.
      const label =
        format === "markdown" ? "Markdown" : format === "json" ? "JSON" : "HTML";
      toast.success(`${label} exported`);
    } catch {
      toast.error("Export failed.");
    }
  }

  function openPrintReport() {
    // window.open per D-03 — the intent is "new tab" so the user keeps the
    // engagement page intact. router.push cannot open new tabs (it navigates
    // the current tab), and <Link target="_blank"> would require changing the
    // dropdown item surface. `noopener,noreferrer` is the T-06-16 mitigation
    // (tab-nabbing): it prevents the new tab from reaching `window.opener`
    // and from sending a Referer header.
    window.open(
      `/engagements/${engagementId}/report`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div className="space-y-3 border-b border-border px-6 pb-4 pt-6">
      {/* Row 1: Name + Export dropdown */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-foreground">{name}</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => downloadExport("markdown")}>
              Markdown (.md)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => downloadExport("json")}>
              JSON (.json)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => downloadExport("html")}>
              HTML (.html)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={openPrintReport}>
              Print / PDF…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Row 2: Target IP + Hostname inputs */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Target IP</label>
          <Input
            value={ip}
            onChange={(e) => {
              setIp(e.target.value);
              setIpError(null);
            }}
            onBlur={handleTargetSave}
            onKeyDown={handleKeyDown}
            placeholder="e.g. 10.10.10.1 or target.htb"
            className="mt-1 font-mono text-sm"
            disabled={saving}
          />
          {ipError && (
            <p className="mt-1 text-xs text-destructive">{ipError}</p>
          )}
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Hostname</label>
          <Input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            onBlur={handleTargetSave}
            onKeyDown={handleKeyDown}
            placeholder="optional"
            className="mt-1 font-mono text-sm"
            disabled={saving}
          />
        </div>
        <div className="pt-5 text-sm text-muted-foreground">
          {portCount} {portCount === 1 ? "port" : "ports"}
        </div>
      </div>

      {/* Row 3: Progress bar */}
      <ProgressBar total={totalChecks} done={doneChecks} portCount={portCount} />
    </div>
  );
}
