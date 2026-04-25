import "server-only";

/**
 * HTML export generator — Phase 6, Plan 06-05 Task 2 (EXPORT-04).
 *
 * Produces a single self-contained HTML document from an `EngagementViewModel`.
 * Design refs:
 *   D-14: light "report" theme — serif body, monospaced code, black-on-white.
 *   D-15: single self-contained file — inline <style> only, NO <script>, NO <link>.
 *   D-16: reuses the same view model as Markdown + print route.
 *   D-18: `break-inside: avoid-page` on each port section (not `page-break-inside`).
 *
 * Security (CRITICAL — RESEARCH.md Security Domain, T-06-11):
 *   Template-string concatenation does NOT auto-escape. Every dynamic value
 *   (engagement name, NSE output, notes, service names, ...) MUST pass through
 *   `escapeHtml` before insertion. The fixture's `<script>alert(1)</script>`
 *   payload (port 80 http-title) is the canary in the golden fixture — if it
 *   appears unescaped, an escape call is missing.
 *
 * Anti-patterns avoided:
 *   - No React-style innerHTML sink — this file generates a STRING that is
 *     returned via `new Response(html, ...)` to a route handler, never mounted
 *     into a React tree (Phase 4 D-20 ESLint rule + T-06-13 mitigation).
 *   - No external fonts / images / scripts (D-15, offline guarantee).
 *   - No inline `on*` event handlers anywhere in the template.
 *
 * Section order per port (matches `src/components/PortCard.tsx`, locked in
 * Plan 01 must_haves[4]):
 *   NSE Output → AutoRecon Files → Commands → AutoRecon Commands → Checklist → Notes
 */

import type { EngagementViewModel, PortViewModel } from "./view-model";
import { escapeHtml } from "./escape";

// -----------------------------------------------------------------------------
// Inline CSS (D-14 palette; D-18 page-break rule)
// -----------------------------------------------------------------------------

/**
 * Inline CSS injected into the document <head>. Kept as a single template
 * literal constant to make the golden fixture diff reviewable.
 *
 * Palette:
 *   #111     body text
 *   #fff     body background
 *   #f5f5f5  code/pre background
 *   #e5e5e5  code/pre border
 *   #ccc     table borders, h2 underline
 *   #0a0     done-check color (subtle green)
 *   #888     pending-check color
 *   #444     h3 accent
 *   #f0f0f0  table header background
 */
const INLINE_CSS = `
body { font-family: Georgia, 'Times New Roman', serif; color: #111; background: #fff; max-width: 900px; margin: 0 auto; padding: 2rem; }
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
h2 { font-size: 1.15rem; margin-top: 2rem; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
h3 { font-size: 0.95rem; margin-top: 1rem; color: #444; }
pre, code { font-family: Menlo, Monaco, 'Courier New', monospace; font-size: 0.85rem; background: #f5f5f5; border: 1px solid #e5e5e5; border-radius: 3px; }
pre { padding: 0.75rem; white-space: pre-wrap; word-break: break-word; overflow-x: auto; }
code { padding: 0.1em 0.3em; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid #ccc; padding: 0.4rem 0.75rem; text-align: left; }
th { background: #f0f0f0; font-weight: bold; }
.check-done { color: #0a0; }
.check-pending { color: #888; }
section.port-section { break-inside: avoid-page; margin-bottom: 2rem; }
@media print { body { padding: 0; } .no-print { display: none; } }
`;

// -----------------------------------------------------------------------------
// Glyphs (CONTEXT.md specifics — NOT ✓/✗; screen readers announce inconsistently)
// -----------------------------------------------------------------------------

const GLYPH_DONE = "▣"; // U+25A3
const GLYPH_PENDING = "□"; // U+25A1

// -----------------------------------------------------------------------------
// Public entrypoint
// -----------------------------------------------------------------------------

/**
 * Render an EngagementViewModel as a self-contained HTML document string.
 * The returned string is ready to be written to disk or served via
 * `new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" }})`.
 */
