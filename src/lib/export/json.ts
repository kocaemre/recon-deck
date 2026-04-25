import "server-only";

/**
 * JSON export — EXPORT-03.
 *
 * `generateJson(vm)` converts an EngagementViewModel into a deterministic,
 * pretty-printed JSON string whose shape is the round-trip contract locked by
 * 06-CONTEXT.md D-09 through D-13:
 *
 *   - Top-level keys in fixed order: schema_version, recon_deck_version,
 *     engagement, scan, checklist, notes (V8 preserves insertion order for
 *     string keys).
 *   - `schema_version: "1.0"` is bumped ONLY when the JSON shape changes; it
 *     is independent of `recon_deck_version` which tracks app releases (D-10).
 *   - `engagement` exposes only id / name / created_at / updated_at / source /
 *     raw_input — DB column names (target_ip, warnings_json, os_accuracy,
 *     os_name, scanned_at, target_hostname) do NOT leak. Those belong to
 *     the `scan` sub-object, which mirrors `ParsedScan` from
 *     src/lib/parser/types.ts verbatim (D-09).
 *   - `checklist` / `notes` are overlay objects keyed by `"port/proto"` strings
 *     (e.g. "22/tcp"), never by integer DB port_id (D-12).
 *   - AR files/commands appear under `scan.ports[].arFiles` /
 *     `scan.ports[].arCommands` only when the engagement source is "autorecon"
 *     AND the port actually has AR data (D-13). The key is omitted entirely
 *     otherwise — not emitted as `null` or `[]`.
 *
 * Determinism invariants (critical for the golden fixture byte-diff):
 *   - Ports sorted ASC by port number.
 *   - Check keys sorted alphabetically within each port.
 *   - No wall-clock or random sources (no Date constructor, no current-time
 *     helpers, no RNG) anywhere in this module. All timestamps flow through
 *     from the input view model.
 *
 * raw_input encoding (D-11 / spec discretion):
 *   Passed through verbatim as a JSON string — nmap-text, nmap-xml, and the
 *   AutoRecon zip filename are all text-safe for JSON. JSON.stringify handles
 *   any embedded quotes/newlines per the spec. No base64 encoding is needed.
 *
 * No barrel file at src/lib/export/index.ts — callers import this module by
 * full path (`@/lib/export/json`) per Plan 01's no-barrel decision.
 */

import type { EngagementViewModel, PortViewModel } from "./view-model";

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

/**
 * Map a `PortScript` row shape to the ParsedScan `ScriptOutput` shape
 * `{ id, output }` — the JSON export uses ParsedScan vocabulary, not DB
 * column names.
 */
function toScriptOutput(script: {
  script_id: string;
  output: string;
}): { id: string; output: string } {
  return { id: script.script_id, output: script.output };
}

/**
 * Build the per-port scan entry for `scan.ports[]` from a PortViewModel.
 *
 * Key order mirrors ParsedScan.ParsedPort:
 *   port, protocol, state, service?, product?, version?, tunnel?, extrainfo?,
 *   scripts, arFiles?, arCommands?
 *
 * Optional fields (service/product/version/tunnel/extrainfo) are omitted
 * entirely when null/undefined so the output stays small and downstream
 * consumers can distinguish "never present" from "explicitly null".
 *
 * `arFiles` and `arCommands` are included ONLY when the engagement source is
 * "autorecon" AND the port actually has entries (D-13). The AR commands shape
 * is `{ label, template }` — the UNINTERPOLATED template is exported so the
 * JSON remains a round-trip vehicle; the interpolated `command` form is only
 * for UI consumption.
 */
function buildPortEntry(
  pvm: PortViewModel,
  engagementSource: EngagementViewModel["engagement"]["source"],
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    port: pvm.port.port,
    protocol: pvm.port.protocol,
    state: pvm.port.state,
  };

  if (pvm.port.service != null) entry.service = pvm.port.service;
  if (pvm.port.product != null) entry.product = pvm.port.product;
  if (pvm.port.version != null) entry.version = pvm.port.version;
  if (pvm.port.tunnel != null) entry.tunnel = pvm.port.tunnel;
  if (pvm.port.extrainfo != null) entry.extrainfo = pvm.port.extrainfo;
  // v2: nmap state reason + CPE identifiers (omitted when absent).
  if (pvm.reason != null) entry.reason = pvm.reason;
  if (pvm.cpe && pvm.cpe.length > 0) entry.cpe = pvm.cpe;

  // NSE scripts — already filtered by the view model to source !== 'autorecon'.
  entry.scripts = pvm.nseScripts.map(toScriptOutput);

  // AR arrays only materialize for autorecon engagements with actual data
  // (D-13: Null/omitted otherwise).
  if (engagementSource === "autorecon") {
    if (pvm.arFiles.length > 0) {
      entry.arFiles = pvm.arFiles.map((f) => ({
        filename: f.filename,
        content: f.content,
      }));
    }
    if (pvm.port.commands.length > 0) {
      // Raw template, NOT the interpolated command. Round-trip fidelity.
      entry.arCommands = pvm.port.commands.map((cmd) => ({
        label: cmd.label,
        template: cmd.template,
      }));
    }
  }

  return entry;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Convert an EngagementViewModel into a pretty-printed JSON export string.
 *
 * Output is:
 *   - Deterministic (same VM → identical bytes)
 *   - 2-space indented (human-reviewable in diffs)
 *   - Round-trip capable (raw_input preserved, checklist keyed by port/proto)
 *   - Decoupled from DB column names (scan sub-object mirrors ParsedScan)
 */
