import "server-only";

import { XMLParser } from "fast-xml-parser";
import type {
  ParsedScan,
  ParsedHost,
  ParsedPort,
  ScriptOutput,
  ScriptElem,
  ScriptTable,
  Hop,
  OsMatch,
  OsClass,
  ExtraPortGroup,
  ScannerInfo,
  RunStats,
  TargetAddress,
  TargetHostname,
} from "./types";

/**
 * nmap XML parser — converts raw `-oX` output to a ParsedScan.
 *
 * v2 enrichments (additive — every new field is optional):
 *   - target.state, target.addresses[], target.hostnames[]
 *   - port.reason, port.reasonTtl, port.cpe[], port.serviceFp
 *   - os.matches[] (with osclass), os.fingerprint
 *   - extraPorts[] from <ports><extraports>
 *   - traceroute from <trace><hop>
 *   - preScripts[] / postScripts[] from <prescript>/<postscript>
 *   - scanner{name, version, args, xmlVersion} from <nmaprun> attrs
 *   - runstats{finishedAt, elapsed, summary, exitStatus, hosts}
 *
 * Security-critical: two-layer XXE defense per D-14 / D-15 / SEC-05 unchanged.
 *   1. Strip benign DOCTYPE; reject DOCTYPE with internal subset (`[`).
 *   2. processEntities: false — defense in depth.
 */

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  processEntities: false,
  isArray: (name: string) =>
    [
      "host",
      "port",
      "script",
      "osmatch",
      "osclass",
      "hostname",
      "elem",
      "table",
      "address",
      "extraports",
      "extrareasons",
      "hop",
      "cpe",
    ].includes(name),
} as const;

