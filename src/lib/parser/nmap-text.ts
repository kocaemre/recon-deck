import "server-only";

/**
 * nmap -oN (normal text output) parser — Phase 2 Plan 03.
 *
 * Contract: `(raw: string) => ParsedScan` — see `./types.ts` (D-01).
 *
 * Design notes:
 * - Line-oriented regex. Split on host boundaries first, extract port table
 *   lines within each host block. Prevents cross-host port attribution
 *   (see §Architecture Patterns Anti-Patterns in 02-RESEARCH.md).
 * - First-host-only per D-09 / CD-03: mirrors XML parser behavior for
 *   consistency. Remaining hosts surface as a `warnings[]` entry.
 * - State normalization per D-02: `open|filtered` → `filtered` with warning;
 *   `closed` / `closed|filtered` / `unfiltered` ports are dropped silently.
 * - Service names lowercased + trimmed (D-05); product/version/extrainfo
 *   verbatim (D-06).
 * - Empty / whitespace-only input throws with an actionable message
 *   (D-07, INPUT-04). Error messages contain no stack frame syntax
 *   (TEST-02: `/at Object\.|at new |\s+at /` must not match).
 * - NSE output collected under each port from `| line` / `|_ line` continuation
 *   prefixes until the next port header or `Host script results:` section.
 *   Host-level scripts captured into `hostScripts[]` (D-04, PARSE-03).
 *
 * Keep server-side only per ARCHITECTURE.md bundle strategy — this module must not
 * ship to the browser bundle.
 */

import type { ParsedPort, ParsedScan, ScriptOutput } from "./types";

/** IPv4 dotted quad or IPv6 (contains `:`). */
const IP_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+)$/;

/**
 * Parse `Nmap scan report for X` target line.
 * Forms observed:
 *   `Nmap scan report for box.htb (10.10.10.5)`   → hostname + IPv4
 *   `Nmap scan report for 10.10.10.5`              → IPv4 only
 *   `Nmap scan report for ::1`                     → IPv6 only (no parens)
 *   `Nmap scan report for target.example (fe80::1)` → hostname + IPv6
 */
function parseHostLine(
  line: string,
): { ip: string; hostname?: string } | undefined {
  const m = /^Nmap scan report for\s+(.+?)\s*$/.exec(line);
  if (!m) return undefined;
  const rest = m[1].trim();

  // Form: "name (ip)"
  const withParens = /^(.+?)\s+\(([^)]+)\)$/.exec(rest);
  if (withParens) {
    const name = withParens[1].trim();
    const ip = withParens[2].trim();
    // Guard: only treat `name` as hostname when the paren-value is actually an IP.
    if (IP_RE.test(ip)) {
      return { ip, hostname: name };
    }
    // Paren content is not an IP — treat the whole rest as IP/host best effort.
    // Fall through to bare-form handling below.
  }

  // Bare IP (v4 or v6)
  if (IP_RE.test(rest)) {
    return { ip: rest };
  }

  // Bare hostname with no IP (uncommon; nmap usually resolves). Treat
  // value as ip slot so downstream code has *something* to display.
  return { ip: rest };
}

/**
 * Port line:
 *   `22/tcp  open  ssh     OpenSSH 8.9p1 Ubuntu 3ubuntu0.6`
 *   `53/udp  open|filtered domain`
 *   `443/tcp open  ssl/http`
 *
 * Groups: 1=port, 2=protocol, 3=state, 4=service, 5=version-blob (optional)
 *
 * Pitfall 5 guard: pipe character inside the state group must be a literal,
 * not an alternation boundary (see 02-RESEARCH.md Pitfall 5).
 */
const PORT_LINE_RE =
  /^(\d+)\/(tcp|udp|sctp|ip)\s+(open(?:\|filtered)?|filtered|closed(?:\|filtered)?|unfiltered)\s+(\S+)(?:\s+(.+?))?\s*$/;

/** NSE per-port continuation line: `|   key: value` or `| text`. */
const NSE_CONT_RE = /^\|\s+(.+)$/;
/** NSE per-port terminator line: `|_text`. */
const NSE_TERM_RE = /^\|_\s*(.+)$/;

/** Host-script section header. */
const HOST_SCRIPT_HEADER_RE = /^Host script results:\s*$/;

/**
 * Detect a script-id header within an NSE block:
 *   `| http-title: Example Domain`   → id='http-title', rest='Example Domain'
 *   `| smb-os-discovery:`            → id='smb-os-discovery', rest=''
 */
const NSE_ID_HEADER_RE = /^([A-Za-z0-9][\w-]*):\s*(.*)$/;

/**
 * Product/version split heuristic: the text parser concatenates product +
 * version + extrainfo into one VERSION column. `-oN` doesn't structure these
 * as separate fields, so we do a conservative split: first whitespace-separated
 * token is `product`, remainder is `version`. Extra parenthesized info goes
 * verbatim into `extrainfo` if easily detectable; otherwise stays in version.
 */
