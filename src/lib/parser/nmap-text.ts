import "server-only";

/**
 * nmap -oN (normal text output) parser — Phase 2 Plan 03.
 *
 * Contract: `(raw: string) => ParsedScan` — see `./types.ts` (D-01).
 *
 * Multi-host: every `Nmap scan report for ...` block produces one
 * `ParsedHost` entry inside `result.hosts[]`. Top-level legacy fields
 * (`target`, `ports`, `hostScripts`, `os`, `extraPorts`, `traceroute`)
 * mirror `hosts[0]` for backward compatibility.
 *
 * Other contracts:
 * - State normalization per D-02: `open|filtered` → `filtered` with warning;
 *   `closed` / `closed|filtered` / `unfiltered` ports are dropped silently.
 * - Service names lowercased + trimmed (D-05); product/version/extrainfo
 *   verbatim (D-06).
 * - Empty / whitespace-only input throws with an actionable message
 *   (D-07, INPUT-04). Error messages contain no stack frame syntax
 *   (TEST-02: `/at Object\.|at new |\s+at /` must not match).
 * - NSE output collected under each port from `| line` / `|_ line` continuation
 *   prefixes until the next port header or `Host script results:` section.
 *   Host-level scripts captured into the active builder's `hostScripts[]`.
 *
 * Keep server-side only per ARCHITECTURE.md bundle strategy — this module must not
 * ship to the browser bundle.
 */

import type {
  Hop,
  OsInfo,
  ParsedHost,
  ParsedPort,
  ParsedScan,
  ScriptOutput,
} from "./types";

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

  const withParens = /^(.+?)\s+\(([^)]+)\)$/.exec(rest);
  if (withParens) {
    const name = withParens[1].trim();
    const ip = withParens[2].trim();
    if (IP_RE.test(ip)) {
      return { ip, hostname: name };
    }
  }

  if (IP_RE.test(rest)) {
    return { ip: rest };
  }

  return { ip: rest };
}

/**
 * Port line:
 *   `22/tcp  open  ssh     OpenSSH 8.9p1 Ubuntu 3ubuntu0.6`
 *   `53/udp  open|filtered domain`
 *   `443/tcp open  ssl/http`
 */
const PORT_LINE_RE =
  /^(\d+)\/(tcp|udp|sctp|ip)\s+(open(?:\|filtered)?|filtered|closed(?:\|filtered)?|unfiltered)\s+(\S+)(?:\s+(.+?))?\s*$/;

const NSE_CONT_RE = /^\|\s+(.+)$/;
const NSE_TERM_RE = /^\|_\s*(.+)$/;
const HOST_SCRIPT_HEADER_RE = /^Host script results:\s*$/;
const NSE_ID_HEADER_RE = /^([A-Za-z0-9][\w-]*):\s*(.*)$/;

