import "server-only";

/**
 * Plan 06-03 — Obsidian-compatible Markdown exporter.
 *
 * generateMarkdown(vm) turns a pre-built EngagementViewModel into a
 * deterministic Markdown document. The ONLY documented non-determinism is the
 * `exported_at` frontmatter value — callers may pin it via `opts.exportedAt`
 * so golden-fixture tests and regression snapshots are byte-stable.
 *
 * Why Markdown is the flagship export format:
 *   PROJECT.md core value — "every engagement export-ready as Markdown."
 *   Obsidian Dataview users need numeric/array frontmatter; GFM users need
 *   task-list syntax. This file is the single touchpoint for that contract.
 *
 * Frontmatter key order (EXPORT-02, Plan 03 truths[1]):
 *   target → ip → hostname? → aliases? → engagement → status → os? →
 *   ports → coverage → tags → recon-deck-version → exported_at
 *   (keys marked `?` are OMITTED when source data is null/empty — not
 *    rendered as `key: null`. Rationale: RESEARCH.md Pattern 2 — absent
 *    keys are unambiguous in YAML, explicit null is ambiguous across
 *    parsers.)
 *
 * Body structure (EXPORT-01, Plan 03 truths[5] + Plan 01 section order):
 *   1. H1 engagement name
 *   2. ## Ports summary table (GFM pipe table with Port/Proto/Service/
 *      Version/Done columns)
 *   3. For each port (view model guarantees ascending sort):
 *        ## Port <port>/<proto> — <service> (<product> <version>)
 *        ### NSE Output            (skip when empty)
 *        ### AutoRecon Files       (skip when empty)
 *        ### Commands              (skip when empty)
 *        ### AutoRecon Commands    (skip when empty)
 *        ### Checklist             (skip when empty)
 *        ### Notes                 (skip when null OR whitespace-only)
 *   4. ## Host Scripts (when vm.hostScripts.length > 0)
 *
 * Section order matches `src/components/PortCard.tsx` — the authoritative
 * on-screen rendering. CONTEXT.md D-05 lists a slightly different order;
 * PortCard wins (resolved in Plan 01 must_haves[4], RESEARCH.md Open
 * Question 1).
 *
 * Deliberately NOT included (D-07):
 *   - the engagement's raw scan input (JSON export carries it for
 *     round-trip; MD is the human-facing report).
 *   - KB resource link entries — user already has them in the app.
 *
 * This module is pure string generation:
 *   - No DB calls, no YAML parsing, no HTTP.
 *   - `import "server-only"` prevents client bundles from pulling in
 *     EngagementViewModel (which transitively types DB rows).
 */

import type { EngagementViewModel, PortViewModel } from "./view-model";

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export interface GenerateMarkdownOptions {
  /**
   * Override the `exported_at` frontmatter timestamp. Golden-fixture tests
   * inject this so byte-for-byte snapshots remain stable. In production the
   * default `new Date().toISOString()` is used — this is the one piece of
   * documented non-determinism (D-25).
   */
  exportedAt?: string;
}

/**
 * Render an EngagementViewModel as an Obsidian-compatible + GitHub Flavored
 * Markdown document. Output ends with a single trailing newline (POSIX
 * convention — makes `cat`, `diff`, and `toMatchFileSnapshot` behave well).
 */
export function generateMarkdown(
  vm: EngagementViewModel,
  opts: GenerateMarkdownOptions = {},
): string {
  const exportedAt = opts.exportedAt ?? new Date().toISOString();
  const frontmatter = buildFrontmatter(vm, exportedAt);
  const body = buildBody(vm);
  return `${frontmatter}\n\n${body}\n`;
}

// -----------------------------------------------------------------------------
// Frontmatter (EXPORT-02)
// -----------------------------------------------------------------------------

/**
 * Build the `--- ... ---` frontmatter block. Keys appear in the locked order
 * specified by EXPORT-02 / Plan 03 truths[1]; optional keys are omitted
 * entirely when source data is null or empty.
 */
