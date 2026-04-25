/**
 * ParsedScan contract types — Phase 2 output shape (extended in v2).
 *
 * Single source of truth for parser output (REQ PARSE-01..PARSE-05, D-01..D-06).
 *
 * v2 extensions (all optional, additive — existing code paths unaffected):
 *   - target.state, target.addresses[], target.hostnames[]
 *   - port.cpe[], port.reason, port.reasonTtl, port.serviceFp
 *   - os.matches[] (with osclasses), os.fingerprint
 *   - traceroute, preScripts, postScripts
 *   - extraPorts (XML <extraports>, text "Not shown:")
 *   - scanner (nmaprun version + args + xmloutputversion)
 *   - runstats (finished time, elapsed, exit status)
 *
 * Consumed by:
 * - Phase 3 (persistence) — SQLite schema mirrors the original shape; v2
 *   fields are surfaced via re-parse of raw_input at render time
 *   (engagement page already does this for structured NSE, see UI-11).
 * - Phase 4 (API + UI) — parseAny() returns this to the route handler.
 * - Phase 5 (AutoRecon importer) — calls parseNmapXml() directly.
 *
 * NO runtime dependencies — pure TypeScript type declarations only.
 */

/* ------------------------- NSE elem/table walk ----------------------------- */

export type ScriptElem = {
  /** Attribute `key` from `<elem key="...">VALUE</elem>`. May be empty string when nmap omits the attribute. */
  key: string;
  /** Text body of the `<elem>` — preserved verbatim. React text node consumers must NOT use dangerouslySetInnerHTML (SEC-03). */
  value: string;
};

export type ScriptTable = {
  /** Attribute `key` from `<table key="...">`. May be empty string. */
  key: string;
  /** Children of this table — recursive: more `<elem>` and/or nested `<table>`. */
  rows: Array<ScriptElem | ScriptTable>;
};

export type ScriptOutput = {
  id: string;
  output: string;
  /**
   * Optional structured walk of `<elem>` and `<table>` children — present when
   * the script (e.g. ssl-cert, smb-os-discovery) emitted child elements. UI-11.
   */
  structured?: Array<ScriptElem | ScriptTable>;
};

/* ------------------------- target identifiers ------------------------------ */

export type TargetAddress = {
  /** Raw `addr` attribute. */
  addr: string;
  /** "ipv4" | "ipv6" | "mac". */
  addrtype: "ipv4" | "ipv6" | "mac";
  /** MAC vendor when addrtype="mac". */
  vendor?: string;
};

export type TargetHostname = {
  /** Hostname value. */
  name: string;
  /** "PTR" (rDNS) | "user" (user-supplied target). */
  type: "PTR" | "user" | string;
};

/* ------------------------- traceroute -------------------------------------- */

export type Hop = {
  ttl: number;
  rtt?: number;
  ipaddr: string;
  host?: string;
};

/* ------------------------- OS detection ------------------------------------ */

export type OsClass = {
  type?: string;
  vendor?: string;
  family?: string;
  gen?: string;
  accuracy?: number;
};

export type OsMatch = {
  name: string;
  accuracy?: number;
  classes?: OsClass[];
};

export type OsInfo = {
  /** Highest-accuracy match name (legacy `os.name` field for backward compat). */
  name?: string;
  /** Highest-accuracy match accuracy (legacy `os.accuracy`). */
  accuracy?: number;
  /** All osmatch entries (sorted by accuracy desc). */
  matches?: OsMatch[];
  /** TCP/IP fingerprint blob from `<osfingerprint>`. */
  fingerprint?: string;
};

/* ------------------------- ports + extraports ------------------------------ */

export type ParsedPort = {
  port: number;                       // 1–65535
  protocol: "tcp" | "udp";            // D-08: sctp/ip warn+skip
  state: "open" | "filtered";         // D-02: open|filtered → filtered; closed/unfiltered dropped
  service?: string;                   // D-05: nmapValue.toLowerCase().trim(); undefined if <service> absent
  product?: string;                   // D-06: verbatim
  version?: string;                   // D-06: verbatim
  tunnel?: "ssl";                     // RESEARCH §tunnel: preserve for KB matching
  extrainfo?: string;                 // D-06: verbatim
  scripts: ScriptOutput[];            // PARSE-02: NSE output per port
  /** v2: state reason (syn-ack, no-response, admin-prohibited, ...). */
  reason?: string;
  /** v2: state reason TTL. */
  reasonTtl?: number;
  /** v2: CPE identifiers from `<cpe>`. */
  cpe?: string[];
  /** v2: nmap service-detection fingerprint blob (`servicefp` attribute). */
  serviceFp?: string;
};

