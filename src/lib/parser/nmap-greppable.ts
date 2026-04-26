import "server-only";

/**
 * nmap `-oG` (greppable) output parser.
 *
 * Format example (one Host: line per host):
 *   # Nmap 7.94 scan initiated Mon Apr 24 ... as: nmap -oG out.gnmap 10.10.10.5
 *   Host: 10.10.10.5 (box.htb)  Status: Up
 *   Host: 10.10.10.5 (box.htb)  Ports: 22/open/tcp//ssh//OpenSSH 8.9p1/, 80/open/tcp//http//Apache 2.4.52/  Ignored State: closed (998)
 *   # Nmap done at Mon Apr 24 ... -- 1 IP address (1 host up) scanned in 0.42 seconds
 *
 * Per-port fields are slash-delimited:
 *   port/state/proto/owner/service/scriptid/version/
 *
 * Multi-host: every distinct IP becomes a `ParsedHost` entry. Multiple
 * `Host:` lines for the same IP are merged into the same builder
 * (greppable splits Status / Ports / Ignored State across separate lines).
 *
 * Limitations vs XML/text:
 *   - No NSE script output (greppable format strips it)
 *   - No OS detection (only inferred via Status: line, no os match data)
 *   - No traceroute / runstats
 *
 * `import "server-only"` keeps the parser out of the client bundle.
 */

import type { ParsedHost, ParsedPort, ParsedScan } from "./types";

const HOST_LINE_RE = /^Host:\s+(\S+)(?:\s+\(([^)]*)\))?\s+(.*)$/;

type HostBuilder = {
  ip: string;
  hostname?: string;
  ports: ParsedPort[];
  extraPorts: { state: string; count: number }[];
};

export function parseNmapGreppable(raw: string): ParsedScan {
  if (!raw || !raw.trim()) {
    throw new Error(
      "Empty input — paste your nmap -oG output (greppable format) and try again.",
    );
  }

  const lines = raw.split(/\r?\n/);
  const warnings: string[] = [];
  const builders = new Map<string, HostBuilder>();
  const order: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("#") || line.length === 0) continue;

    const m = HOST_LINE_RE.exec(line);
    if (!m) continue;

    const ip = m[1];
    const hostname = m[2] && m[2].length > 0 ? m[2] : undefined;
    const rest = m[3];

    let builder = builders.get(ip);
    if (!builder) {
      builder = { ip, ports: [], extraPorts: [] };
      if (hostname) builder.hostname = hostname;
      builders.set(ip, builder);
      order.push(ip);
    } else if (hostname && !builder.hostname) {
      builder.hostname = hostname;
    }

    // Section delimiter is whitespace (tab in real nmap -oG, often double
    // space in textbook examples). Lookahead requires a colon-terminated
    // known key after the gap so port version strings like "OpenSSH 8.9p1"
    // don't accidentally close the Ports section.
    const sectionMatches = [
      ...rest.matchAll(
        /(Ports|Ignored State|Status):\s+(.+?)(?=\s+(?:Ports|Ignored State|Status):|$)/g,
      ),
    ];
    for (const sm of sectionMatches) {
      const key = sm[1];
      const value = sm[2].trim();
      if (key === "Ports") {
        const portSpecs = value.split(/,\s*/);
        for (const spec of portSpecs) {
          const parsed = parsePortSpec(spec, warnings);
          if (parsed) builder.ports.push(parsed);
        }
      } else if (key === "Ignored State") {
        const im = /^(\w+)\s*\((\d+)\)/.exec(value);
        if (im) {
          builder.extraPorts.push({ state: im[1], count: Number(im[2]) });
        }
      }
    }
  }

  if (order.length === 0) {
    throw new Error(
      "No 'Host:' line found in greppable output. Pass nmap output produced with -oG.",
    );
  }

  const parsedHosts: ParsedHost[] = order.map((ip) => {
    const b = builders.get(ip)!;
    const target: ParsedHost["target"] = { ip };
    if (b.hostname) target.hostname = b.hostname;
    const host: ParsedHost = {
      target,
      ports: b.ports,
      hostScripts: [],
    };
    if (b.extraPorts.length > 0) host.extraPorts = b.extraPorts;
    return host;
  });

  const primary = parsedHosts[0];
  const result: ParsedScan = {
    hosts: parsedHosts,
    target: primary.target,
    source: "nmap-text",
    ports: primary.ports,
    hostScripts: [],
    warnings,
  };
  if (primary.extraPorts && primary.extraPorts.length > 0) {
    result.extraPorts = primary.extraPorts;
  }
  return result;
}

function parsePortSpec(spec: string, warnings: string[]): ParsedPort | null {
  const parts = spec.split("/");
  if (parts.length < 5) return null;
  const portNum = Number(parts[0]);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    warnings.push(`Greppable: skipped invalid port '${parts[0]}'.`);
    return null;
  }
  const stateRaw = parts[1];
  const proto = parts[2];
  if (proto !== "tcp" && proto !== "udp") {
    warnings.push(
      `Greppable: skipped port ${portNum} unsupported protocol '${proto}'.`,
    );
    return null;
  }
  if (
    stateRaw === "" ||
    stateRaw === "closed" ||
    stateRaw === "unfiltered" ||
    stateRaw === "closed|filtered"
  ) {
    return null;
  }
  let state: "open" | "filtered";
  if (stateRaw === "open") state = "open";
  else if (stateRaw === "filtered") state = "filtered";
  else if (stateRaw === "open|filtered") state = "filtered";
  else {
    warnings.push(
      `Greppable: port ${portNum}/${proto} unknown state '${stateRaw}' — skipped.`,
    );
    return null;
  }
  const service = parts[4] && parts[4] !== "" ? parts[4].toLowerCase() : undefined;
  const version = parts[6] && parts[6] !== "" ? parts[6] : undefined;
  const port: ParsedPort = {
    port: portNum,
    protocol: proto,
    state,
    scripts: [],
  };
  if (service) port.service = service;
  if (version) port.version = version;
  return port;
}
