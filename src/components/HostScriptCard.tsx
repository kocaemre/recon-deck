/**
 * HostScriptCard — PARSE-03 success criterion 5: render hostscript NSE
 * findings as a DISTINCT host-level card, separate from any port card.
 *
 * Visual distinctness (Pitfall #10 / Anti-Patterns Avoid #10):
 *   - border-l-4 + border-l-purple-500 (not in the port-risk palette
 *     red/orange/amber/blue/zinc).
 *   - Header label "Host-Level Findings" (not "Host-Level Scripts" — the
 *     word "Findings" reads as a distinct conceptual category).
 *
 * Always expanded for v1.0 (Open Decision #7 — host-script content is
 * typically short, smb-os-discovery is 5–10 lines). Collapsibility deferred
 * to v1.1 if user feedback requests it.
 *
 * Delegates per-script rendering to <StructuredScriptOutput> so smb-os-discovery
 * (and any other script with <elem> children) renders as a structured table
 * when the engagement page has merged in structured data via re-parse.
 *
 * RSC — no "use client", no hooks, no state.
 */

import { Card } from "@/components/ui/card";
import { StructuredScriptOutput } from "@/components/StructuredScriptOutput";
import type { ScriptElem, ScriptTable } from "@/lib/parser/types";

/**
 * Shape this component receives — a PortScript-like row plus an optional
 * structured field merged in at page-render time. Kept narrow on purpose
 * so the page assembly code only has to populate what we actually render.
 */
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
  if (hostScripts.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-purple-500 bg-card">
      <div className="space-y-3 px-4 py-3">
        <h3 className="text-xs font-normal uppercase tracking-wider text-muted-foreground">
          Host-Level Findings
        </h3>
        <div className="space-y-3">
          {hostScripts.map((hs) => (
            <StructuredScriptOutput key={hs.id} script={hs} />
          ))}
        </div>
      </div>
    </Card>
  );
}
