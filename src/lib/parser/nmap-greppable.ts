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
 * Limitations vs XML/text:
 *   - No NSE script output (greppable format strips it)
 *   - No OS detection (only inferred via Status: line, no os match data)
 *   - No traceroute / runstats / extraports (greppable doesn't carry these)
 *   - First host only (D-09 mirrored)
 *
 * `import "server-only"` keeps the parser out of the client bundle.
 */

import type { ParsedHost, ParsedPort, ParsedScan } from "./types";

const HOST_LINE_RE = /^Host:\s+(\S+)(?:\s+\(([^)]*)\))?\s+(.*)$/;

export function parseNmapGreppable(raw: string): ParsedScan {
  if (!raw || !raw.trim()) {
    throw new Error(
      "Empty input — paste your nmap -oG output (greppable format) and try again.",
    );
  }

  const lines = raw.split(/\r?\n/);
  const warnings: string[] = [];
  const ports: ParsedPort[] = [];
  let target: { ip: string; hostname?: string } | undefined;
  let extraIgnored: { state: string; count: number } | undefined;

  // Greppable emits ONE Host line per host with everything inline. Multiple
  // Host lines for the same IP can appear (Status: Up plus Ports: ...). We
  // process them all but bind to the first IP we see.
  const seenIps = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("#") || line.length === 0) continue;

    const m = HOST_LINE_RE.exec(line);
    if (!m) continue;

    const ip = m[1];
    const hostname = m[2] && m[2].length > 0 ? m[2] : undefined;
    const rest = m[3];

    if (!target) {
      target = hostname ? { ip, hostname } : { ip };
    } else if (target.ip !== ip) {
      // P1-F PR 2: greppable additional-host warning removed. Greppable
      // multi-host parsing isn't a priority — operators with `-oG` output
      // covering multiple hosts can switch to `-oX`. First-host-only
      // behavior continues silently.
      seenIps.add(ip);
      continue;
    }
    seenIps.add(ip);

    // Parse the rest into key:value sections. Section keys we care about:
    // "Ports", "Ignored State", "Status". Lookahead enumerates known keys
    // explicitly so multi-word keys (like "Ignored State") delimit correctly.
    const sectionMatches = [
      ...rest.matchAll(
        /(Ports|Ignored State|Status):\s+(.+?)(?=\s{2,}(?:Ports|Ignored State|Status):|$)/g,
      ),
    ];
    for (const sm of sectionMatches) {
      const key = sm[1];
      const value = sm[2].trim();
      if (key === "Ports") {
        // value is comma-separated port specs.
        const portSpecs = value.split(/,\s*/);
        for (const spec of portSpecs) {
          const parsed = parsePortSpec(spec, warnings);
          if (parsed) ports.push(parsed);
        }
      } else if (key === "Ignored State") {
        // "closed (998)" or "filtered (3)"
        const im = /^(\w+)\s*\((\d+)\)/.exec(value);
        if (im) {
          extraIgnored = { state: im[1], count: Number(im[2]) };
        }
      }
    }
  }

  if (!target) {
    throw new Error(
      "No 'Host:' line found in greppable output. Pass nmap output produced with -oG.",
    );
  }

  // P1-F PR 2: populate scan.hosts[] (single entry mirroring legacy fields).
  const primary: ParsedHost = {
    target,
    ports,
    hostScripts: [],
  };
  if (extraIgnored) primary.extraPorts = [extraIgnored];

  const result: ParsedScan = {
    hosts: [primary],
    target,
    source: "nmap-text",
    ports,
    hostScripts: [],
    warnings,
  };
  if (extraIgnored) {
    result.extraPorts = [extraIgnored];
  }
  return result;
}

function parsePortSpec(spec: string, warnings: string[]): ParsedPort | null {
  // port/state/proto/owner/service/scriptid/version
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