export function generateHtml(vm: EngagementViewModel): string {
  const title = escapeHtml(vm.engagement.name);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Recon Deck Report</title>
<style>${INLINE_CSS}</style>
</head>
<body>
${generateBody(vm)}
</body>
</html>
`;
}

// -----------------------------------------------------------------------------
// Body assembly
// -----------------------------------------------------------------------------

function generateBody(vm: EngagementViewModel): string {
  const parts: string[] = [];
  parts.push(renderHeader(vm));
  parts.push(renderPortsTable(vm));
  for (const pd of vm.ports) {
    parts.push(renderPortSection(pd));
  }
  if (vm.hostScripts.length > 0) {
    parts.push(renderHostScripts(vm));
  }
  // v2 enrichment sections — only emit when data exists.
  const extra = renderExtraSections(vm);
  if (extra) parts.push(extra);
  return parts.join("\n");
}

function renderExtraSections(vm: EngagementViewModel): string | null {
  const sections: string[] = [];

  if (vm.extraPorts && vm.extraPorts.length > 0) {
    const rows = vm.extraPorts
      .map((ep) => {
        const reasons = ep.reasons
          ? ep.reasons.map((r) => `${r.count} ${r.reason}`).join(", ")
          : "";
        return `<tr><td>${ep.count}</td><td>${escapeHtml(ep.state)}</td><td>${escapeHtml(reasons)}</td></tr>`;
      })
      .join("\n");
    sections.push(
      `<section class="extras">\n<h2>Extra Ports</h2>\n<table>\n<thead><tr><th>Count</th><th>State</th><th>Reasons</th></tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>\n</section>`,
    );
  }

  if (vm.osMatches && vm.osMatches.length > 0) {
    const items = vm.osMatches
      .map((m) => {
        const acc =
          m.accuracy !== undefined ? ` <em>(${m.accuracy}%)</em>` : "";
        const classBits =
          m.classes && m.classes.length > 0
            ? `<ul>${m.classes
                .map(
                  (c) =>
                    `<li>${escapeHtml(
                      [c.vendor, c.family, c.gen, c.type]
                        .filter(Boolean)
                        .join(" / "),
                    )}</li>`,
                )
                .join("")}</ul>`
            : "";
        return `<li><strong>${escapeHtml(m.name)}</strong>${acc}${classBits}</li>`;
      })
      .join("\n");
    const fp = vm.osFingerprint
      ? `<h3>TCP/IP fingerprint</h3>\n<pre>${escapeHtml(vm.osFingerprint)}</pre>`
      : "";
    sections.push(
      `<section class="extras">\n<h2>OS Detection</h2>\n<ul>\n${items}\n</ul>\n${fp}\n</section>`,
    );
  }

  if (vm.traceroute && vm.traceroute.hops.length > 0) {
    const meta = vm.traceroute.proto
      ? `<p><em>proto: ${escapeHtml(vm.traceroute.proto)}${vm.traceroute.port ? ` · port: ${vm.traceroute.port}` : ""}</em></p>`
      : "";
    const rows = vm.traceroute.hops
      .map(
        (h) =>
          `<tr><td>${h.ttl}</td><td>${escapeHtml(h.ipaddr)}</td><td>${escapeHtml(h.host ?? "")}</td><td>${h.rtt ?? ""}</td></tr>`,
      )
      .join("\n");
    sections.push(
      `<section class="extras">\n<h2>Traceroute</h2>\n${meta}\n<table>\n<thead><tr><th>TTL</th><th>IP</th><th>Host</th><th>RTT (ms)</th></tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>\n</section>`,
    );
  }

  const pre = vm.preScripts ?? [];
  const post = vm.postScripts ?? [];
  if (pre.length > 0 || post.length > 0) {
    const blocks: string[] = [];
    for (const s of pre) {
      blocks.push(
        `<h3>pre · ${escapeHtml(s.id)}</h3>\n<pre>${escapeHtml(s.output)}</pre>`,
      );
    }
    for (const s of post) {
      blocks.push(
        `<h3>post · ${escapeHtml(s.id)}</h3>\n<pre>${escapeHtml(s.output)}</pre>`,
      );
    }
    sections.push(
      `<section class="extras">\n<h2>Pre / Post Scan Scripts</h2>\n${blocks.join("\n")}\n</section>`,
    );
  }

  return sections.length > 0 ? sections.join("\n") : null;
}

function renderHeader(vm: EngagementViewModel): string {
  const { engagement } = vm;
  const name = escapeHtml(engagement.name);
  const ip = escapeHtml(engagement.target_ip);
  const host = engagement.target_hostname
    ? ` (${escapeHtml(engagement.target_hostname)})`
    : "";
  const lines: string[] = [
    "<header>",
    `<h1>${name}</h1>`,
    `<p><strong>Target:</strong> <code>${ip}</code>${host}</p>`,
  ];
  if (engagement.os_name) {
    lines.push(`<p><strong>OS:</strong> ${escapeHtml(engagement.os_name)}</p>`);
  }
  if (vm.scanner?.version) {
    const args = vm.scanner.args
      ? ` <code>${escapeHtml(vm.scanner.args)}</code>`
      : "";
    lines.push(
      `<p><strong>nmap:</strong> ${escapeHtml(vm.scanner.version)}${args}</p>`,
    );
  }
  if (vm.runstats?.finishedAt) {
    const elapsed =
      vm.runstats.elapsed !== undefined ? ` · ${vm.runstats.elapsed}s` : "";
    lines.push(
      `<p><strong>Finished:</strong> ${escapeHtml(vm.runstats.finishedAt)}${elapsed}</p>`,
    );
  }
  lines.push(
    `<p><strong>Coverage:</strong> ${vm.coverage}% (${vm.doneChecks}/${vm.totalChecks})</p>`,
  );
  lines.push("</header>");
  return lines.join("\n");
}

function renderPortsTable(vm: EngagementViewModel): string {
  const rows = vm.ports.map((pd) => {
    const p = pd.port;
    const versionText = [p.product, p.version].filter(Boolean).join(" ");
    const done = pd.kbChecks.filter((c) => pd.checkMap.get(c.key) === true)
      .length;
    const total = pd.kbChecks.length;
    return `<tr><td>${p.port}</td><td>${escapeHtml(p.protocol)}</td><td>${escapeHtml(p.service ?? "")}</td><td>${escapeHtml(versionText)}</td><td>${done}/${total}</td></tr>`;
  });
  return `<h2>Ports</h2>
<table>
<thead><tr><th>Port</th><th>Proto</th><th>Service</th><th>Version</th><th>Done</th></tr></thead>
<tbody>
${rows.join("\n")}
</tbody>
</table>`;
}

function renderPortSection(pd: PortViewModel): string {
  const p = pd.port;
  const versionBits = [p.product, p.version].filter(Boolean);
  const versionSuffix =
    versionBits.length > 0 ? ` (${escapeHtml(versionBits.join(" "))})` : "";
  const service = escapeHtml(p.service ?? "unknown");
  // Em-dash U+2014 (CONTEXT.md specifics); proto is a DB enum ('tcp'|'udp'),
  // escaping is still applied so no raw DB value is ever concatenated.
  const heading = `<h2>Port ${p.port}/${escapeHtml(p.protocol)} — ${service}${versionSuffix}</h2>`;

  const sections: string[] = [];

  // 0. v2: CPE + reason metadata at the top of the port body.
  const meta: string[] = [];
  if (pd.reason) {
    meta.push(
      `<li><strong>Reason:</strong> <code>${escapeHtml(pd.reason)}</code></li>`,
    );
  }
  if (pd.cpe && pd.cpe.length > 0) {
    for (const c of pd.cpe) {
      meta.push(`<li><strong>CPE:</strong> <code>${escapeHtml(c)}</code></li>`);
    }
  }
  if (meta.length > 0) {
    sections.push(`<ul class="port-meta">\n${meta.join("\n")}\n</ul>`);
  }

  // 1. NSE Output
  if (pd.nseScripts.length > 0) {
    const blocks = pd.nseScripts
      .map(
        (s) =>
          `<div><strong>${escapeHtml(s.script_id)}</strong></div><pre>${escapeHtml(s.output)}</pre>`,
      )
      .join("\n");
    sections.push(`<h3>NSE Output</h3>\n${blocks}`);
  }

  // 2. AutoRecon Files
  if (pd.arFiles.length > 0) {
    const blocks = pd.arFiles
      .map(
        (f) =>
          `<div><strong>${escapeHtml(f.filename)}</strong></div><pre>${escapeHtml(f.content)}</pre>`,
      )
      .join("\n");
    sections.push(`<h3>AutoRecon Files</h3>\n${blocks}`);
  }

  // 3. Commands (KB)
  if (pd.kbCommands.length > 0) {
    const items = pd.kbCommands
      .map(
        (c) =>
          `<li><strong>${escapeHtml(c.label)}:</strong> <code>${escapeHtml(c.command)}</code></li>`,
      )
      .join("\n");
    sections.push(`<h3>Commands</h3>\n<ul>\n${items}\n</ul>`);
  }

  // 4. AutoRecon Commands
  if (pd.arCommands.length > 0) {
    const items = pd.arCommands
      .map(
        (c) =>
          `<li><strong>${escapeHtml(c.label)}:</strong> <code>${escapeHtml(c.command)}</code></li>`,
      )
      .join("\n");
    sections.push(`<h3>AutoRecon Commands</h3>\n<ul>\n${items}\n</ul>`);
  }

  // 5. Checklist
  if (pd.kbChecks.length > 0) {
    const items = pd.kbChecks
      .map((c) => {
        const checked = pd.checkMap.get(c.key) === true;
        const glyph = checked
          ? `<span class="check-done">${GLYPH_DONE}</span>`
          : `<span class="check-pending">${GLYPH_PENDING}</span>`;
        return `<li>${glyph} ${escapeHtml(c.label)}</li>`;
      })
      .join("\n");
    sections.push(`<h3>Checklist</h3>\n<ul>\n${items}\n</ul>`);
  }

  // 6. Notes — D-06: skip empty (null OR whitespace-only body).
  const notes = pd.port.notes;
  if (notes && notes.body.trim() !== "") {
    sections.push(`<h3>Notes</h3>\n<pre>${escapeHtml(notes.body)}</pre>`);
  }

  return `<section class="port-section">
${heading}
${sections.join("\n")}
</section>`;
}

function renderHostScripts(vm: EngagementViewModel): string {
  // Uses `host-scripts-section` (not `port-section`) so a `port-section` count
  // is always equal to `vm.ports.length`. Same `break-inside: avoid-page`
  // behaviour is inherited by applying `port-section` as a secondary class
  // on the element to keep the CSS rule single-sourced.
  const blocks = vm.hostScripts
    .map(
      (s) =>
        `<div><strong>${escapeHtml(s.script_id)}</strong></div><pre>${escapeHtml(s.output)}</pre>`,
    )
    .join("\n");
  return `<section class="host-scripts-section" style="break-inside: avoid-page;">
<h2>Host Scripts</h2>
${blocks}
</section>`;
}