const BENIGN_DOCTYPE_RE = /<!DOCTYPE[^\[>]*>/gi;

export function parseNmapXml(raw: string): ParsedScan {
  if (!raw || !raw.trim()) {
    throw new Error(
      "Empty input — paste your nmap -oX output and try again.",
    );
  }

  const stripped = raw.replace(BENIGN_DOCTYPE_RE, "");
  if (/<!DOCTYPE/i.test(stripped)) {
    throw new Error(
      "XML contains a DOCTYPE declaration with entity definitions — " +
        "rejected for security. Provide a clean nmap -oX output without " +
        "custom DOCTYPE.",
    );
  }

  // Count "real" XML declarations (`<?xml ?>` / `<?xml version=...?>`) but
  // ignore other processing instructions like `<?xml-stylesheet ...?>` that
  // nmap's -oA / -oX output emits. Only `<?xml` immediately followed by a
  // whitespace or the closing `?` qualifies as a prologue.
  const prologueMatches = stripped.match(/<\?xml(?=[\s?])/g) ?? [];
  if (prologueMatches.length > 1) {
    throw new Error(
      "Multiple XML prologues detected (likely from --append-output). " +
        "Split into separate files and import one at a time.",
    );
  }

  const xml = new XMLParser(PARSER_OPTIONS);
  let doc: XmlDoc;
  try {
    doc = xml.parse(stripped) as XmlDoc;
  } catch {
    throw new Error(
      "Incomplete nmap XML — the scan may have been interrupted (Ctrl-C). " +
        "Re-run the scan or use partial results manually.",
    );
  }

  if (!doc || typeof doc !== "object" || !doc.nmaprun) {
    throw new Error(
      "Incomplete nmap XML — the scan may have been interrupted (Ctrl-C). " +
        "Re-run the scan or use partial results manually.",
    );
  }

  const warnings: string[] = [];
  const xmlHosts = normalizeArray(
    doc.nmaprun.host as XmlHost | XmlHost[] | undefined,
  );

  if (xmlHosts.length === 0) {
    throw new Error(
      "No hosts found in scan. The nmap XML must contain at least one " +
        "<host> element.",
    );
  }

  // P1-F PR 2: parse every <host> element. The legacy multi-host warning
  // is gone — multi-host scans are first-class citizens now.
  const parsedHosts: ParsedHost[] = xmlHosts.map((h) => buildParsedHost(h, warnings));

  const scannedAt = extractScannedAt(doc.nmaprun.start);
  const preScripts = extractScripts(
    (doc.nmaprun.prescript as { script?: unknown } | undefined)?.script as
      | XmlScript
      | XmlScript[]
      | undefined,
  );
  const postScripts = extractScripts(
    (doc.nmaprun.postscript as { script?: unknown } | undefined)?.script as
      | XmlScript
      | XmlScript[]
      | undefined,
  );
  const scanner = extractScanner(doc.nmaprun);
  const runstats = extractRunStats(doc.nmaprun.runstats);

  // Mirror hosts[0] onto the legacy top-level fields so existing single-host
  // consumers (view-model, page.tsx, exports, importer) keep working until
  // they migrate to scan.hosts. Removed in PR 4.
  const primary = parsedHosts[0];
  const result: ParsedScan = {
    hosts: parsedHosts,
    target: primary.target,
    source: "nmap-xml",
    ports: primary.ports,
    hostScripts: primary.hostScripts,
    warnings,
  };
  if (scannedAt !== undefined) result.scannedAt = scannedAt;
  if (primary.os !== undefined) result.os = primary.os;
  if (primary.extraPorts && primary.extraPorts.length > 0) {
    result.extraPorts = primary.extraPorts;
  }
  if (primary.traceroute) result.traceroute = primary.traceroute;
  if (preScripts.length > 0) result.preScripts = preScripts;
  if (postScripts.length > 0) result.postScripts = postScripts;
  if (scanner) result.scanner = scanner;
  if (runstats) result.runstats = runstats;
  return result;
}

/**
 * Build a ParsedHost from one `<host>` element. All extractors here are
 * already host-scoped; this helper just bundles them so the top-level loop
 * stays tidy.
 */
function buildParsedHost(host: XmlHost, warnings: string[]): ParsedHost {
  const target = extractTarget(host);
  const ports = extractPorts(host.ports, warnings);
  const hostScripts = extractHostScripts(host.hostscript);
  const os = extractOs(host.os);
  const extraPorts = extractExtraPorts(host.ports);
  const traceroute = extractTraceroute(host.trace);

  const result: ParsedHost = { target, ports, hostScripts };
  if (os !== undefined) result.os = os;
  if (extraPorts && extraPorts.length > 0) result.extraPorts = extraPorts;
  if (traceroute) result.traceroute = traceroute;
  return result;
}

// ----------------------------- types ---------------------------------------

interface XmlDoc {
  nmaprun?: {
    start?: unknown;
    version?: unknown;
    args?: unknown;
    xmloutputversion?: unknown;
    scanner?: unknown;
    host?: unknown;
    prescript?: unknown;
    postscript?: unknown;
    runstats?: unknown;
    [k: string]: unknown;
  };
}

interface XmlStatus {
  state?: unknown;
  reason?: unknown;
}

interface XmlHost {
  status?: XmlStatus;
  address?: unknown;
  hostnames?: { hostname?: unknown } | undefined;
  ports?:
    | { port?: unknown; extraports?: unknown }
    | undefined;
  hostscript?: { script?: unknown } | undefined;
  os?: { osmatch?: unknown; osfingerprint?: unknown } | undefined;
  trace?:
    | {
        proto?: unknown;
        port?: unknown;
        hop?: unknown;
      }
    | undefined;
  [k: string]: unknown;
}

interface XmlAddr {
  addr?: unknown;
  addrtype?: unknown;
  vendor?: unknown;
}

interface XmlHostname {
  name?: unknown;
  type?: unknown;
}

interface XmlService {
  name?: unknown;
  product?: unknown;
  version?: unknown;
  tunnel?: unknown;
  extrainfo?: unknown;
  servicefp?: unknown;
  cpe?: unknown;
}

interface XmlPort {
  portid?: unknown;
  protocol?: unknown;
  state?:
    | { state?: unknown; reason?: unknown; reason_ttl?: unknown }
    | undefined;
  service?: XmlService | undefined;
  script?: unknown;
}

interface XmlScript {
  id?: unknown;
  output?: unknown;
  "#text"?: unknown;
  elem?: unknown;
  table?: unknown;
}

interface XmlElem {
  key?: unknown;
  "#text"?: unknown;
}

interface XmlTable {
  key?: unknown;
  elem?: unknown;
  table?: unknown;
}

interface XmlOsMatch {
  name?: unknown;
  accuracy?: unknown;
  osclass?: unknown;
}

interface XmlOsClass {
  type?: unknown;
  vendor?: unknown;
  osfamily?: unknown;
  osgen?: unknown;
  accuracy?: unknown;
}

interface XmlExtraPorts {
  state?: unknown;
  count?: unknown;
  extrareasons?: unknown;
}

interface XmlExtraReasons {
  reason?: unknown;
  count?: unknown;
}

interface XmlHop {
  ttl?: unknown;
  rtt?: unknown;
  ipaddr?: unknown;
  host?: unknown;
}

interface XmlRunStats {
  finished?: { time?: unknown; elapsed?: unknown; summary?: unknown; exit?: unknown };
  hosts?: { up?: unknown; down?: unknown; total?: unknown };
}

function normalizeArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

// ----------------------------- target --------------------------------------

function extractTarget(host: XmlHost): ParsedScan["target"] {
  const addrs = normalizeArray(host.address as XmlAddr | XmlAddr[] | undefined);
  const ipv4 = addrs.find((a) => a?.addrtype === "ipv4");
  const ipv6 = addrs.find((a) => a?.addrtype === "ipv6");
  const chosen = ipv4 ?? ipv6;
  const ip = chosen?.addr !== undefined ? String(chosen.addr) : "";

  const allAddresses: TargetAddress[] = addrs
    .filter((a) => a.addr !== undefined && a.addrtype !== undefined)
    .map((a) => {
      const out: TargetAddress = {
        addr: String(a.addr),
        addrtype: String(a.addrtype) as TargetAddress["addrtype"],
      };
      if (a.vendor !== undefined) out.vendor = String(a.vendor);
      return out;
    });

  const rawHostnames = normalizeArray(
    host.hostnames?.hostname as XmlHostname | XmlHostname[] | undefined,
  );
  const allHostnames: TargetHostname[] = rawHostnames
    .filter((h) => h.name !== undefined && String(h.name) !== "")
    .map((h) => ({
      name: String(h.name),
      type: h.type !== undefined ? String(h.type) : "user",
    }));
  const hostnameValue = allHostnames[0]?.name;

  const statusState =
    host.status?.state !== undefined ? String(host.status.state) : undefined;

  const target: ParsedScan["target"] = { ip };
  if (hostnameValue) target.hostname = hostnameValue;
  if (statusState) target.state = statusState;
  if (allAddresses.length > 0) target.addresses = allAddresses;
  if (allHostnames.length > 0) target.hostnames = allHostnames;
  return target;
}

// ----------------------------- ports ---------------------------------------

function extractPorts(
  portsEl: { port?: unknown; extraports?: unknown } | undefined,
  warnings: string[],
): ParsedPort[] {
  if (!portsEl?.port) return [];
  const rawPorts = normalizeArray(portsEl.port as XmlPort | XmlPort[]);
  const result: ParsedPort[] = [];

  for (const p of rawPorts) {
    const portNum = Number(p.portid);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      warnings.push(`Port '${String(p.portid)}': invalid port number, skipped.`);
      continue;
    }

    const protocolRaw = p.protocol !== undefined ? String(p.protocol) : "";
    if (protocolRaw !== "tcp" && protocolRaw !== "udp") {
      warnings.push(
        `Port ${portNum}: unsupported protocol '${protocolRaw}' — skipped.`,
      );
      continue;
    }
    const protocol: "tcp" | "udp" = protocolRaw;

    const stateVal = p.state?.state !== undefined ? String(p.state.state) : "";

    if (
      stateVal === "" ||
      stateVal === "closed" ||
      stateVal === "unfiltered" ||
      stateVal === "closed|filtered"
    ) {
      continue;
    }

    let state: "open" | "filtered";
    if (stateVal === "open") {
      state = "open";
    } else if (stateVal === "filtered") {
      state = "filtered";
    } else if (stateVal === "open|filtered") {
      state = "filtered";
      warnings.push(
        `Port ${portNum}/${protocol}: state 'open|filtered' normalized to 'filtered'.`,
      );
    } else {
      warnings.push(
        `Port ${portNum}/${protocol}: unknown state '${stateVal}' — skipped.`,
      );
      continue;
    }

    const svc = p.service;
    if (!svc) {
      warnings.push(`Port ${portNum}/${protocol}: no service detected.`);
    }
    const scripts = extractScripts(p.script as XmlScript | XmlScript[] | undefined);

    const parsed: ParsedPort = {
      port: portNum,
      protocol,
      state,
      scripts,
    };

    if (p.state?.reason !== undefined) {
      parsed.reason = String(p.state.reason);
    }
    if (p.state?.reason_ttl !== undefined) {
      const ttl = Number(p.state.reason_ttl);
      if (Number.isFinite(ttl)) parsed.reasonTtl = ttl;
    }

    if (svc) {
      const service =
        svc.name !== undefined ? String(svc.name).toLowerCase().trim() : undefined;
      if (service) parsed.service = service;
      if (svc.product !== undefined) parsed.product = String(svc.product);
      if (svc.version !== undefined) parsed.version = String(svc.version);
      if (svc.extrainfo !== undefined) parsed.extrainfo = String(svc.extrainfo);
      if (svc.tunnel !== undefined && String(svc.tunnel) === "ssl") {
        parsed.tunnel = "ssl";
      }
      if (svc.servicefp !== undefined) parsed.serviceFp = String(svc.servicefp);

      const cpes = normalizeArray(
        svc.cpe as string | { "#text"?: unknown } | Array<string | { "#text"?: unknown }> | undefined,
      );
      const cpeStrings = cpes
        .map((c) => {
          if (typeof c === "string") return c;
          if (c && typeof c === "object" && "#text" in c && c["#text"] !== undefined) {
            return String(c["#text"]);
          }
          return "";
        })
        .filter((s) => s.length > 0);
      if (cpeStrings.length > 0) parsed.cpe = cpeStrings;
    }

    result.push(parsed);
  }
  return result;
}

