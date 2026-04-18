"use client";

/**
 * PortCard — collapsible port card with all inner sections (Phase 4, Plan 04-05, Task 2).
 *
 * The central UI element of the engagement detail page. Each open port
 * renders as a card with a colored left border (risk level), showing
 * port/protocol, service, version, and check progress in collapsed state.
 *
 * Expanded state reveals sections in order (D-07):
 *   1. NSE Script Output (if any)
 *   2. Commands (with CopyButton)
 *   3. Checklist (with ChecklistItem)
 *   4. Notes (with NotesField)
 *   5. Resources (with ResourceLink)
 *
 * Design refs: D-06 (collapsed default), D-07 (section order),
 * D-08 (code blocks), D-09 (risk border), UI-01 (port card contract),
 * SEC-03 (XSS-safe NSE rendering via React text nodes).
 */

import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/lib/store";
import { CopyButton } from "@/components/CopyButton";
import { ChecklistItem } from "@/components/ChecklistItem";
import { NotesField } from "@/components/NotesField";
import { ResourceLink } from "@/components/ResourceLink";
import { StructuredScriptOutput } from "@/components/StructuredScriptOutput";
import type { ScriptElem, ScriptTable } from "@/lib/parser/types";

// Risk level -> left border color (D-09)
const RISK_BORDER_COLORS: Record<string, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-amber-400",
  low: "border-l-blue-400",
  info: "border-l-zinc-500",
};

// Risk level -> badge variant color (UI-SPEC)
const RISK_BADGE_COLORS: Record<string, string> = {
  critical: "text-red-400",
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-blue-400",
  info: "text-zinc-400",
};

/** Script output shape — matches PortScript from DB but only the fields we render.
 *  `structured` is added at page-render time (engagement page re-parses raw_input
 *  and merges structured `<elem>`/`<table>` data — UI-11). Optional: undefined
 *  for paste source, sample engagements, or scripts without elem/table children. */
interface ScriptData {
  id: number;
  script_id: string;
  output: string;
  structured?: Array<ScriptElem | ScriptTable>;
}

/** Check state shape — matches CheckState from DB but only the fields we read. */
interface CheckData {
  check_key: string;
  checked: boolean;
}

/** Note shape — matches PortNote from DB but only the fields we read. */
interface NoteData {
  body: string;
}

interface PortCardProps {
  engagementId: number;
  portId: number;
  port: number;
  protocol: string;
  state: string;
  service: string | null;
  product: string | null;
  version: string | null;
  scripts: ScriptData[];
  checks: CheckData[];
  notes: NoteData | null;
  // Pre-computed from KB (RSC does the server-side KB matching and interpolation)
  kbCommands: Array<{ label: string; command: string }>;
  kbChecks: Array<{ key: string; label: string }>;
  kbResources: Array<{ title: string; url: string }>;
  risk: string;
  // AutoRecon-specific data (only present for AutoRecon-sourced engagements).
  // arFiles: per-port service file outputs (scans/tcp_<port>_<service>_*) — D-04, D-05.
  // arCommands: manual commands from _manual_commands.txt with {IP}/{PORT}/{HOST}
  //             already interpolated server-side (D-06, D-08).
  arFiles?: Array<{ filename: string; content: string }>;
  arCommands?: Array<{ label: string; command: string }>;
}

