/**
 * StructuredScriptOutput — UI-11 renderer for NSE script output.
 *
 * Two render branches:
 *   - structured present  → Tailwind <table> showing key/value pairs;
 *                            nested <table key="..."> entries recurse.
 *   - structured absent   → existing PortCard <pre>{output}</pre> fallback,
 *                            preserving the verbatim XSS-safe convention.
 *
 * Used by:
 *   - PortCard.tsx (per-port NSE Script Output section)
 *   - HostScriptCard.tsx (host-level scripts)
 *
 * Security (NON-NEGOTIABLE — SEC-03 / D-20 / TEST-05):
 *   ALL values rendered as React text nodes ({...}). The repo-wide ESLint
 *   rule blocks the React HTML-injection escape hatch entirely. The verbatim
 *   "React text node — XSS safe" comment is preserved in the fallback branch
 *   and added to the table branch so any future grep audit finds both call
 *   sites.
 *
 * RSC-compatible: no "use client", no hooks. Renders as a server component
 * inside PortCard (which IS a client component but accepts RSC children
 * through the React composition model).
 */

import type { ScriptElem, ScriptTable } from "@/lib/parser/types";

interface ScriptProp {
  id: number;
  script_id: string;
  output: string;
  structured?: Array<ScriptElem | ScriptTable>;
}

interface Props {
  script: ScriptProp;
}

function isTable(node: ScriptElem | ScriptTable): node is ScriptTable {
  return "rows" in node;
}

function renderRows(
  nodes: Array<ScriptElem | ScriptTable>,
): React.ReactNode {
  return nodes.map((n, i) =>
    isTable(n) ? (
      <tr key={i} className="border-b border-border/40">
        <td className="border-r border-border/40 px-2 py-1 align-top font-mono text-xs text-muted-foreground">
          {/* React text node — XSS safe (SEC-03, D-20, TEST-05) */}
          {n.key}
        </td>
        <td className="px-2 py-1 align-top">
          <table className="w-full border-collapse text-xs">
            <tbody>{renderRows(n.rows)}</tbody>
          </table>
        </td>
      </tr>
    ) : (
      <tr key={i} className="border-b border-border/40">
        <td className="border-r border-border/40 px-2 py-1 align-top font-mono text-xs text-muted-foreground">
          {/* React text node — XSS safe (SEC-03, D-20, TEST-05) */}
          {n.key}
        </td>
        <td className="px-2 py-1 align-top font-mono text-xs text-foreground">
          {/* React text node — XSS safe (SEC-03, D-20, TEST-05) */}
          {n.value}
        </td>
      </tr>
    ),
  );
}

export function StructuredScriptOutput({ script }: Props) {
  const hasStructured = script.structured && script.structured.length > 0;
  // v2.1.1 defensive — skip the empty <pre> fallback when neither
  // structured data nor a non-empty output string is present. Caused
  // ~40px of dead vertical space on host-level findings before the
  // text-parser indent fix landed (and stays as a guard if any new
  // parser path produces an empty-body script).
  const hasOutput = script.output.trim().length > 0;

  return (
    <div>
      <span className="text-xs font-semibold text-foreground">
        {script.script_id}:
      </span>
      {hasStructured ? (
        <table className="mt-1 w-full border-collapse rounded bg-[var(--code-surface)] text-xs">
          <tbody>{renderRows(script.structured!)}</tbody>
        </table>
      ) : hasOutput ? (
        <pre className="mt-0.5 whitespace-pre-wrap break-words rounded bg-[var(--code-surface)] px-2 py-1 font-mono text-xs leading-snug text-muted-foreground">
          {/* React text node — XSS safe (SEC-03, D-20, TEST-05) */}
          {script.output}
        </pre>
      ) : null}
    </div>
  );
}