// ----------------------------- extraports ----------------------------------

function extractExtraPorts(
  portsEl: { extraports?: unknown } | undefined,
): ExtraPortGroup[] | undefined {
  if (!portsEl?.extraports) return undefined;
  const arr = normalizeArray(
    portsEl.extraports as XmlExtraPorts | XmlExtraPorts[],
  );
  const out: ExtraPortGroup[] = [];
  for (const ep of arr) {
    if (ep.state === undefined || ep.count === undefined) continue;
    const count = Number(ep.count);
    if (!Number.isFinite(count)) continue;
    const group: ExtraPortGroup = { state: String(ep.state), count };
    const reasons = normalizeArray(
      ep.extrareasons as XmlExtraReasons | XmlExtraReasons[] | undefined,
    );
    if (reasons.length > 0) {
      group.reasons = reasons
        .filter((r) => r.reason !== undefined && r.count !== undefined)
        .map((r) => ({
          reason: String(r.reason),
          count: Number(r.count),
        }));
    }
    out.push(group);
  }
  return out;
}

// ----------------------------- scripts -------------------------------------

function extractScripts(
  scriptEl: XmlScript | XmlScript[] | undefined,
): ScriptOutput[] {
  if (!scriptEl) return [];
  const arr = normalizeArray(scriptEl);
  return arr.map((s) => {
    const result: ScriptOutput = {
      id: s.id !== undefined ? String(s.id) : "",
      output: pickScriptBody(s),
    };
    const structured = walkStructured(s);
    if (structured.length > 0) {
      result.structured = structured;
    }
    return result;
  });
}