export function PortCard({
  engagementId,
  portId,
  port,
  protocol,
  state,
  service,
  product,
  version,
  scripts,
  checks,
  notes,
  kbCommands,
  kbChecks,
  kbResources,
  risk,
  arFiles = [],
  arCommands = [],
}: PortCardProps) {
  const isExpanded = useUIStore((s) => s.expandedPorts.has(portId));
  const togglePort = useUIStore((s) => s.togglePort);

  // Build check state lookup
  const checkMap = new Map(checks.map((c) => [c.check_key, c.checked]));
  const totalChecks = kbChecks.length;
  const doneChecks = kbChecks.filter(
    (c) => checkMap.get(c.key) === true,
  ).length;

  // Version display
  const versionText = [product, version].filter(Boolean).join(" ");

  return (
    <Card
      className={cn(
        "border-l-4 bg-card",
        RISK_BORDER_COLORS[risk] ?? "border-l-zinc-500",
      )}
    >
      {/* Collapsed header — always visible. Clickable to expand/collapse (D-06) */}
      <button
        type="button"
        onClick={() => togglePort(portId)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={isExpanded}
      >
        {/* Port badge */}
        <Badge variant="outline" className="shrink-0 font-mono text-xs">
          {port}/{protocol}
        </Badge>

        {/* Service + version */}
        <span className="flex-1 truncate text-sm font-semibold text-foreground">
          {service ?? "unknown"}
          {versionText && (
            <span className="ml-2 font-normal text-muted-foreground">
              {versionText}
            </span>
          )}
        </span>

        {/* Risk badge */}
        <Badge
          variant="outline"
          className={cn("shrink-0 text-xs", RISK_BADGE_COLORS[risk])}
        >
          {risk}
        </Badge>

        {/* Check progress */}
        {totalChecks > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground">
            [{doneChecks}/{totalChecks}]
          </span>
        )}

        {/* Chevron — rotates on expand */}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-in-out",
            isExpanded && "rotate-180",
          )}
        />
      </button>

      {/* Expanded content — D-07 section order: NSE Scripts -> Commands -> Checklist -> Notes -> Resources */}
      {isExpanded && (
        <div className="space-y-4 px-4 pb-4">
          <Separator />

          {/* NSE Script Output (if any) — never HTML, always text nodes (SEC-03) */}
          {scripts.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-normal uppercase tracking-wider text-muted-foreground">
                NSE Script Output
              </h3>
              <div className="space-y-2">
                {scripts.map((s) => (
                  <StructuredScriptOutput key={s.id} script={s} />
                ))}
              </div>
            </section>
          )}

          {/* AutoRecon Files — D-04: after NSE Scripts, before Commands. Default collapsed. */}
          {arFiles.length > 0 && (
            <Collapsible>
              <section>
                <CollapsibleTrigger className="flex w-full items-center gap-1 text-left">
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 ease-in-out [[data-state=open]>&]:rotate-90" />
                  <h3 className="text-xs font-normal uppercase tracking-wider text-muted-foreground">
                    AutoRecon Files ({arFiles.length}{" "}
                    {arFiles.length === 1 ? "file" : "files"})
                  </h3>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-3">
                    {arFiles.map((f, i) => (
                      <div key={i}>
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {f.filename}
                        </span>
                        <pre className="mt-1 max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded bg-[var(--code-surface)] p-2 font-mono text-xs text-muted-foreground">
                          {/* React text node — XSS safe (SEC-03, T-05-13). Full content stored per D-05. */}
                          {f.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </section>
            </Collapsible>
          )}

          {/* Commands */}
          {kbCommands.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-normal uppercase tracking-wider text-muted-foreground">
                Commands
              </h3>
              <div className="space-y-2">
                {kbCommands.map((cmd, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded bg-[var(--code-surface)] p-2"
                  >
                    <div className="flex-1 overflow-x-auto">
                      <p className="text-xs text-muted-foreground">
                        {cmd.label}
                      </p>
                      <code className="font-mono text-xs text-foreground">
                        {cmd.command}
                      </code>
                    </div>
                    <CopyButton text={cmd.command} label={cmd.command} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* AutoRecon Commands — D-06: after KB Commands. {IP}/{PORT}/{HOST} already interpolated server-side (D-08). */}
          {arCommands.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-normal uppercase tracking-wider text-muted-foreground">
                AutoRecon Commands
              </h3>
              <div className="space-y-2">
                {arCommands.map((cmd, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded bg-[var(--code-surface)] p-2"
                  >
                    <div className="flex-1 overflow-x-auto">
                      <p className="text-xs text-muted-foreground">
                        {cmd.label}
                      </p>
                      <code className="font-mono text-xs text-foreground">
                        {cmd.command}
                      </code>
                    </div>
                    <CopyButton text={cmd.command} label={cmd.command} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Checklist — UI-02 */}
          {kbChecks.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-normal uppercase tracking-wider text-muted-foreground">
                Checklist
              </h3>
              <div>
                {kbChecks.map((check) => (
                  <ChecklistItem
                    key={check.key}
                    engagementId={engagementId}
                    portId={portId}
                    checkKey={check.key}
                    initialChecked={checkMap.get(check.key) === true}
                    label={check.label}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Notes — UI-04 */}
          <section>
            <h3 className="mb-2 text-xs font-normal uppercase tracking-wider text-muted-foreground">
              Notes
            </h3>
            <NotesField
              engagementId={engagementId}
              portId={portId}
              initialBody={notes?.body ?? ""}
            />
          </section>

          {/* Resources — SEC-04 */}
          {kbResources.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-normal uppercase tracking-wider text-muted-foreground">
                Resources
              </h3>
              <ul className="space-y-1">
                {kbResources.map((r, i) => (
                  <li key={i}>
                    <ResourceLink href={r.url} label={r.title} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
