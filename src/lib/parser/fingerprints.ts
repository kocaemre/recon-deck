/**
 * Nmap fingerprint extractor (v2.4.0 P2 #27).
 *
 * Distills tech / CVE / banner signals from a parsed nmap port row into
 * a flat `Fingerprint[]` shape that the resolver (P4) can evaluate
 * `autorecon_finding(type, value)` predicates against. Predicates that
 * read raw nmap data live (`nmap_script_contains`, `nmap_version_matches`)
 * don't go through this extractor — they query `port_scripts` and the
 * `ports` columns directly.
 *
 * Heuristics are deliberately conservative — false positives here mean
 * KB conditional groups fire on the wrong port and the operator sees
 * irrelevant checks. False negatives are recoverable (the operator just
 * doesn't get the bonus checks). When in doubt, drop the signal.
 *
 * Pure functions, no I/O. Persistence is handled by `fingerprints-repo`.
 */

import type { ParsedPort } from "./types";

export type FingerprintType = "tech" | "cves" | "banners";

export interface NmapFingerprint {
  type: FingerprintType;
  value: string;
}

/**
 * Tech keywords matched substring-wise against the lower-cased product /
 * version / extrainfo / script-output blob. Order is intentional —
 * specific names before generic family terms (e.g. `wordpress` before
 * `apache`) so the strongest signal wins when both appear in one banner.
 *
 * Keep this list narrow. Each entry should map to a distinct attack
 * surface that KB authors might want to gate a checklist group on.
 *
 * Exported as `TECH_KEYWORDS` so the AutoRecon extractor (P3) can reuse
 * the same keyword set against whatweb / feroxbuster / nikto outputs.
 */
export const TECH_KEYWORDS: ReadonlyArray<{ tag: string; needles: string[] }> = [
  { tag: "wordpress", needles: ["wordpress"] },
  { tag: "drupal", needles: ["drupal"] },
  { tag: "joomla", needles: ["joomla"] },
  { tag: "phpmyadmin", needles: ["phpmyadmin"] },
  { tag: "tomcat", needles: ["tomcat", "apache-coyote"] },
  { tag: "jenkins", needles: ["jenkins"] },
  { tag: "weblogic", needles: ["weblogic"] },
  { tag: "iis", needles: ["microsoft-iis", "microsoft iis"] },
  { tag: "nginx", needles: ["nginx"] },
  { tag: "apache", needles: ["apache httpd", "apache/2.", "apache/1.", "apache["] },
  { tag: "lighttpd", needles: ["lighttpd"] },
  { tag: "openssh", needles: ["openssh"] },
  { tag: "vsftpd", needles: ["vsftpd"] },
  { tag: "proftpd", needles: ["proftpd"] },
  { tag: "samba", needles: ["samba"] },
  { tag: "mysql", needles: ["mysql"] },
  { tag: "postgresql", needles: ["postgresql"] },
  { tag: "mssql", needles: ["microsoft sql server", "ms-sql"] },
  { tag: "oracle", needles: ["oracle tnslsnr", "oracle database"] },
  { tag: "redis", needles: ["redis"] },
  { tag: "mongodb", needles: ["mongodb"] },
  { tag: "memcached", needles: ["memcached"] },
  { tag: "elasticsearch", needles: ["elasticsearch"] },
  { tag: "rabbitmq", needles: ["rabbitmq"] },
  { tag: "ldap", needles: ["openldap", "active directory ldap"] },
  { tag: "kerberos", needles: ["kerberos"] },
  { tag: "smb", needles: ["microsoft-ds", "netbios-ssn"] },
  { tag: "rdp", needles: ["ms-wbt-server"] },
  // Languages — usually surface via X-Powered-By or extrainfo.
  { tag: "php", needles: ["php/", "x-powered-by: php", "php["] },
  { tag: "asp.net", needles: ["asp.net", "x-powered-by: asp.net"] },
  { tag: "node.js", needles: ["node.js", "x-powered-by: express"] },
  { tag: "python", needles: ["werkzeug", "gunicorn", "uvicorn"] },
  { tag: "ruby", needles: ["puma", "passenger phusion", "thin "] },
];

/** CVE identifier pattern. Exported so P3 reuses the same regex. */
export const CVE_RE = /CVE-\d{4}-\d{4,7}/gi;

/**
 * Match the curated tech keyword list against a lower-cased haystack and
 * return the deduplicated list of tags in the order they first appeared
 * in `TECH_KEYWORDS`. Shared between the nmap and AutoRecon extractors.
 */
export function matchTechKeywords(haystackLower: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { tag, needles } of TECH_KEYWORDS) {
    if (seen.has(tag)) continue;
    if (needles.some((n) => haystackLower.includes(n))) {
      out.push(tag);
      seen.add(tag);
    }
  }
  return out;
}

/**
 * Pull every CVE identifier out of a haystack, uppercased + deduplicated.
 * Shared between nmap and AutoRecon extractors.
 */
export function matchCves(haystack: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const matches = haystack.match(CVE_RE) ?? [];
  for (const raw of matches) {
    const upper = raw.toUpperCase();
    if (seen.has(upper)) continue;
    out.push(upper);
    seen.add(upper);
  }
  return out;
}

/**
 * Build the haystack used for tech / CVE matching from a single port row.
 * Lower-cased so callers can match in lowercase. Includes product, version,
 * extrainfo, every NSE script output (id + body — `http-php-version`
 * matters even when the body is short), CPEs, and the service name. The
 * blob isn't persisted — only used to derive fingerprints.
 */
function buildHaystack(port: ParsedPort): string {
  const parts: string[] = [];
  if (port.service) parts.push(port.service);
  if (port.product) parts.push(port.product);
  if (port.version) parts.push(port.version);
  if (port.extrainfo) parts.push(port.extrainfo);
  if (port.cpe) parts.push(...port.cpe);
  for (const s of port.scripts) {
    parts.push(s.id);
    parts.push(s.output);
  }
  return parts.join(" ").toLowerCase();
}

/**
 * Extract a stable, deduplicated banner string from product / version /
 * extrainfo. Empty when none are present. The shape mirrors what an
 * operator would copy out of the nmap "Service Info" line, so KB
 * authors writing `autorecon_finding(type: banners, value: "Apache/2.4.49")`
 * can match what they see in the heatmap.
 */
function extractBanner(port: ParsedPort): string | null {
  const segments = [port.product, port.version, port.extrainfo]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  return segments.length > 0 ? segments.join(" ") : null;
}

/**
 * Heuristic nmap fingerprint extractor.
 *
 * Returns a deduplicated `NmapFingerprint[]` covering every signal we
 * could derive from this port. Order is deterministic (tech first, then
 * cves, then banners) so test fixtures can lock it down.
 */
export function extractNmapFingerprints(port: ParsedPort): NmapFingerprint[] {
  const out: NmapFingerprint[] = [];
  const haystack = buildHaystack(port);

  for (const tag of matchTechKeywords(haystack)) {
    out.push({ type: "tech", value: tag });
  }
  for (const cve of matchCves(haystack)) {
    out.push({ type: "cves", value: cve });
  }
  const banner = extractBanner(port);
  if (banner) out.push({ type: "banners", value: banner });

  return out;
}