function walkStructured(
  node: XmlScript | XmlElem | XmlTable,
): Array<ScriptElem | ScriptTable> {
  const out: Array<ScriptElem | ScriptTable> = [];
  const childBag = node as { elem?: unknown; table?: unknown };

  const elems = normalizeArray(
    childBag.elem as XmlElem | string | Array<XmlElem | string> | undefined,
  );
  for (const e of elems) {
    if (typeof e === "string") {
      out.push({ key: "", value: e });
      continue;
    }
    out.push({
      key: e.key !== undefined ? String(e.key) : "",
      value: e["#text"] !== undefined ? String(e["#text"]) : "",
    });
  }

  const tables = normalizeArray(
    childBag.table as XmlTable | XmlTable[] | undefined,
  );
  for (const t of tables) {
    out.push({
      key: t.key !== undefined ? String(t.key) : "",
      rows: walkStructured(t),
    });
  }

  return out;
}

function pickScriptBody(s: XmlScript): string {
  const attr = s.output !== undefined ? String(s.output) : "";
  if (attr !== "") return attr;
  const text = s["#text"] !== undefined ? String(s["#text"]) : "";
  return text;
}

function extractHostScripts(
  hostscriptEl: { script?: unknown } | undefined,
): ScriptOutput[] {
  if (!hostscriptEl) return [];
  return extractScripts(
    hostscriptEl.script as XmlScript | XmlScript[] | undefined,
  );
}

