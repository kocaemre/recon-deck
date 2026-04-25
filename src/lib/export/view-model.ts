import "server-only";

/**
 * EngagementViewModel — shared normalized engagement shape consumed by every
 * Phase 06 export format (Markdown, JSON, HTML) AND the /report print route.
 *
 * Why a single view model? Three format generators (MD/JSON/HTML) plus one
 * print route MUST render the same port data in the same order with the same
 * coverage percentage. Building three parallel assembly paths guarantees they
 * drift — over time an MD-only bug would never surface in the HTML golden
 * fixture and vice versa. The view model moves the "what gets rendered" into
 * ONE deterministic function (loadEngagementForExport), leaving the generators
 * responsible only for "how" (string templating).
 *
 * Inputs:
 *   - `engagement`: FullEngagement returned by `getById(db, id)` — caller is
 *     responsible for the DB lookup; this module does no I/O.
 *   - `kb`: KnowledgeBase loaded once at module level by the caller (avoids
 *     re-parsing YAML per export per RESEARCH.md Pitfall 5).
 *
 * Output: EngagementViewModel — sorted ports, interpolated commands, coverage
 * percentage, parsed warnings, pass-through engagement + host scripts.
 *
 * Section order assumption (Plan 06-01 must_haves[4], RESEARCH.md Open
 * Question 1 RESOLVED):
 *   NSE → AR Files → KB Commands → AR Commands → Checklist → Notes
 *   (matches `src/components/PortCard.tsx` render order; D-05 in CONTEXT.md
 *    is treated as imprecise about the NSE↔AR Files positioning — PortCard
 *    is authoritative)
 *
 * Coverage format (Plan 06-01 must_haves[3], RESEARCH.md Open Question 2
 * RESOLVED): integer 0–100, rounded via `Math.round`. No `%` suffix.
 *
 * `import "server-only"` (T-06-02 mitigation) — build fails if any client
 * component transitively imports this module, preventing DB/KB internals from
 * leaking to the browser bundle.
 *
 * NO BARREL FILE. Downstream plans (03/04/05/06) MUST import each generator
 * by its full module path (`@/lib/export/view-model`, `@/lib/export/markdown`,
 * …). A barrel at `src/lib/export/index.ts` would force every Wave 2 plan to
 * append-edit the same file, causing parallel-write conflicts in the executor.
 */

import type { FullEngagement, PortWithDetails } from "@/lib/db/types";
import type { PortScript } from "@/lib/db/schema";
import { matchPort, type KnowledgeBase } from "@/lib/kb";
import { interpolateWordlists } from "@/lib/kb/wordlists";
import { parseNmapXml } from "@/lib/parser/nmap-xml";
import { parseNmapText } from "@/lib/parser/nmap-text";
import type {
  Hop,
  OsMatch,
  ParsedScan,
  ScannerInfo,
  RunStats,
  ExtraPortGroup,
  ScriptOutput,
} from "@/lib/parser/types";

// -----------------------------------------------------------------------------
// Private helpers
// -----------------------------------------------------------------------------

/**
 * Replace {IP}, {PORT}, {HOST} and {WORDLIST_*} placeholders in a KB /
 * AutoRecon / user-defined command template. Identical to the helper in
 * `app/engagements/[id]/page.tsx` — the whole point of the view model is
 * that generators and the detail page see the same interpolated strings.
 *
 * {HOST} falls back to the target IP when the engagement hostname is null
 * (nmap commonly returns no PTR for HTB targets). This keeps exported
 * commands runnable verbatim.
 *
 * P1-E: `wordlistOverrides` keyed by the WORDLIST_* identifier (no braces);
 * unmapped tokens fall back to `DEFAULT_WORDLISTS` and finally remain
 * verbatim so the operator notices an unresolved key.
 */