function splitVersionBlob(
  blob: string | undefined,
): Pick<ParsedPort, "product" | "version" | "extrainfo"> {
  if (!blob) return {};
  const trimmed = blob.trim();
  if (!trimmed) return {};

  // Try to peel a trailing `(...)` extrainfo group.
  let extrainfo: string | undefined;
  let head = trimmed;
  const paren = /\s*\(([^()]*)\)\s*$/.exec(trimmed);
  if (paren) {
    extrainfo = paren[1].trim();
    head = trimmed.slice(0, paren.index).trim();
  }

  // First token = product, rest = version.
  const firstSpace = head.indexOf(" ");
  if (firstSpace === -1) {
    return { product: head || undefined, extrainfo };
  }
  const product = head.slice(0, firstSpace);
  const version = head.slice(firstSpace + 1).trim();
  return {
    product: product || undefined,
    version: version || undefined,
    extrainfo,
  };
}

/**
 * Finalize an accumulated NSE buffer into a ScriptOutput.
 * The first continuation line that matches `id: rest` names the script;
 * remaining lines are joined with `\n`.
 */
function finalizeScript(lines: string[]): ScriptOutput | undefined {
  if (lines.length === 0) return undefined;

  // Locate the id header (usually the first line).
  const first = lines[0];
  const idMatch = NSE_ID_HEADER_RE.exec(first);
  if (!idMatch) {
    // No id header — return as anonymous script so we at least preserve text.
    return { id: "", output: lines.join("\n") };
  }
  const id = idMatch[1];
  const firstRest = idMatch[2];
  const body = [firstRest, ...lines.slice(1)]
    .filter((l) => l.length > 0)
    .join("\n");
  return { id, output: body };
}

/**
 * Main entry point.
 */