function splitVersionBlob(
  blob: string | undefined,
): Pick<ParsedPort, "product" | "version" | "extrainfo"> {
  if (!blob) return {};
  const trimmed = blob.trim();
  if (!trimmed) return {};

  let extrainfo: string | undefined;
  let head = trimmed;
  const paren = /\s*\(([^()]*)\)\s*$/.exec(trimmed);
  if (paren) {
    extrainfo = paren[1].trim();
    head = trimmed.slice(0, paren.index).trim();
  }

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

function finalizeScript(lines: string[]): ScriptOutput | undefined {
  if (lines.length === 0) return undefined;

  const first = lines[0];
  const idMatch = NSE_ID_HEADER_RE.exec(first);
  if (!idMatch) {
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
 * Per-host accumulator. Built up while parsing one host block, finalized
 * into a ParsedHost when the next `Nmap scan report for ...` line arrives
 * or at EOF.
 */
type HostBuilder = {
  target: { ip: string; hostname?: string };
  ports: ParsedPort[];
  hostScripts: ScriptOutput[];
  extraPorts: { state: string; count: number }[];
  osMatches: { name: string; accuracy?: number }[];
  osDetailsLine?: string;
  tracerouteHops: Hop[];
  tracerouteProto?: string;
};

function newBuilder(target: { ip: string; hostname?: string }): HostBuilder {
  return {
    target,
    ports: [],
    hostScripts: [],
    extraPorts: [],
    osMatches: [],
    tracerouteHops: [],
  };
}

function finalizeBuilder(b: HostBuilder): ParsedHost {
  const host: ParsedHost = {
    target: b.target,
    ports: b.ports,
    hostScripts: b.hostScripts,
  };
  if (b.extraPorts.length > 0) host.extraPorts = b.extraPorts;
  if (b.osMatches.length > 0 || b.osDetailsLine) {
    const sorted = [...b.osMatches].sort(
      (a, c) => (c.accuracy ?? 0) - (a.accuracy ?? 0),
    );
    const best = sorted[0];
    const os: OsInfo = { matches: sorted };
    if (best?.name) os.name = best.name;
    if (best?.accuracy !== undefined) os.accuracy = best.accuracy;
    host.os = os;
  }
  if (b.tracerouteHops.length > 0) {
    host.traceroute = { hops: b.tracerouteHops };
    if (b.tracerouteProto) host.traceroute.proto = b.tracerouteProto;
  }
  return host;
}

export function parseNmapText(input: string): ParsedScan {
  if (!input || !input.trim()) {
    throw new Error(
      "Empty nmap output — paste the full scan result (the text between the first 'Nmap scan report' header and the final 'Nmap done' line).",
    );
  }

  const warnings: string[] = [];
  const parsedHosts: ParsedHost[] = [];
  let builder: HostBuilder | undefined;

  type Phase = "preamble" | "ports" | "hostscript";
  let phase: Phase = "preamble";
  let currentPort: ParsedPort | undefined;
  let nseBuffer: string[] = [];
  let tracerouteCollecting = false;

  const flushNseBufferTo = (dest: ScriptOutput[]) => {
    if (nseBuffer.length === 0) return;
    const s = finalizeScript(nseBuffer);
    if (s) dest.push(s);
    nseBuffer = [];
  };

  const flushPendingNseToCurrentScope = () => {
    if (nseBuffer.length === 0) return;
    const dest =
      phase === "hostscript"
        ? builder?.hostScripts
        : currentPort?.scripts;
    if (dest) flushNseBufferTo(dest);
    else nseBuffer = [];
  };

  const lines = input.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");

    // Host boundary first — closes the previous host block before any
    // host-scoped pattern (NSE, OS, traceroute, port table) gets a chance
    // to pollute the next builder.
    if (/^Nmap scan report for /.test(line)) {
      // Close NSE buffers and attribute them to the previous host.
      if (builder) {
        if (phase === "hostscript") {
          flushNseBufferTo(builder.hostScripts);
        } else if (currentPort) {
          flushNseBufferTo(currentPort.scripts);
        }
        // Finalize the outgoing builder.
        parsedHosts.push(finalizeBuilder(builder));
      }
      const parsed = parseHostLine(line);
      builder = parsed ? newBuilder(parsed) : undefined;
      currentPort = undefined;
      tracerouteCollecting = false;
      phase = "preamble";
      continue;
    }

    // Everything below requires an active host builder. Lines before the
    // first `Nmap scan report` header (preamble comments) are tossed.
    if (!builder) continue;

    if (/^Not shown:/.test(line)) {
      const groups = line.replace(/^Not shown:\s*/, "").split(/,\s*/);
      for (const g of groups) {
        const m = /^(\d+)\s+(closed|filtered|open\|filtered|closed\|filtered|unfiltered)\b/.exec(
          g,
        );
        if (m) {
          builder.extraPorts.push({ state: m[2], count: Number(m[1]) });
        }
      }
      continue;
    }

    if (/^OS details:/.test(line)) {
      builder.osDetailsLine = line.replace(/^OS details:\s*/, "").trim();
      for (const g of builder.osDetailsLine.split(/,\s*/)) {
        if (g.length > 0) builder.osMatches.push({ name: g });
      }
      continue;
    }
    if (/^Aggressive OS guesses:/.test(line)) {
      const rest = line.replace(/^Aggressive OS guesses:\s*/, "");
      const items = rest.split(/,\s*/);
      for (const it of items) {
        const m = /^(.+?)\s*\((\d+)%\)\s*$/.exec(it);
        if (m) {
          builder.osMatches.push({
            name: m[1].trim(),
            accuracy: Number(m[2]),
          });
        } else if (it.trim().length > 0) {
          builder.osMatches.push({ name: it.trim() });
        }
      }
      continue;
    }

    if (/^TRACEROUTE/.test(line)) {
      tracerouteCollecting = true;
      const m = /\(using port\s+(\d+)\/(tcp|udp)\)/.exec(line);
      if (m) builder.tracerouteProto = m[2];
      continue;
    }
    if (tracerouteCollecting) {
      if (/^HOP\s+RTT/.test(line)) continue;
      if (line.trim() === "") {
        tracerouteCollecting = false;
        continue;
      }
      const m =
        /^\s*(\d+)\s+(?:(\d+(?:\.\d+)?)\s*ms|\.\.\.)\s+([0-9a-fA-F:.]+)(?:\s+\(([^)]+)\))?\s*$/.exec(
          line,
        );
      if (m) {
        const hop: Hop = {
          ttl: Number(m[1]),
          ipaddr: m[3],
        };
        if (m[2] !== undefined) hop.rtt = Number(m[2]);
        if (m[4]) hop.host = m[4];
        builder.tracerouteHops.push(hop);
        continue;
      }
      tracerouteCollecting = false;
    }

    if (HOST_SCRIPT_HEADER_RE.test(line)) {
      if (currentPort) {
        flushNseBufferTo(currentPort.scripts);
      }
      currentPort = undefined;
      phase = "hostscript";
      continue;
    }

    if (/^PORT\s+STATE\s+SERVICE(?:\s+VERSION)?\s*$/.test(line)) {
      phase = "ports";
      continue;
    }

    const portMatch = PORT_LINE_RE.exec(line);
    if (portMatch && (phase === "ports" || phase === "preamble")) {
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

      if (protoStr !== "tcp" && protoStr !== "udp") {
        warnings.push(
          `Skipped port ${portStr}/${protoStr}: protocol not supported in v1.0 (only tcp/udp).`,
        );
        currentPort = undefined;
        continue;
      }

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
        state = "filtered";
        warnings.push(
          `Port ${portStr}/${protoStr}: nmap reported 'open|filtered' — normalized to 'filtered'. Re-run with -sS or -sT to disambiguate.`,
        );
      }

      let serviceField = serviceStr;
      let tunnel: "ssl" | undefined;
      if (serviceField && /^ssl\//.test(serviceField)) {
        tunnel = "ssl";
        serviceField = serviceField.slice(4);
      }
      const service =
        serviceField && serviceField !== "?"
          ? serviceField.toLowerCase().trim()
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
      if (tunnel) newPort.tunnel = tunnel;
      builder.ports.push(newPort);
      currentPort = newPort;
      phase = "ports";
      continue;
    }

    const nseContMatch = NSE_CONT_RE.exec(line);
    const nseTermMatch = NSE_TERM_RE.exec(line);

    if (nseContMatch || nseTermMatch) {
      const body = (nseContMatch ?? nseTermMatch)![1];

      const idHdr = NSE_ID_HEADER_RE.exec(body);
      if (idHdr && nseBuffer.length > 0) {
        const dest =
          phase === "hostscript"
            ? builder.hostScripts
            : currentPort?.scripts ?? [];
        flushNseBufferTo(dest);
      }

      nseBuffer.push(body);

      if (nseTermMatch) {
        const dest =
          phase === "hostscript"
            ? builder.hostScripts
            : currentPort?.scripts;
        if (dest) {
          flushNseBufferTo(dest);
        } else {
          warnings.push(
            `Orphaned NSE output line ignored (no owning port): ${body.slice(0, 40)}`,
          );
          nseBuffer = [];
        }
      }
      continue;
    }

    if (line.trim() === "") {
      flushPendingNseToCurrentScope();
      continue;
    }

    flushPendingNseToCurrentScope();

    if (/^\d+\//.test(line) && phase === "ports") {
      warnings.push(`Skipped unparseable port line: ${line.trim()}`);
    }
  }

  // Tail: flush any open NSE buffer + finalize the trailing host builder.
  if (builder) {
    if (nseBuffer.length > 0) {
      const dest =
        phase === "hostscript"
          ? builder.hostScripts
          : currentPort?.scripts;
      if (dest) flushNseBufferTo(dest);
    }
    parsedHosts.push(finalizeBuilder(builder));
  }

  if (parsedHosts.length === 0) {
    throw new Error(
      "No 'Nmap scan report for' header found — paste the full nmap -oN output, or use -oX (XML) for structured input.",
    );
  }

  const primary = parsedHosts[0];
  const result: ParsedScan = {
    hosts: parsedHosts,
    target: primary.target,
    source: "nmap-text",
    ports: primary.ports,
    hostScripts: primary.hostScripts,
    warnings,
  };
  if (primary.os) result.os = primary.os;
  if (primary.extraPorts && primary.extraPorts.length > 0) {
    result.extraPorts = primary.extraPorts;
  }
  if (primary.traceroute) result.traceroute = primary.traceroute;

  return result;
}
