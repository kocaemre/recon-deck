import "server-only";

import { XMLParser } from "fast-xml-parser";
import type { ParsedScan, ParsedPort, ScriptOutput, ScriptElem, ScriptTable } from "./types";

/**
 * nmap XML parser — converts raw `-oX` output to a `ParsedScan`.
 *
 * Security-critical: two-layer XXE defense per D-14 / D-15 / SEC-05.
 *   1. Pre-parse scan strips benign `<!DOCTYPE nmaprun>` declarations (no
 *      internal subset — no `[`) and rejects any DOCTYPE containing `[`,
 *      which is where `ENTITY` definitions live.
 *   2. XMLParser runs with `processEntities: false` — belt + braces; even if
 *      a DOCTYPE somehow slipped through it would never be expanded.
 *
 * Throw/warn taxonomy per D-07 / D-08:
 *   - Throws (hard failure, user-facing, no stack frames, no inner-error
 *     interpolation — INPUT-04):
 *       * empty / whitespace-only input
 *       * DOCTYPE with entity definitions
 *       * multi-prologue (`--append-output`)
 *       * malformed / partial / Ctrl-C'd XML
 *       * missing `<nmaprun>` root
 *       * zero hosts
 *   - Warnings (soft, recoverable — pushed into `warnings[]`, never console):
 *       * multi-host scan (first host only per D-09)
 *       * unsupported protocol (sctp/ip/icmp) — skipped
 *       * invalid port number — skipped
 *       * `open|filtered` normalized to `filtered` (D-02)
 *       * unknown state token — skipped
 *       * port with no `<service>` child (PARSE-04 parse-time half — the
 *         render-time half falls back to `default.yaml` in Phase 4's
 *         `matchPort()`)
 *
 * Normalization rules:
 *   - D-05: `service` is `.toLowerCase().trim()`ed.
 *   - D-06: `product` / `version` / `extrainfo` verbatim (no lowercasing).
 *   - D-09 multi-host warning wording is locked.
 *   - CD-02 partial-XML wording is locked.
 *
 * `import "server-only"` prevents the client bundle from pulling in
 * fast-xml-parser (ARCHITECTURE.md: bundle < 2 MB).
 */

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  processEntities: false,
  isArray: (name: string) =>
    ["host", "port", "script", "osmatch", "hostname", "elem", "table"].includes(name),
} as const;