export function parseNmapText(input: string): ParsedScan {
  if (!input || !input.trim()) {
    // D-07: actionable, no stack frame syntax.
    throw new Error(
      "Empty nmap output — paste the full scan result (the text between the first 'Nmap scan report' header and the final 'Nmap done' line).",
    );
  }

  const warnings: string[] = [];
  const ports: ParsedPort[] = [];
  const hostScripts: ScriptOutput[] = [];
  let target: { ip: string; hostname?: string } | undefined;

  // Count hosts up front for the D-09 warning.
  const hostHeaders = input.match(/^Nmap scan report for /gm) ?? [];
  const hostCount = hostHeaders.length;

  const lines = input.split(/\r?\n/);

  // State machine:
  //   phase: 'preamble' | 'ports' | 'hostscript' | 'done'
  //   currentPort: the ParsedPort whose `scripts[]` accumulates NSE lines
  //   nseBuffer: lines of the currently-open script block (per-port OR host)
  //   hostIndex: 0 = active host, >0 = additional hosts we ignore
  type Phase = "preamble" | "ports" | "hostscript" | "done";
  let phase: Phase = "preamble";
  let currentPort: ParsedPort | undefined;
  let nseBuffer: string[] = [];
  let hostIndex = -1;

  const flushNseBufferTo = (dest: ScriptOutput[]) => {
    if (nseBuffer.length === 0) return;
    const s = finalizeScript(nseBuffer);
    if (s) dest.push(s);
    nseBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, ""); // trim trailing whitespace only

    // Host boundary: `Nmap scan report for ...`
    if (/^Nmap scan report for /.test(line)) {
      hostIndex += 1;

      if (hostIndex === 0) {
        // First host → bind target.
        const parsed = parseHostLine(line);
        if (parsed) target = parsed;
        phase = "preamble";
        continue;
      }

      // Second+ host → stop accumulating for it (D-09 mirrored via CD-03).
      // Flush any currently-open NSE buffer into the active destination
      // before we shut down host-level parsing.
      if (phase === "hostscript") {
        flushNseBufferTo(hostScripts);
      } else if (currentPort) {
        flushNseBufferTo(currentPort.scripts);
      }
      currentPort = undefined;
      phase = "done";
      continue;
    }

    if (phase === "done") {
      // Past the first host — skip everything.
      continue;
    }

    // Host-level scripts section header.
    if (HOST_SCRIPT_HEADER_RE.test(line)) {
      // Close any trailing per-port script buffer.
      if (currentPort) {
        flushNseBufferTo(currentPort.scripts);
      }
      currentPort = undefined;
      phase = "hostscript";
      continue;
    }

    // Port table column header: `PORT   STATE SERVICE VERSION`
    if (/^PORT\s+STATE\s+SERVICE(?:\s+VERSION)?\s*$/.test(line)) {
      phase = "ports";
      continue;
    }

    // Port line.
    const portMatch = PORT_LINE_RE.exec(line);
    if (portMatch && (phase === "ports" || phase === "preamble")) {
      // Close out any open NSE buffer attached to the previous port.
      if (currentPort) {
        flushNseBufferTo(currentPort.scripts);
      }

      const [, portStr, protoStr, stateStr, serviceStr, versionBlob] =
        portMatch;
      const portNum = Number(portStr);
      if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
        warnings.push(
          `Skipped port line with out-of-range port number: ${portStr}`,
        );
        currentPort = undefined;
        continue;
      }

      // D-08: skip unsupported protocols (sctp/ip) with warning.
      if (protoStr !== "tcp" && protoStr !== "udp") {
        warnings.push(
          `Skipped port ${portStr}/${protoStr}: protocol not supported in v1.0 (only tcp/udp).`,
        );
        currentPort = undefined;
        continue;
      }

      // D-02: drop closed/unfiltered; normalize open|filtered → filtered.
      let state: "open" | "filtered";
      if (
        stateStr === "closed" ||
        stateStr === "unfiltered" ||
        stateStr === "closed|filtered"
      ) {
        currentPort = undefined;
        phase = "ports";
        continue;
      }
      if (stateStr === "open") {
        state = "open";
      } else if (stateStr === "filtered") {
        state = "filtered";
      } else {
        // open|filtered
        state = "filtered";
        warnings.push(
          `Port ${portStr}/${protoStr}: nmap reported 'open|filtered' — normalized to 'filtered'. Re-run with -sS or -sT to disambiguate.`,
        );
      }

      const service =
        serviceStr && serviceStr !== "?"
          ? serviceStr.toLowerCase().trim()
          : undefined;
      const { product, version, extrainfo } = splitVersionBlob(versionBlob);

      const newPort: ParsedPort = {
        port: portNum,
        protocol: protoStr,
        state,
        service,
        product,
        version,
        extrainfo,
        scripts: [],
      };
      ports.push(newPort);
      currentPort = newPort;
      phase = "ports";
      continue;
    }

    // NSE continuation lines (applies to both per-port scripts and host scripts).
    const nseContMatch = NSE_CONT_RE.exec(line);
    const nseTermMatch = NSE_TERM_RE.exec(line);

    if (nseContMatch || nseTermMatch) {
      const body = (nseContMatch ?? nseTermMatch)![1];

      // Starting-a-new-script detection: a line that begins with `|` and looks
      // like `<id>: ...` kicks off a fresh buffer IF the buffer already holds
      // a different id. The simple rule used here: whenever we match an
      // id-header on a continuation line AND the buffer already has content,
      // flush the previous script and start a new one.
      const idHdr = NSE_ID_HEADER_RE.exec(body);
      if (idHdr && nseBuffer.length > 0) {
        const dest =
          phase === "hostscript"
            ? hostScripts
            : currentPort?.scripts ?? [];
        flushNseBufferTo(dest);
      }

      nseBuffer.push(body);

      // `|_` is the terminator — finalize immediately.
      if (nseTermMatch) {
        const dest =
          phase === "hostscript" ? hostScripts : currentPort?.scripts;
        if (dest) {
          flushNseBufferTo(dest);
        } else {
          // Orphaned script (no owning port). Drop buffer with a warning.
          warnings.push(
            `Orphaned NSE output line ignored (no owning port): ${body.slice(0, 40)}`,
          );
          nseBuffer = [];
        }
      }
      continue;
    }

    // Blank line closes an open NSE buffer.
    if (line.trim() === "") {
      if (nseBuffer.length > 0) {
        const dest =
          phase === "hostscript" ? hostScripts : currentPort?.scripts;
        if (dest) flushNseBufferTo(dest);
        else nseBuffer = [];
      }
      continue;
    }

    // Otherwise: it's a line we don't recognize (e.g. "Service Info:",
    // "Not shown:", "Host is up", "# Nmap done"). Close any open NSE buffer
    // and move on. If the line looks like a port table entry but we didn't
    // match, surface a warning for forensic value.
    if (nseBuffer.length > 0) {
      const dest =
        phase === "hostscript" ? hostScripts : currentPort?.scripts;
      if (dest) flushNseBufferTo(dest);
      else nseBuffer = [];
    }

    if (/^\d+\//.test(line) && phase === "ports") {
      // Looked like a port line but didn't match the full regex.
      warnings.push(`Skipped unparseable port line: ${line.trim()}`);
    }
  }

  // Tail flush: close any lingering NSE buffer at EOF.
  if (nseBuffer.length > 0) {
    const dest =
      phase === "hostscript" ? hostScripts : currentPort?.scripts;
    if (dest) flushNseBufferTo(dest);
  }

  // Multi-host warning (D-09 mirrored via CD-03).
  if (hostCount > 1) {
    warnings.push(
      `Multi-host scan: ${hostCount - 1} additional host(s) ignored — create a separate engagement per host, or use nmap -oX for multi-host parsing.`,
    );
  }

  // If we never found a target line, raise a clear error — D-07 spirit.
  if (!target) {
    throw new Error(
      "No 'Nmap scan report for' header found — paste the full nmap -oN output, or use -oX (XML) for structured input.",
    );
  }

  return {
    target,
    source: "nmap-text",
    ports,
    hostScripts,
    warnings,
  };
}
