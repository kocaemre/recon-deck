/**
 * Print-optimized engagement report page — Phase 6, Plan 06-05 Task 3.
 *
 * Renders the same EngagementViewModel as the HTML-export generator (D-16),
 * but as a Next.js 15 RSC using Tailwind `print:` variants so the user can
 * hit Ctrl/Cmd+P and save as PDF through their browser's native print dialog.
 *
 * Design refs:
 *   D-17: renders engagement view model with Tailwind print: variants
 *   D-18: break-inside:avoid-page on each port's <section>
 *   D-19: minimal header on page 1; browser-default page numbers
 *   D-20: normal Next.js page, NOT a download; on-screen banner says
 *         "Press Ctrl/Cmd+P to save as PDF"
 *
 * Security notes:
 *   - React auto-escapes text children (SEC-03), so `escapeHtml` is NOT
 *     needed here — unlike src/lib/export/html.ts which builds a raw string.
 *   - No raw innerHTML sinks anywhere (Phase 4 D-20 ESLint rule +
 *     T-06-13 mitigation).
 *
 * Pitfall 4 mitigation (RESEARCH.md): the port list container uses
 * `print:block` so `break-inside: avoid-page` on each <section> is honoured
 * by Chromium's print engine (flex/grid fragmentation contexts have
 * historically ignored the hint).
 */

import { notFound } from "next/navigation";
import path from "node:path";
import { db, getById, getWordlistOverridesMap } from "@/lib/db";
import { loadKnowledgeBase } from "@/lib/kb";
import { loadEngagementForExport } from "@/lib/export/view-model";

// Load KB once at module level (same pattern as app/engagements/[id]/page.tsx)
const kb = loadKnowledgeBase({
  shippedPortsDir: path.join(process.cwd(), "knowledge", "ports"),
  shippedDefaultFile: path.join(process.cwd(), "knowledge", "default.yaml"),
  userDir: process.env.RECON_KB_USER_DIR ?? undefined,
});

interface PageProps {
  params: Promise<{ id: string }>;
}

// Box-char glyphs (CONTEXT.md specifics — NOT ✓/✗; screen reader inconsistency)
const GLYPH_DONE = "▣";
const GLYPH_PENDING = "□";