// D-15 / SEC-05 pre-parse DOCTYPE handling.
//   (a) Strip benign `<!DOCTYPE ...>` declarations that do NOT contain `[`
//       (i.e. no internal subset, no ENTITY definitions). nmap itself never
//       emits one, but some pipelines / editors add `<!DOCTYPE nmaprun>`.
//   (b) If any `<!DOCTYPE` remains after stripping, the original had a `[`
//       and therefore potentially an `ENTITY` — reject.
const BENIGN_DOCTYPE_RE = /<!DOCTYPE[^\[>]*>/gi;

export function parseNmapXml(raw: string): ParsedScan {
  // D-07: empty / whitespace-only input
  if (!raw || !raw.trim()) {
    throw new Error(
      "Empty input — paste your nmap -oX output and try again.",
    );
  }

  // Layer 1: DOCTYPE strip + reject
  const stripped = raw.replace(BENIGN_DOCTYPE_RE, "");
  if (/<!DOCTYPE/i.test(stripped)) {
    throw new Error(
      "XML contains a DOCTYPE declaration with entity definitions — " +
        "rejected for security. Provide a clean nmap -oX output without " +
        "custom DOCTYPE.",
    );
  }

  // D-07: concatenated --append-output → multiple `<?xml` prologues
  const prologues = (stripped.match(/<\?xml/gi) ?? []).length;
  if (prologues > 1) {
    throw new Error(
      "Multiple XML prologues detected. nmap --append-output produces " +
        "invalid concatenated XML. Provide a single scan file instead.",
    );
  }

  // Parse — fast-xml-parser is synchronous; layer 2 of XXE defense lives in
  // PARSER_OPTIONS (processEntities: false).
  let doc: XmlDoc;
  try {
    const parser = new XMLParser(PARSER_OPTIONS);
    doc = parser.parse(stripped) as XmlDoc;
  } catch {
    // CD-02 / INPUT-04 locked wording — do NOT interpolate the inner error
    // (no stack frames, no jargon in user-facing message).
    throw new Error(
      "Incomplete nmap XML — the scan may have been interrupted (Ctrl-C). " +
        "Re-run the scan or use partial results manually.",
    );
  }

  if (!doc || typeof doc !== "object" || !doc.nmaprun) {
    // fast-xml-parser can succeed on truncated input by silently closing open
    // tags — guard with a root sanity check so partial captures still throw a
    // helpful message rather than returning an empty ParsedScan.
    throw new Error(
      "Incomplete nmap XML — the scan may have been interrupted (Ctrl-C). " +
        "Re-run the scan or use partial results manually.",
    );
  }

  const warnings: string[] = [];
  const hosts = normalizeArray(
    doc.nmaprun.host as XmlHost | XmlHost[] | undefined,
  );

  const firstHost = hosts[0];
  if (!firstHost) {
    throw new Error(
      "No hosts found in scan. The nmap XML must contain at least one " +
        "<host> element.",
    );
  }

  // D-09 multi-host locked wording
  if (hosts.length > 1) {
    warnings.push(
      `Multi-host scan: ${hosts.length - 1} additional host(s) ignored — ` +
        `create a separate engagement per host.`,
    );
  }

  const target = extractTarget(firstHost);
  const ports = extractPorts(firstHost.ports, warnings);
  const hostScripts = extractHostScripts(firstHost.hostscript);
  const scannedAt = extractScannedAt(doc.nmaprun.start);
  const os = extractOs(firstHost.os);

  const result: ParsedScan = {
    target,
    source: "nmap-xml",
    ports,
    hostScripts,
    warnings,
  };
  if (scannedAt !== undefined) result.scannedAt = scannedAt;
  if (os !== undefined) result.os = os;
  return result;
}

// ----------------------------- helpers -------------------------------------

interface XmlDoc {
  nmaprun?: {
    start?: unknown;
    host?: unknown;
    [k: string]: unknown;
  };
}

interface XmlHost {
  address?: unknown;
  hostnames?: { hostname?: unknown } | undefined;
  ports?: { port?: unknown } | undefined;
  hostscript?: { script?: unknown } | undefined;
  os?: { osmatch?: unknown } | undefined;
  [k: string]: unknown;
}

interface XmlAddr {
  addr?: unknown;
  addrtype?: unknown;
}

interface XmlService {
  name?: unknown;
  product?: unknown;
  version?: unknown;
  tunnel?: unknown;
  extrainfo?: unknown;
}

interface XmlPort {
  portid?: unknown;
  protocol?: unknown;
  state?: { state?: unknown } | undefined;
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
}

function normalizeArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function extractTarget(host: XmlHost): { ip: string; hostname?: string } {
  const addrs = normalizeArray(host.address as XmlAddr | XmlAddr[] | undefined);
  const ipv4 = addrs.find((a) => a?.addrtype === "ipv4");
  const ipv6 = addrs.find((a) => a?.addrtype === "ipv6");
  const chosen = ipv4 ?? ipv6;
  const ip = chosen?.addr !== undefined ? String(chosen.addr) : "";
  const hostnameEl = normalizeArray(
    host.hostnames?.hostname as { name?: unknown } | { name?: unknown }[] | undefined,
  )[0];
  const rawHostname = hostnameEl?.name;
  const hostname =
    rawHostname !== undefined && rawHostname !== null && String(rawHostname) !== ""
      ? String(rawHostname)
      : undefined;
  return hostname ? { ip, hostname } : { ip };
}

function extractPorts(
  portsEl: { port?: unknown } | undefined,
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

    // D-02: drop unreportable states at parse time (not a warning — it's simply
    // not an observation worth rendering).
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
      // PARSE-04 parse-time half: emit undefined service + warning. Phase 4's
      // matchPort() routes undefined-service ports to default.yaml.
      warnings.push(`Port ${portNum}/${protocol}: no service detected.`);
    }

    const scripts = extractScripts(p.script as XmlScript | XmlScript[] | undefined);

    const parsed: ParsedPort = {
      port: portNum,
      protocol,
      state,
      scripts,
    };

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
    }

    result.push(parsed);
  }
  return result;
}