function extractScannedAt(start: unknown): string | undefined {
  const unix = Number(start);
  if (!Number.isFinite(unix) || unix <= 0) return undefined;
  return new Date(unix * 1000).toISOString();
}

// ----------------------------- OS ------------------------------------------

function extractOs(
  osEl: { osmatch?: unknown; osfingerprint?: unknown } | undefined,
):
  | {
      name?: string;
      accuracy?: number;
      matches?: OsMatch[];
      fingerprint?: string;
    }
  | undefined {
  if (!osEl) return undefined;
  const matches = normalizeArray(
    osEl.osmatch as XmlOsMatch | XmlOsMatch[] | undefined,
  );

  const fpRaw = osEl.osfingerprint as { fingerprint?: unknown } | undefined;
  const fingerprint = fpRaw?.fingerprint
    ? String(fpRaw.fingerprint)
    : undefined;

  if (matches.length === 0) {
    return fingerprint ? { fingerprint } : undefined;
  }

  const sorted = [...matches].sort(
    (a, b) => Number(b.accuracy ?? 0) - Number(a.accuracy ?? 0),
  );

  const allMatches: OsMatch[] = sorted.map((m) => {
    const classes = normalizeArray(
      m.osclass as XmlOsClass | XmlOsClass[] | undefined,
    );
    const out: OsMatch = {
      name: String(m.name ?? ""),
    };
    if (m.accuracy !== undefined) {
      const acc = Number(m.accuracy);
      if (Number.isFinite(acc)) out.accuracy = acc;
    }
    if (classes.length > 0) {
      out.classes = classes.map((c) => {
        const oc: OsClass = {};
        if (c.type !== undefined) oc.type = String(c.type);
        if (c.vendor !== undefined) oc.vendor = String(c.vendor);
        if (c.osfamily !== undefined) oc.family = String(c.osfamily);
        if (c.osgen !== undefined) oc.gen = String(c.osgen);
        if (c.accuracy !== undefined) {
          const acc = Number(c.accuracy);
          if (Number.isFinite(acc)) oc.accuracy = acc;
        }
        return oc;
      });
    }
    return out;
  });

  const best = allMatches[0];
  const result: {
    name?: string;
    accuracy?: number;
    matches?: OsMatch[];
    fingerprint?: string;
  } = {};
  if (best?.name) result.name = best.name;
  if (best?.accuracy !== undefined) result.accuracy = best.accuracy;
  result.matches = allMatches;
  if (fingerprint) result.fingerprint = fingerprint;
  return result;
}

