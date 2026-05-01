"use client";

/**
 * HostScriptCard — PARSE-03 success criterion 5: render hostscript NSE
 * findings as a DISTINCT host-level card, separate from any port card.
 *
 * Visual distinctness (Pitfall #10 / Anti-Patterns Avoid #10):
 *   - border-l-4 + border-l-purple-500 (not in the port-risk palette).
 *   - Header label "Host-Level Findings".
 *
 * v2.1.1: collapsible. Default OPEN when ≤2 scripts, CLOSED when ≥3 — a
 * 4-script smb host (smb-os-discovery + smb2-security-mode + smb2-time +
 * clock-skew) was eating the entire viewport before the heatmap. Tighter
 * vertical spacing inside both states. Header shows count and chevron.
 *
 * Delegates per-script rendering to <StructuredScriptOutput>.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StructuredScriptOutput } from "@/components/StructuredScriptOutput";
import type { ScriptElem, ScriptTable } from "@/lib/parser/types";

interface HostScriptData {
  id: number;
  script_id: string;
  output: string;
  structured?: Array<ScriptElem | ScriptTable>;
}

interface Props {
  hostScripts: HostScriptData[];
}

export function HostScriptCard({ hostScripts }: Props) {
  const [open, setOpen] = useState(hostScripts.length <= 2);
  if (hostScripts.length === 0) return null;

  const count = hostScripts.length;
  const summary = hostScripts
    .slice(0, 3)
    .map((s) => s.script_id)
    .join(" · ");

  return (
    <Card className="border-l-4 border-l-purple-500 bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={12} className="text-muted-foreground" />
        ) : (
          <ChevronRight size={12} className="text-muted-foreground" />
        )}
        <h3 className="text-xs font-normal uppercase tracking-wider text-muted-foreground">
          Host-Level Findings
        </h3>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">
          {count} {count === 1 ? "script" : "scripts"}
        </span>
        {!open && (
          <span
            className="ml-2 truncate font-mono text-[11px] text-muted-foreground/70"
            title={hostScripts.map((s) => s.script_id).join(", ")}
          >
            {summary}
            {count > 3 ? ` · +${count - 3}` : ""}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-1.5 px-4 pb-3 pt-0">
          {hostScripts.map((hs) => (
            <StructuredScriptOutput key={hs.id} script={hs} />
          ))}
        </div>
      )}
    </Card>
  );
}