function buildFrontmatter(vm: EngagementViewModel, exportedAt: string): string {
  const { engagement } = vm;
  const lines: string[] = ["---"];

  lines.push(`target: ${yamlQuote(engagement.name)}`);
  lines.push(`ip: ${yamlQuote(engagement.target_ip)}`);

  // Optional — omit when null. Obsidian treats absent and `null` keys
  // differently; absent is the unambiguous way to say "no data".
  if (engagement.target_hostname) {
    lines.push(`hostname: ${yamlQuote(engagement.target_hostname)}`);
  }

  // Aliases: v1.0 has no aliases concept in the engagement schema. Omit the
  // key entirely (RESEARCH.md Pattern 2 null-handling). Kept as a structural
  // comment so the key order is obvious; when a future schema adds aliases,
  // emit a block-list here per EXPORT-02.
  // (aliases omitted)

  lines.push(`engagement: ${yamlQuote(engagement.name)}`);

  // Status is hard-coded "active" for v1.0 — no status column in the DB yet.
  // Locked here (not in the view model) so the Markdown format owns the
  // placeholder and can evolve independently if/when status is added.
  lines.push(`status: "active"`);

  if (engagement.os_name) {
    lines.push(`os: ${yamlQuote(engagement.os_name)}`);
  }

  // v2: nmap scanner meta + finished timestamp.
  if (vm.scanner?.version) {
    lines.push(`nmap_version: ${yamlQuote(vm.scanner.version)}`);
  }
  if (vm.scanner?.args) {
    lines.push(`nmap_args: ${yamlQuote(vm.scanner.args)}`);
  }
  if (vm.runstats?.finishedAt) {
    lines.push(`finished_at: ${yamlQuote(vm.runstats.finishedAt)}`);
  }
  if (vm.runstats?.elapsed !== undefined) {
    lines.push(`scan_elapsed_seconds: ${vm.runstats.elapsed}`);
  }

  // Ports: block-list form `port/proto`. Obsidian Dataview requires dash
  // form to parse as List (Pitfall 1 in RESEARCH.md).
  const portKeys = vm.ports.map((p) => `${p.port.port}/${p.port.protocol}`);
  lines.push(yamlBlockList("ports", portKeys, /* quote */ false));

  // Coverage: UNQUOTED integer 0-100. Dataview can filter numerically
  // (`WHERE coverage >= 50`) only when the value is a bare integer. No
  // `%` suffix (Plan 01 Decision, Open Q2 RESOLVED).
  lines.push(`coverage: ${vm.coverage}`);

  // Tags: hard-coded for v1.0 — gives users an immediate Dataview axis to
  // filter on. Pinned in the MD format to keep the export identity stable.
  lines.push(yamlBlockList("tags", ["recon-deck", "pentest"], /* quote */ false));

  lines.push(`recon-deck-version: ${yamlQuote(vm.recon_deck_version)}`);
  lines.push(`exported_at: ${yamlQuote(exportedAt)}`);
  lines.push("---");
  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// Body (EXPORT-01)
// -----------------------------------------------------------------------------

/** Build the Markdown body — H1, summary table, per-port sections, host scripts. */
function buildBody(vm: EngagementViewModel): string {
  const parts: string[] = [];

  // 1. H1 — engagement name verbatim (the name already contains "<host> (IP)"
  //    in this project, so no extra suffix is added).
  parts.push(`# ${vm.engagement.name}`);

  // 2. ## Ports summary table.
  parts.push(buildPortsTable(vm));

  // 3. Per-port H2 sections.
  for (const portVm of vm.ports) {
    parts.push(buildPortSection(portVm));
  }

  // 4. ## Host Scripts — only when host-level NSE scripts exist.
  if (vm.hostScripts.length > 0) {
    parts.push(buildHostScriptsSection(vm));
  }

  // 5. v2: engagement-level enrichment sections.
  const extraSections = [
    buildExtraPortsSection(vm),
    buildOsDetectionSection(vm),
    buildTracerouteSection(vm),
    buildPrePostScriptsSection(vm),
  ].filter((s): s is string => s !== null);
  if (extraSections.length > 0) {
    parts.push(extraSections.join("\n\n"));
  }

  return parts.join("\n\n");
}

function buildExtraPortsSection(vm: EngagementViewModel): string | null {
  if (!vm.extraPorts || vm.extraPorts.length === 0) return null;
  const lines: string[] = ["## Extra Ports", ""];
  for (const ep of vm.extraPorts) {
    const reasons = ep.reasons
      ? ` (${ep.reasons.map((r) => `${r.count} ${r.reason}`).join(", ")})`
      : "";
    lines.push(`- **${ep.count}** ${ep.state}${reasons}`);
  }
  return lines.join("\n");
}

function buildOsDetectionSection(vm: EngagementViewModel): string | null {
  if ((!vm.osMatches || vm.osMatches.length === 0) && !vm.osFingerprint) {
    return null;
  }
  const lines: string[] = ["## OS Detection", ""];
  if (vm.osMatches) {
    for (const m of vm.osMatches) {
      const acc = m.accuracy !== undefined ? ` _(${m.accuracy}%)_` : "";
      lines.push(`- **${m.name}**${acc}`);
      if (m.classes && m.classes.length > 0) {
        for (const c of m.classes) {
          const parts = [c.vendor, c.family, c.gen, c.type]
            .filter(Boolean)
            .join(" / ");
          if (parts) lines.push(`  - ${parts}`);
        }
      }
    }
  }
  if (vm.osFingerprint) {
    lines.push("", "**TCP/IP fingerprint:**", "");
    lines.push("```");
    lines.push(vm.osFingerprint);
    lines.push("```");
  }
  return lines.join("\n");
}

function buildTracerouteSection(vm: EngagementViewModel): string | null {
  if (!vm.traceroute || vm.traceroute.hops.length === 0) return null;
  const lines: string[] = ["## Traceroute", ""];
  if (vm.traceroute.proto) {
    lines.push(
      `_proto: ${vm.traceroute.proto}${vm.traceroute.port ? ` · port: ${vm.traceroute.port}` : ""}_`,
      "",
    );
  }
  lines.push("| TTL | IP | Host | RTT (ms) |");
  lines.push("|-----|----|------|----------|");
  for (const h of vm.traceroute.hops) {
    lines.push(
      `| ${h.ttl} | ${h.ipaddr} | ${h.host ?? ""} | ${h.rtt ?? ""} |`,
    );
  }
  return lines.join("\n");
}

function buildPrePostScriptsSection(vm: EngagementViewModel): string | null {
  const pre = vm.preScripts ?? [];
  const post = vm.postScripts ?? [];
  if (pre.length === 0 && post.length === 0) return null;
  const lines: string[] = ["## Pre / Post Scan Scripts", ""];
  for (const s of pre) {
    lines.push(`### pre · ${s.id}`, "", "```text", s.output, "```", "");
  }
  for (const s of post) {
    lines.push(`### post · ${s.id}`, "", "```text", s.output, "```", "");
  }
  return lines.join("\n").replace(/\n+$/, "");
}

// ---------------------------------------------------------------------------
// Summary table
// ---------------------------------------------------------------------------

function buildPortsTable(vm: EngagementViewModel): string {
  const lines: string[] = [
    "## Ports",
    "",
    "| Port | Proto | Service | Version | Done |",
    "|------|-------|---------|---------|------|",
  ];
  for (const p of vm.ports) {
    const service = p.port.service ?? "";
    const versionText = joinProductVersion(p.port.product, p.port.version);
    const doneCount = p.kbChecks.filter(
      (c) => p.checkMap.get(c.key) === true,
    ).length;
    const total = p.kbChecks.length;
    lines.push(
      `| ${p.port.port} | ${p.port.protocol} | ${service} | ${versionText} | ${doneCount}/${total} |`,
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Per-port section (PortCard.tsx order)
// ---------------------------------------------------------------------------

function buildPortSection(p: PortViewModel): string {
  const heading = buildPortHeading(p);
  const sections: string[] = [heading, ""];

  // Order: CPE/Reason metadata → NSE → AR Files → KB Commands → AR Commands → Checklist → Notes.
  // Each helper returns `null` when the section should be skipped (D-06).
  const bodyParts = [
    renderCpeReasonSection(p),
    renderNseSection(p),
    renderArFilesSection(p),
    renderKbCommandsSection(p),
    renderArCommandsSection(p),
    renderChecklistSection(p),
    renderNotesSection(p),
  ].filter((s): s is string => s !== null);

  // Join sections with a blank line between each to keep Markdown readable.
  if (bodyParts.length > 0) {
    sections.push(bodyParts.join("\n\n"));
  }

  return sections.join("\n").replace(/\n+$/, "");
}

/** `## Port 80/tcp — http (Apache 2.4.52)` with em-dash and parenthesized version. */
function buildPortHeading(p: PortViewModel): string {
  const port = p.port.port;
  const proto = p.port.protocol;
  const service = p.port.service ?? "";
  const versionText = joinProductVersion(p.port.product, p.port.version);

  // Compose `service (version)` — omit the parens when both product and
  // version are null, and collapse any leftover double spaces.
  const servicePart = service ? ` — ${service}` : " —";
  const versionPart = versionText ? ` (${versionText})` : "";

  // When service is present but version is not, drop the trailing em-dash
  // without version cleanly. When neither is present, show just the port.
  if (!service && !versionText) {
    return `## Port ${port}/${proto}`;
  }
  return `## Port ${port}/${proto}${servicePart}${versionPart}`.replace(/\s+$/, "");
}

// ---------------------------------------------------------------------------
// Section renderers (return null = skip per D-06)
// ---------------------------------------------------------------------------

function renderNseSection(p: PortViewModel): string | null {
  if (p.nseScripts.length === 0) return null;
  const blocks = p.nseScripts.map((s) => {
    return `**${s.script_id}**\n\n\`\`\`text\n${s.output}\n\`\`\``;
  });
  return `### NSE Output\n\n${blocks.join("\n\n")}`;
}

function renderArFilesSection(p: PortViewModel): string | null {
  if (p.arFiles.length === 0) return null;
  const blocks = p.arFiles.map((f) => {
    return `**${f.filename}**\n\n\`\`\`text\n${f.content}\n\`\`\``;
  });
  return `### AutoRecon Files\n\n${blocks.join("\n\n")}`;
}

function renderKbCommandsSection(p: PortViewModel): string | null {
  if (p.kbCommands.length === 0) return null;
  // Bullet format: `- **label:** \`command\`` — keeps commands monospaced
  // (GFM renders single-backticks as inline code) and the label stands out
  // in the scan.
  const lines = p.kbCommands.map(
    (c) => `- **${c.label}:** \`${c.command}\``,
  );
  return `### Commands\n\n${lines.join("\n")}`;
}

function renderArCommandsSection(p: PortViewModel): string | null {
  if (p.arCommands.length === 0) return null;
  const lines = p.arCommands.map(
    (c) => `- **${c.label}:** \`${c.command}\``,
  );
  return `### AutoRecon Commands\n\n${lines.join("\n")}`;
}

function renderChecklistSection(p: PortViewModel): string | null {
  if (p.kbChecks.length === 0) return null;
  // GFM task-list syntax: `- [x] label` / `- [ ] label`. MUST be lowercase
  // `x` (some parsers reject `X`). RESEARCH.md Pattern 3.
  const lines = p.kbChecks.map((c) => {
    const mark = p.checkMap.get(c.key) === true ? "x" : " ";
    return `- [${mark}] ${c.label}`;
  });
  return `### Checklist\n\n${lines.join("\n")}`;
}

function renderNotesSection(p: PortViewModel): string | null {
  const notes = p.port.notes;
  if (!notes) return null;
  if (notes.body.trim() === "") return null;
  return `### Notes\n\n${notes.body}`;
}

/** v2: CPE + reason rendered as a small fact list above the rest of the port body. */
function renderCpeReasonSection(p: PortViewModel): string | null {
  const lines: string[] = [];
  if (p.reason) {
    lines.push(`- **Reason:** \`${p.reason}\``);
  }
  if (p.cpe && p.cpe.length > 0) {
    for (const c of p.cpe) {
      lines.push(`- **CPE:** \`${c}\``);
    }
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

// ---------------------------------------------------------------------------
// Host scripts section
// ---------------------------------------------------------------------------

function buildHostScriptsSection(vm: EngagementViewModel): string {
  const blocks = vm.hostScripts.map((s) => {
    return `**${s.script_id}**\n\n\`\`\`text\n${s.output}\n\`\`\``;
  });
  return `## Host Scripts\n\n${blocks.join("\n\n")}`;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * YAML block-list formatter (RESEARCH.md Pattern 2).
 *
 * Produces:
 *   key:
 *     - value1
 *     - value2
 *
 * `quote = true` wraps each value in double quotes (use for free-text string
 * fields). `quote = false` emits values bare (use for port/proto tokens and
 * unambiguous slugs like `recon-deck`).
 *
 * For empty arrays emit `key: []` (inline flow form) — this keeps Dataview
 * happy while still signaling the key is present but empty. In practice the
 * frontmatter builder OMITS the key entirely rather than calling this for
 * empty arrays, but the fallback keeps the helper total.
 */
function yamlBlockList(key: string, values: string[], quote: boolean): string {
  if (values.length === 0) return `${key}: []`;
  const lines = values.map((v) => `  - ${quote ? yamlQuote(v) : v}`);
  return `${key}:\n${lines.join("\n")}`;
}

/**
 * Minimal YAML double-quote helper (T-06-05 mitigation).
 *
 * Wraps a value in double quotes and escapes embedded `"` / `\` so an
 * engagement name like `box.htb "prod"` never corrupts the frontmatter
 * stream. Backslash must be escaped FIRST so later `"` escaping does not
 * double-escape the literal `\` character.
 *
 * This is not a full YAML quote implementation (e.g., it does not collapse
 * newlines into `\n` sequences) — but engagement names / hostnames /
 * versions are always single-line text strings in this project.
 */
function yamlQuote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Compose product + version into a single human-readable string.
 *   ("Apache", "2.4.52") → "Apache 2.4.52"
 *   ("nginx", null)       → "nginx"
 *   (null, "1.18")        → "1.18"
 *   (null, null)          → ""
 */
function joinProductVersion(
  product: string | null,
  version: string | null,
): string {
  if (product && version) return `${product} ${version}`;
  return product ?? version ?? "";
}