function extractScripts(
  scriptEl: XmlScript | XmlScript[] | undefined,
): ScriptOutput[] {
  if (!scriptEl) return [];
  const arr = normalizeArray(scriptEl);
  return arr.map((s) => {
    const result: ScriptOutput = {
      id: s.id !== undefined ? String(s.id) : "",
      // Pitfall 3: prefer the `output` attribute. If it's absent OR present but
      // empty (nmap emits `output=""` on CDATA scripts), fall back to element
      // body text (CDATA merged as `#text` by fast-xml-parser).
      output: pickScriptBody(s),
    };
    // UI-11 / PARSE-03: walk <elem>/<table> children. Only attach `structured`
    // when there is at least one entry — undefined preserves backward compat
    // for plain text-only scripts (e.g. http-title with only an `output` attr).
    const structured = walkStructured(s);
    if (structured.length > 0) {
      result.structured = structured;
    }
    return result;
  });
}

/**
 * Walk a script's <elem>/<table> children recursively, producing a structured
 * array consumed by Plan 07-04's <StructuredScriptOutput> renderer (UI-11).
 *
 * Returns an empty array when the node has no <elem> and no <table> children —
 * extractScripts treats empty as "omit `structured` entirely" so plain-text
 * scripts (http-title, ftp-anon, etc.) keep their original shape.
 *
 * Recursion: <table> nodes contain more <elem>/<table>, so we recurse via the
 * same XmlElem|XmlTable union shape. Depth is bounded by nmap's emitted XML
 * (typically <= 3 levels for ssl-cert / smb-os-discovery), so no explicit
 * recursion limit is needed; if a malicious fixture were to drive deep nesting
 * the existing parser-level XXE defenses (DOCTYPE strip, processEntities:false)
 * already prevent entity-expansion DoS — the walk itself is bounded by the
 * already-parsed object tree which fast-xml-parser materialized in memory.
 */
function walkStructured(
  node: XmlScript | XmlElem | XmlTable,
): Array<ScriptElem | ScriptTable> {
  const out: Array<ScriptElem | ScriptTable> = [];

  // The union (XmlScript | XmlElem | XmlTable) does not declare `elem`/`table`
  // on every member (XmlElem is leaf-only). Cast via the structural shape that
  // all three may carry in practice — fast-xml-parser may attach `elem`/`table`
  // as children to any of them.
  const childBag = node as { elem?: unknown; table?: unknown };

  // <elem> children — leaf nodes with text body.
  // fast-xml-parser shapes:
  //   <elem key="k">v</elem>   → { key: "k", "#text": "v" }
  //   <elem key="k"/>          → { key: "k" }                (no #text → value "")
  //   <elem>v</elem>           → "v"                          (bare string, no key)
  // The bare-string case happens when the element has neither attributes nor
  // children other than text — fast-xml-parser collapses it. Handle both.
  const elems = normalizeArray(
    childBag.elem as XmlElem | string | Array<XmlElem | string> | undefined,
  );
  for (const e of elems) {
    if (typeof e === "string") {
      // Bare-string elem — no attributes, just text body. key === "".
      out.push({ key: "", value: e });
      continue;
    }
    out.push({
      key: e.key !== undefined ? String(e.key) : "",
      // React text nodes consume `value` directly — never HTML (SEC-03).
      value: e["#text"] !== undefined ? String(e["#text"]) : "",
    });
  }

  // <table> children — recursive, may contain more <elem> and <table>.
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
  // D-04: always return an array, never undefined.
  if (!hostscriptEl) return [];
  return extractScripts(
    hostscriptEl.script as XmlScript | XmlScript[] | undefined,
  );
}

function extractScannedAt(start: unknown): string | undefined {
  // Pitfall 7: nmap `start` is Unix epoch SECONDS, not milliseconds.
  const unix = Number(start);
  if (!Number.isFinite(unix) || unix <= 0) return undefined;
  return new Date(unix * 1000).toISOString();
}

function extractOs(
  osEl: { osmatch?: unknown } | undefined,
): { name: string; accuracy?: number } | undefined {
  if (!osEl) return undefined;
  const matches = normalizeArray(
    osEl.osmatch as XmlOsMatch | XmlOsMatch[] | undefined,
  );
  if (matches.length === 0) return undefined;
  // CD-05: highest-accuracy osmatch wins; stable fallback to first on tie.
  const sorted = [...matches].sort(
    (a, b) => Number(b.accuracy ?? 0) - Number(a.accuracy ?? 0),
  );
  const best = sorted[0];
  if (!best?.name) return undefined;
  const name = String(best.name);
  const acc = Number(best.accuracy);
  return Number.isFinite(acc) ? { name, accuracy: acc } : { name };
}
