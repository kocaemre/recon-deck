/**
 * ParsedScan contract types — Phase 2 output shape.
 *
 * Single source of truth for parser output (REQ PARSE-01..PARSE-05, D-01..D-06).
 *
 * Consumed by:
 * - Phase 3 (persistence) — SQLite schema mirrors this shape
 * - Phase 4 (API + UI) — parseAny() returns this to route handler
 * - Phase 5 (AutoRecon importer) — calls parseNmapXml() directly
 *
 * NO runtime dependencies — pure TypeScript type declarations only.
 * Zod validation of ParsedScan is a Phase 4 API-boundary concern (D-01 note).
 *
 * Note: `tunnel?: 'ssl'` extends D-01 per RESEARCH.md Open Question #4 —
 * nmap reports HTTPS-on-nonstandard-port as `<service name="http" tunnel="ssl">`,
 * and Phase 4 KB matching needs this signal to resolve to the `https` KB entry.
 */

// UI-11 structured-NSE extension. `structured` on ScriptOutput is undefined
// when the source XML had no `<elem>` / `<table>` children (e.g. http-title)
// OR when source is `nmap-text` (which has no structured concept). Plan 07-02
// will populate this field from nmap XML; Plan 07-04 renders it as a table.
// Recursive shape — `<table>` may contain nested `<elem>` and `<table>`.
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
   * Plan 07-02 populates this from nmap XML. Undefined for nmap-text source.
   */
  structured?: Array<ScriptElem | ScriptTable>;
};

export type ParsedPort = {
  port: number;                       // 1–65535
  protocol: 'tcp' | 'udp';            // D-08: sctp/ip warn+skip
  state: 'open' | 'filtered';         // D-02: open|filtered → filtered; closed/unfiltered dropped
  service?: string;                   // D-05: nmapValue.toLowerCase().trim(); undefined if <service> absent
  product?: string;                   // D-06: verbatim (no lowercasing)
  version?: string;                   // D-06: verbatim
  tunnel?: 'ssl';                     // RESEARCH §tunnel: preserve for Phase 4 KB matching
  extrainfo?: string;                 // D-06: verbatim
  scripts: ScriptOutput[];            // PARSE-02: NSE output per port; always array (D-04 analog)
};

export type ParsedScan = {
  target: { ip: string; hostname?: string };
  scannedAt?: string;                 // ISO, from XML <nmaprun start=...>
  source: 'nmap-text' | 'nmap-xml' | 'autorecon';   // D-11 format detection; 'autorecon' extension per Phase 5 D-14
  ports: ParsedPort[];
  hostScripts: ScriptOutput[];        // D-04: always array, never undefined (PARSE-03)
  os?: { name: string; accuracy?: number };
  warnings: string[];                 // D-08: recoverable issues accumulated here
};