// ----------------------------- traceroute ----------------------------------

function extractTraceroute(
  traceEl: XmlHost["trace"],
): { proto?: string; port?: number; hops: Hop[] } | undefined {
  if (!traceEl) return undefined;
  const hops = normalizeArray(
    traceEl.hop as XmlHop | XmlHop[] | undefined,
  );
  if (hops.length === 0) return undefined;
  const out: { proto?: string; port?: number; hops: Hop[] } = {
    hops: hops
      .filter((h) => h.ipaddr !== undefined && h.ttl !== undefined)
      .map((h) => {
        const hop: Hop = {
          ttl: Number(h.ttl),
          ipaddr: String(h.ipaddr),
        };
        if (h.rtt !== undefined) {
          const rtt = Number(h.rtt);
          if (Number.isFinite(rtt)) hop.rtt = rtt;
        }
        if (h.host !== undefined) hop.host = String(h.host);
        return hop;
      }),
  };
  if (traceEl.proto !== undefined) out.proto = String(traceEl.proto);
  if (traceEl.port !== undefined) {
    const portNum = Number(traceEl.port);
    if (Number.isFinite(portNum)) out.port = portNum;
  }
  return out;
}

// ----------------------------- scanner -------------------------------------

function extractScanner(
  nmaprun: NonNullable<XmlDoc["nmaprun"]>,
): ScannerInfo | undefined {
  const out: ScannerInfo = {};
  if (nmaprun.scanner !== undefined) out.name = String(nmaprun.scanner);
  if (nmaprun.version !== undefined) out.version = String(nmaprun.version);
  if (nmaprun.args !== undefined) out.args = String(nmaprun.args);
  if (nmaprun.xmloutputversion !== undefined) {
    out.xmlVersion = String(nmaprun.xmloutputversion);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// ----------------------------- runstats ------------------------------------

function extractRunStats(runstatsEl: unknown): RunStats | undefined {
  if (!runstatsEl || typeof runstatsEl !== "object") return undefined;
  const r = runstatsEl as XmlRunStats;
  const out: RunStats = {};
  if (r.finished?.time !== undefined) {
    const unix = Number(r.finished.time);
    if (Number.isFinite(unix) && unix > 0) {
      out.finishedAt = new Date(unix * 1000).toISOString();
    }
  }
  if (r.finished?.elapsed !== undefined) {
    const e = Number(r.finished.elapsed);
    if (Number.isFinite(e)) out.elapsed = e;
  }
  if (r.finished?.summary !== undefined) out.summary = String(r.finished.summary);
  if (r.finished?.exit !== undefined) out.exitStatus = String(r.finished.exit);
  if (r.hosts) {
    const hosts: NonNullable<RunStats["hosts"]> = {};
    if (r.hosts.up !== undefined) {
      const n = Number(r.hosts.up);
      if (Number.isFinite(n)) hosts.up = n;
    }
    if (r.hosts.down !== undefined) {
      const n = Number(r.hosts.down);
      if (Number.isFinite(n)) hosts.down = n;
    }
    if (r.hosts.total !== undefined) {
      const n = Number(r.hosts.total);
      if (Number.isFinite(n)) hosts.total = n;
    }
    if (Object.keys(hosts).length > 0) out.hosts = hosts;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