function interpolateCommand(
  template: string,
  ip: string,
  port: number,
  hostname: string | null,
  wordlistOverrides?: Record<string, string>,
): string {
  const withWordlists = interpolateWordlists(template, wordlistOverrides);
  return withWordlists
    .replace(/\{IP\}/g, ip)
    .replace(/\{PORT\}/g, String(port))
    .replace(/\{HOST\}/g, hostname ?? ip);
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** Per-port normalized shape rendered by every export format. */
export interface PortViewModel {
  /** Raw port row (id, port, protocol, state, service, product, version, tunnel, extrainfo, plus nested scripts/checks/notes/commands). */
  port: PortWithDetails;
  /** NSE script output (source !== 'autorecon'). */
  nseScripts: PortScript[];
  /** AutoRecon per-port service files (source === 'autorecon'), reshaped for rendering. */
  arFiles: Array<{ filename: string; content: string }>;
  /** KB commands with {IP}/{PORT}/{HOST} already interpolated. */
  kbCommands: Array<{ label: string; command: string }>;
  /** AutoRecon manual commands (from port_commands) with placeholders interpolated. */
  arCommands: Array<{ label: string; command: string }>;
  /** KB checks in KB-declared order — stable string keys, user-facing labels. */
  kbChecks: Array<{ key: string; label: string }>;
  /** Map from check_key → checked boolean. Missing key = never toggled (treated as unchecked). */
  checkMap: Map<string, boolean>;
  /** Risk rating from the KB entry (info|low|medium|high|critical). */
  risk: string;
  /** v2: nmap state reason (syn-ack, no-response, ...). */
  reason?: string;
  /** v2: CPE identifiers from `<cpe>`. */
  cpe?: string[];
}

/** Top-level engagement shape consumed by all Phase 06 export generators. */
export interface EngagementViewModel {
  /** Engagement row pass-through (name, target_ip, target_hostname, source, raw_input, os_*, warnings_json, created_at, updated_at). */
  engagement: FullEngagement;
  /** Ports sorted ASCENDING by port number. Rendering order is fixed by this array. */
  ports: PortViewModel[];
  /** Host-level NSE scripts (port_id = NULL, is_host_script = true). */
  hostScripts: PortScript[];
  /** Total number of KB checks across all ports (sum of ports[].kbChecks.length). */
  totalChecks: number;
  /** Number of KB checks marked checked=true in DB. */
  doneChecks: number;
  /** Coverage percentage — integer 0–100 via Math.round(100 * done / total). 0 when totalChecks === 0. */
  coverage: number;
  /** Warnings parsed from engagement.warnings_json (defaults to [] on parse failure — T-06-01). */
  warnings: string[];
  /** App version — `process.env.npm_package_version` at runtime, "0.0.0-dev" fallback for test contexts. */
  recon_deck_version: string;
  /** v2: scanner meta from `<nmaprun>`. */
  scanner?: ScannerInfo;
  /** v2: end-of-scan stats. */
  runstats?: RunStats;
  /** v2: extra-port summary. */
  extraPorts?: ExtraPortGroup[];
  /** v2: traceroute hops. */
  traceroute?: { proto?: string; port?: number; hops: Hop[] };
  /** v2: pre-scan script outputs. */
  preScripts?: ScriptOutput[];
  /** v2: post-scan script outputs. */
  postScripts?: ScriptOutput[];
  /** v2: full OS detection (matches + classes + fingerprint). */
  osMatches?: OsMatch[];
  /** v2: TCP/IP fingerprint blob. */
  osFingerprint?: string;
}

// -----------------------------------------------------------------------------
// Main entry point
// -----------------------------------------------------------------------------

/**
 * Transform a DB-loaded `FullEngagement` + pre-loaded `KnowledgeBase` into the
 * shared EngagementViewModel.
 *
 * Pure function — no DB calls, no KB file reads, no HTTP. Both inputs are
 * provided by the caller so this function stays unit-testable without spinning
 * up SQLite or reading YAML (RESEARCH.md Pitfall 5 mitigation).
 *
 * `wordlistOverrides` (P1-E): optional override map for `{WORDLIST_*}`
 * placeholder resolution. The page route reads it from `wordlist_overrides`
 * and threads it through. Empty/undefined → defaults from
 * `src/lib/kb/wordlists.ts` (DEFAULT_WORDLISTS) only.
 */
export function loadEngagementForExport(
  engagement: FullEngagement,
  kb: KnowledgeBase,
  wordlistOverrides?: Record<string, string>,
): EngagementViewModel {
  // v2: re-parse the source nmap output to surface enrichment fields not
  // persisted in the DB (cpe, reason, traceroute, OS classes, scanner,
  // runstats, extraports, pre/post scripts).
  //
  // Source resolution by `engagement.source`:
  //   nmap-xml  → engagement.raw_input (full XML)
  //   nmap-text → engagement.raw_input (text)
  //   autorecon → engagementArtifacts row {source: 'autorecon-service-nmap-xml',
  //               script_id: '_full_tcp_nmap.xml'} (XML stashed at import time
  //               because raw_input is just the zip filename for AR engagements).
  let reparsed: ParsedScan | undefined;
  if (engagement.source === "nmap-xml") {
    try {
      reparsed = parseNmapXml(engagement.raw_input);
    } catch {
      /* non-fatal */
    }
  } else if (engagement.source === "nmap-text") {
    try {
      reparsed = parseNmapText(engagement.raw_input);
    } catch {
      /* non-fatal */
    }
  } else if (engagement.source === "autorecon") {
    const xmlRow = engagement.engagementArtifacts.find(
      (a) =>
        a.source === "autorecon-service-nmap-xml" &&
        a.script_id === "_full_tcp_nmap.xml",
    );
    if (xmlRow) {
      try {
        reparsed = parseNmapXml(xmlRow.output);
      } catch {
        /* non-fatal */
      }
    }
  }

  const reparsedByPort = new Map<number, { reason?: string; cpe?: string[] }>();
  if (reparsed) {
    for (const p of reparsed.ports) {
      const meta: { reason?: string; cpe?: string[] } = {};
      if (p.reason) meta.reason = p.reason;
      if (p.cpe && p.cpe.length > 0) meta.cpe = p.cpe;
      if (meta.reason || meta.cpe) reparsedByPort.set(p.port, meta);
    }
  }

  // 1. Sort ports ASC — guarantees deterministic rendering order and stable
  //    JSON key order for downstream `checklist` / `notes` objects in the JSON
  //    export (RESEARCH.md Pitfall 3).
  const sortedPorts = [...engagement.ports].sort((a, b) => a.port - b.port);

  // 2. Parse warnings defensively (T-06-01 — matches the pattern on
  //    app/engagements/[id]/page.tsx lines 68–72).
  let warnings: string[] = [];
  try {
    const parsed: unknown = JSON.parse(engagement.warnings_json);
    if (Array.isArray(parsed)) {
      warnings = parsed.filter((w): w is string => typeof w === "string");
    }
  } catch {
    warnings = [];
  }

  // 3. Per-port assembly — mirrors the portData loop in
  //    app/engagements/[id]/page.tsx lines 82–156.
  let totalChecks = 0;
  let doneChecks = 0;

  const portVms: PortViewModel[] = sortedPorts.map((p) => {
    const kbEntry = matchPort(kb, p.port, p.service ?? undefined);

    const kbCommands = kbEntry.commands.map((cmd) => ({
      label: cmd.label,
      command: interpolateCommand(
        cmd.template,
        engagement.target_ip,
        p.port,
        engagement.target_hostname,
        wordlistOverrides,
      ),
    }));

    const kbChecks = kbEntry.checks.map((c) => ({ key: c.key, label: c.label }));

    // checkMap — only rows that exist in DB. Missing keys mean "never toggled"
    // which is treated as unchecked in the coverage calculation below. Using a
    // Map instead of Record<> lets consumers call .get() without worrying about
    // prototype keys or `undefined` vs `false` semantics.
    const checkMap = new Map<string, boolean>(
      p.checks.map((c) => [c.check_key, c.checked]),
    );

    totalChecks += kbChecks.length;
    doneChecks += kbChecks.filter((c) => checkMap.get(c.key) === true).length;

    // Phase 5 D-12 split: NSE (source='nmap' or legacy undefined) vs
    // AutoRecon per-port service file outputs (source='autorecon'). The
    // arFiles shape matches the PortCard arFiles contract: {filename, content}
    // where filename = script_id and content = full file body.
    const nseScripts = p.scripts.filter(
      (s) => !s.source || s.source === "nmap",
    );
    const arFiles = p.scripts
      .filter((s) => s.source === "autorecon")
      .map((s) => ({ filename: s.script_id, content: s.output }));

    const arCommands = p.commands.map((cmd) => ({
      label: cmd.label,
      command: interpolateCommand(
        cmd.template,
        engagement.target_ip,
        p.port,
        engagement.target_hostname,
        wordlistOverrides,
      ),
    }));

    const meta = reparsedByPort.get(p.port);
    return {
      port: p,
      nseScripts,
      arFiles,
      kbCommands,
      arCommands,
      kbChecks,
      checkMap,
      risk: kbEntry.risk,
      reason: meta?.reason,
      cpe: meta?.cpe,
    };
  });

  // 4. Coverage — integer 0-100 (RESEARCH.md Open Question 2 RESOLVED). No
  //    `%` suffix. Dividing zero is guarded so an empty engagement reports 0
  //    rather than NaN.
  const coverage =
    totalChecks === 0 ? 0 : Math.round((doneChecks / totalChecks) * 100);

  // 5. recon_deck_version — npm injects package.json `version` into
  //    process.env.npm_package_version when running `npm run` / `npm test`.
  //    In bundled production Next.js, next.config may surface it via env — for
  //    now fall back to a placeholder so exports never emit `"undefined"`.
  const recon_deck_version = process.env.npm_package_version ?? "0.0.0-dev";

  return {
    engagement,
    ports: portVms,
    hostScripts: engagement.hostScripts,
    totalChecks,
    doneChecks,
    coverage,
    warnings,
    recon_deck_version,
    scanner: reparsed?.scanner,
    runstats: reparsed?.runstats,
    extraPorts: reparsed?.extraPorts,
    traceroute: reparsed?.traceroute,
    preScripts: reparsed?.preScripts,
    postScripts: reparsed?.postScripts,
    osMatches: reparsed?.os?.matches,
    osFingerprint: reparsed?.os?.fingerprint,
  };
}