export default async function ReportPage({ params }: PageProps) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    notFound();
  }

  const engagement = getById(db, id);
  if (!engagement) {
    notFound();
  }

  // P1-E: thread wordlist overrides through so the printed PDF matches the
  // engagement page's resolved {WORDLIST_*} paths.
  const vm = loadEngagementForExport(engagement, kb, getWordlistOverridesMap(db));
  const eng = vm.engagement;

  // Pre-computed done/total per port for the summary table
  const portRows = vm.ports.map((pd) => {
    const versionText = [pd.port.product, pd.port.version]
      .filter(Boolean)
      .join(" ");
    const done = pd.kbChecks.filter((c) => pd.checkMap.get(c.key) === true)
      .length;
    const total = pd.kbChecks.length;
    return { pd, versionText, done, total };
  });

  return (
    <div className="mx-auto max-w-[900px] px-8 py-8 print:block print:p-0 print:text-black">
      {/* On-screen banner — hidden in print (D-20) */}
      <div className="mb-6 rounded border border-border bg-card p-4 text-sm print:hidden">
        Press <kbd className="rounded border px-1">Ctrl</kbd> /{" "}
        <kbd className="rounded border px-1">Cmd</kbd> +{" "}
        <kbd className="rounded border px-1">P</kbd> to save as PDF. Close this
        tab to return to the engagement.
      </div>

      {/* Header block (D-19 — page 1 only via CSS; same DOM in print) */}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{eng.name}</h1>
        <p className="mt-1 text-sm">
          <strong>Target:</strong>{" "}
          <code className="font-mono">{eng.target_ip}</code>
          {eng.target_hostname ? ` (${eng.target_hostname})` : ""}
        </p>
        {eng.os_name && (
          <p className="text-sm">
            <strong>OS:</strong> {eng.os_name}
          </p>
        )}
        {vm.scanner?.version && (
          <p className="text-sm">
            <strong>nmap:</strong> {vm.scanner.version}
            {vm.scanner.args ? (
              <>
                {" "}
                <code className="font-mono text-xs">{vm.scanner.args}</code>
              </>
            ) : null}
          </p>
        )}
        {vm.runstats?.finishedAt && (
          <p className="text-sm">
            <strong>Finished:</strong> {vm.runstats.finishedAt}
            {vm.runstats.elapsed !== undefined ? ` · ${vm.runstats.elapsed}s` : ""}
          </p>
        )}
        <p className="text-sm">
          <strong>Coverage:</strong> {vm.coverage}% ({vm.doneChecks}/
          {vm.totalChecks})
        </p>
      </header>

      {/* Ports summary table */}
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Ports</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border px-2 py-1 text-left">Port</th>
              <th className="border px-2 py-1 text-left">Proto</th>
              <th className="border px-2 py-1 text-left">Service</th>
              <th className="border px-2 py-1 text-left">Version</th>
              <th className="border px-2 py-1 text-left">Done</th>
            </tr>
          </thead>
          <tbody>
            {portRows.map(({ pd, versionText, done, total }) => (
              <tr key={pd.port.id}>
                <td className="border px-2 py-1">{pd.port.port}</td>
                <td className="border px-2 py-1">{pd.port.protocol}</td>
                <td className="border px-2 py-1">{pd.port.service ?? ""}</td>
                <td className="border px-2 py-1">{versionText}</td>
                <td className="border px-2 py-1">
                  {done}/{total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/*
        Per-port sections. Pitfall 4 mitigation: container is a block flow in
        print context so `print:break-inside-avoid-page` on each <section> is
        honoured by Chromium's fragmentation engine (flex/grid containers have
        historically caused the browser to ignore the fragmentation hint).
      */}
      <div className="print:block">
        {vm.ports.map((pd) => {
          const p = pd.port;
          const versionBits = [p.product, p.version].filter(Boolean).join(" ");
          const notesBody =
            p.notes && p.notes.body.trim() !== "" ? p.notes.body : null;

          return (
            <section
              key={p.id}
              className="mb-8 print:break-inside-avoid-page"
              style={{ breakInside: "avoid-page" }}
            >
              <h2 className="border-b pb-1 text-lg font-semibold">
                Port {p.port}/{p.protocol} — {p.service ?? "unknown"}
                {versionBits && ` (${versionBits})`}
              </h2>

              {/* 1. NSE Output */}
              {pd.nseScripts.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-sm font-semibold">NSE Output</h3>
                  {pd.nseScripts.map((s) => (
                    <div key={s.id} className="mt-2">
                      <div className="font-mono text-xs font-semibold">
                        {s.script_id}
                      </div>
                      <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-xs print:bg-gray-100">
                        {s.output}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              {/* 2. AutoRecon Files */}
              {pd.arFiles.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-sm font-semibold">AutoRecon Files</h3>
                  {pd.arFiles.map((f, i) => (
                    <div key={i} className="mt-2">
                      <div className="font-mono text-xs font-semibold">
                        {f.filename}
                      </div>
                      <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-xs print:bg-gray-100">
                        {f.content}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              {/* 3. Commands (KB) */}
              {pd.kbCommands.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-sm font-semibold">Commands</h3>
                  <ul className="mt-1 space-y-1">
                    {pd.kbCommands.map((c, i) => (
                      <li key={i} className="text-sm">
                        <strong>{c.label}:</strong>{" "}
                        <code className="font-mono text-xs">{c.command}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 4. AutoRecon Commands */}
              {pd.arCommands.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-sm font-semibold">AutoRecon Commands</h3>
                  <ul className="mt-1 space-y-1">
                    {pd.arCommands.map((c, i) => (
                      <li key={i} className="text-sm">
                        <strong>{c.label}:</strong>{" "}
                        <code className="font-mono text-xs">{c.command}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 5. Checklist */}
              {pd.kbChecks.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-sm font-semibold">Checklist</h3>
                  <ul className="mt-1 space-y-1">
                    {pd.kbChecks.map((c) => {
                      const checked = pd.checkMap.get(c.key) === true;
                      return (
                        <li key={c.key} className="text-sm">
                          <span
                            className={
                              checked
                                ? "text-green-600 print:text-green-700"
                                : "text-muted-foreground"
                            }
                          >
                            {checked ? GLYPH_DONE : GLYPH_PENDING}
                          </span>{" "}
                          {c.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* 6. Notes — D-06: skip empty (null OR whitespace-only body). */}
              {notesBody && (
                <div className="mt-3">
                  <h3 className="text-sm font-semibold">Notes</h3>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted p-2 text-sm print:bg-gray-100">
                    {notesBody}
                  </pre>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Host-level scripts (if any) */}
      {vm.hostScripts.length > 0 && (
        <section
          className="mb-8 print:break-inside-avoid-page"
          style={{ breakInside: "avoid-page" }}
        >
          <h2 className="border-b pb-1 text-lg font-semibold">Host Scripts</h2>
          {vm.hostScripts.map((s) => (
            <div key={s.id} className="mt-2">
              <div className="font-mono text-xs font-semibold">
                {s.script_id}
              </div>
              <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-xs print:bg-gray-100">
                {s.output}
              </pre>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