export type ExtraPortGroup = {
  state: string;
  count: number;
  reasons?: { reason: string; count: number }[];
};

/* ------------------------- scanner + runstats ------------------------------ */

export type ScannerInfo = {
  /** "nmap" usually. */
  name?: string;
  /** Version string. */
  version?: string;
  /** Original argv-joined args (`nmap -sV -A 10.10.10.5`). */
  args?: string;
  /** XML output schema version. */
  xmlVersion?: string;
};

export type RunStats = {
  /** ISO-8601 timestamp when scan finished. */
  finishedAt?: string;
  /** Elapsed seconds. */
  elapsed?: number;
  /** Free-text summary line nmap prints. */
  summary?: string;
  /** "success" | "cancelled" | "die" — `<finished exit>` attribute. */
  exitStatus?: string;
  /** Hosts up/down/total counts. */
  hosts?: { up?: number; down?: number; total?: number };
};

/* ------------------------- root ParsedScan --------------------------------- */

/**
 * Per-host parsed payload (P1-F PR 2).
 *
 * Each ParsedHost carries everything that used to sit at the ParsedScan top
 * level — target, ports, hostScripts, os, extraPorts, traceroute. A scan
 * report covering N hosts produces N entries in `ParsedScan.hosts`.
 *
 * The legacy top-level `target/ports/hostScripts/os/extraPorts/traceroute`
 * fields on ParsedScan are retained as a *mirror of the first host* so
 * existing single-host consumers (view-model, page.tsx, exports, importer)
 * keep working unchanged. Multi-host-aware consumers iterate `scan.hosts`
 * directly. The mirror will be removed once every consumer has migrated
 * (planned for P1-F PR 4).
 */
export type ParsedHost = {
  target: {
    ip: string;
    hostname?: string;
    /** v2: host status (`<status state="up|down">`). */
    state?: "up" | "down" | string;
    /** v2: all `<address>` records (IPv4 + IPv6 + MAC). */
    addresses?: TargetAddress[];
    /** v2: all `<hostname>` records (PTR, user-supplied). */
    hostnames?: TargetHostname[];
  };
  ports: ParsedPort[];
  hostScripts: ScriptOutput[];
  os?: OsInfo;
  /** v2: `<extraports>` summary for this host. */
  extraPorts?: ExtraPortGroup[];
  /** v2: traceroute for this host. */
  traceroute?: { proto?: string; port?: number; hops: Hop[] };
};

export type ParsedScan = {
  /**
   * P1-F PR 2: every host in the scan report. For single-host scans this
   * holds exactly one entry; for `nmap` runs that swept a /24 or named
   * multiple targets it holds one entry per host. Always non-empty after
   * a successful parse.
   */
  hosts: ParsedHost[];
  /** Mirror of `hosts[0].target` — retained for legacy consumers (PR 4 cleanup). */
  target: ParsedHost["target"];
  scannedAt?: string;                 // ISO, from XML <nmaprun start=...>
  source: "nmap-text" | "nmap-xml" | "autorecon";
  /** Mirror of `hosts[0].ports` — retained for legacy consumers (PR 4 cleanup). */
  ports: ParsedPort[];
  /** Mirror of `hosts[0].hostScripts` — retained for legacy consumers (PR 4 cleanup). */
  hostScripts: ScriptOutput[];        // D-04: always array
  /** Mirror of `hosts[0].os` — retained for legacy consumers (PR 4 cleanup). */
  os?: OsInfo;
  warnings: string[];                 // D-08
  /** Mirror of `hosts[0].extraPorts` — retained for legacy consumers (PR 4 cleanup). */
  extraPorts?: ExtraPortGroup[];
  /** Mirror of `hosts[0].traceroute` — retained for legacy consumers (PR 4 cleanup). */
  traceroute?: { proto?: string; port?: number; hops: Hop[] };
  /** v2: pre-scan script outputs (`<prescript>`). Scan-level, not per-host. */
  preScripts?: ScriptOutput[];
  /** v2: post-scan script outputs (`<postscript>`). Scan-level, not per-host. */
  postScripts?: ScriptOutput[];
  /** v2: nmap binary metadata. Scan-level, not per-host. */
  scanner?: ScannerInfo;
  /** v2: end-of-scan stats. Scan-level, not per-host. */
  runstats?: RunStats;
};