export function generateJson(vm: EngagementViewModel): string {
  // 1. Ports are already ASC-sorted in the view model, but re-sort defensively
  //    so this function is robust to callers that hand-assemble a VM.
  const sortedPorts = [...vm.ports].sort(
    (a, b) => a.port.port - b.port.port,
  );

  // 2. Engagement sub-object — exactly 6 keys in locked order.
  //    DB-internal columns (target_ip, target_hostname, os_name, os_accuracy,
  //    scanned_at, warnings_json) deliberately excluded; they belong in the
  //    `scan` sub-object per D-09.
  const engagement = {
    id: vm.engagement.id,
    name: vm.engagement.name,
    created_at: vm.engagement.created_at,
    updated_at: vm.engagement.updated_at,
    source: vm.engagement.source,
    raw_input: vm.engagement.raw_input,
  };

  // 3. Scan sub-object — ParsedScan shape verbatim. Optional keys
  //    (target.hostname, scannedAt, os) omitted when null/undefined.
  const scanTarget: { ip: string; hostname?: string } = {
    ip: vm.engagement.target_ip,
  };
  if (vm.engagement.target_hostname != null) {
    scanTarget.hostname = vm.engagement.target_hostname;
  }

  const scan: Record<string, unknown> = {
    target: scanTarget,
  };

  if (vm.engagement.scanned_at != null) {
    scan.scannedAt = vm.engagement.scanned_at;
  }

  scan.source = vm.engagement.source;
  scan.ports = sortedPorts.map((pvm) =>
    buildPortEntry(pvm, vm.engagement.source),
  );
  scan.hostScripts = vm.hostScripts.map(toScriptOutput);

  // v2: prefer the re-parsed OS detail (matches + classes + fingerprint) when
  // available; otherwise fall back to the legacy {name, accuracy} pair stored
  // on the engagement row.
  if (vm.osMatches && vm.osMatches.length > 0) {
    const os: Record<string, unknown> = {
      matches: vm.osMatches,
    };
    if (vm.osMatches[0]?.name) os.name = vm.osMatches[0].name;
    if (vm.osMatches[0]?.accuracy !== undefined) {
      os.accuracy = vm.osMatches[0].accuracy;
    }
    if (vm.osFingerprint) os.fingerprint = vm.osFingerprint;
    scan.os = os;
  } else if (vm.engagement.os_name != null) {
    const os: { name: string; accuracy?: number } = {
      name: vm.engagement.os_name,
    };
    if (vm.engagement.os_accuracy != null) {
      os.accuracy = vm.engagement.os_accuracy;
    }
    scan.os = os;
  }

  // v2: scanner / runstats / extraports / traceroute / pre/post scripts.
  if (vm.scanner) scan.scanner = vm.scanner;
  if (vm.runstats) scan.runstats = vm.runstats;
  if (vm.extraPorts && vm.extraPorts.length > 0) scan.extraPorts = vm.extraPorts;
  if (vm.traceroute) scan.traceroute = vm.traceroute;
  if (vm.preScripts && vm.preScripts.length > 0) {
    scan.preScripts = vm.preScripts.map((s) => ({ id: s.id, output: s.output }));
  }
  if (vm.postScripts && vm.postScripts.length > 0) {
    scan.postScripts = vm.postScripts.map((s) => ({ id: s.id, output: s.output }));
  }

  scan.warnings = vm.warnings;

  // 4. Checklist overlay — `Record<port/proto, Record<check_key, {checked, toggled_at}>>`.
  //    Outer keys (port/proto) inserted in ASC port order via sortedPorts.
  //    Inner keys (check_key) sorted alphabetically for byte-stable output.
  //    Ports with no check states are omitted (no empty objects in output).
  const checklist: Record<
    string,
    Record<string, { checked: boolean; toggled_at: string }>
  > = {};
  for (const pvm of sortedPorts) {
    const portKey = `${pvm.port.port}/${pvm.port.protocol}`;
    const sortedChecks = [...pvm.port.checks].sort((a, b) =>
      a.check_key.localeCompare(b.check_key),
    );
    const portChecks: Record<
      string,
      { checked: boolean; toggled_at: string }
    > = {};
    for (const cs of sortedChecks) {
      portChecks[cs.check_key] = {
        checked: cs.checked,
        toggled_at: cs.updated_at,
      };
    }
    if (Object.keys(portChecks).length > 0) {
      checklist[portKey] = portChecks;
    }
  }

  // 5. Notes overlay — `Record<port/proto, string>`. Only include ports with
  //    non-empty notes body (D-06 analog for JSON: don't emit empty strings).
  const notes: Record<string, string> = {};
  for (const pvm of sortedPorts) {
    const body = pvm.port.notes?.body;
    if (body != null && body.trim() !== "") {
      notes[`${pvm.port.port}/${pvm.port.protocol}`] = body;
    }
  }

  // 6. Assemble top-level object with keys in LOCKED order (D-09). V8 preserves
  //    string-key insertion order, so the resulting JSON.stringify output will
  //    have these keys in exactly this sequence.
  const output = {
    schema_version: "1.0" as const,
    recon_deck_version: vm.recon_deck_version,
    engagement,
    scan,
    checklist,
    notes,
  };

  // 7. Pretty-print with 2-space indent — small footprint, diffable in PRs.
  return JSON.stringify(output, null, 2);
}
