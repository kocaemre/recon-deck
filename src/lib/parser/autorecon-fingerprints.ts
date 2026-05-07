/**
 * AutoRecon fingerprint extractor (v2.4.0 P3 #28).
 *
 * Parallels `extractNmapFingerprints` — pure functions, no I/O — but
 * sources from the per-port AutoRecon files persisted by the importer.
 * Same `Fingerprint` shape so the resolver (P4) reads both sources
 * agnostically.
 *
 * Heuristics layer on the shared keyword + CVE matchers from
 * `fingerprints.ts`, then add a feroxbuster/gobuster/dirb extension
 * heuristic that's specific to web-discovery output: when the bulk of
 * discovered paths share a runtime extension (`.php`, `.aspx`, `.jsp`),
 * tag the matching language. This catches PHP/.NET/Java apps even when
 * whatweb didn't run or the server header was sanitised.
 *
 * Conservative on purpose. False positives mean operators see the wrong
 * conditional checklist; false negatives are recoverable. When in doubt,
 * drop the signal.
 */

import { matchCves, matchTechKeywords, type FingerprintType } from "./fingerprints";

export interface AutoReconFingerprint {
  type: FingerprintType;
  value: string;
}

export interface AutoReconFile {
  filename: string;
  /** Raw text body (utf8). Binary screenshots etc. should be filtered before. */
  content: string;
  encoding?: "utf8" | "base64";
}

/** Files we recognise as web-discovery tools whose output is a path list. */
const DISCOVERY_TOOL_RE = /(feroxbuster|gobuster|dirsearch|ffuf|dirb)/i;

/**
 * Extension → tech tag mapping for the discovery-tool heuristic. Order
 * doesn't matter; we tally counts and pick the top.
 */
const EXT_TECH_MAP: ReadonlyMap<string, string> = new Map([
  ["php", "php"],
  ["asp", "asp.net"],
  ["aspx", "asp.net"],
  ["ashx", "asp.net"],
  ["jsp", "java"],
  ["jspx", "java"],
  ["do", "java"],
  ["py", "python"],
  ["rb", "ruby"],
  ["cgi", "cgi"],
]);

/**
 * Threshold below which an extension hit count is ignored — a single
 * stray `.php` URL on a static site shouldn't tag the whole port. Tuned
 * conservatively; the resolver's signal weight is already binary, so a
 * borderline tag doesn't hurt much.
 */
const EXT_HIT_FLOOR = 3;

/**
 * Walk a discovery-tool output and tally URL path extensions. We only
 * count tokens that look like a path or URL with an extension; bare
 * lines like `[ERROR]` get ignored.
 */
function tallyExtensions(content: string): Map<string, number> {
  const tally = new Map<string, number>();
  // Match path components ending in ".<ext>" where ext is alphanumeric,
  // bounded by whitespace, line break, query/fragment marker, or quote.
  const PATH_EXT_RE = /\/[A-Za-z0-9._%~-]+\.([A-Za-z0-9]{1,6})(?=[\s"'?#]|$)/gm;
  for (const m of content.matchAll(PATH_EXT_RE)) {
    const ext = m[1].toLowerCase();
    if (!EXT_TECH_MAP.has(ext)) continue;
    tally.set(ext, (tally.get(ext) ?? 0) + 1);
  }
  return tally;
}

/**
 * Promote tallied extensions into tech tags. Counts are summed per-tag
 * before the threshold check so `asp` + `aspx` + `ashx` collectively
 * promote `asp.net` even when no single extension reaches the floor on
 * its own. Iteration order follows `EXT_TECH_MAP` insertion order, so
 * output is deterministic.
 */
function tagsFromExtensionTally(tally: Map<string, number>): string[] {
  const tagTotals = new Map<string, number>();
  for (const [ext, count] of tally) {
    const tag = EXT_TECH_MAP.get(ext);
    if (!tag) continue;
    tagTotals.set(tag, (tagTotals.get(tag) ?? 0) + count);
  }
  const out: string[] = [];
  for (const [tag, total] of tagTotals) {
    if (total >= EXT_HIT_FLOOR) out.push(tag);
  }
  return out;
}

/**
 * Concatenate every utf8 file's content into a single haystack for the
 * shared keyword + CVE matchers. Filenames are included so a file like
 * `tcp_80_http_whatweb.txt` contributes the word "whatweb" to the
 * haystack — useful when the file body itself is sparse.
 */
function buildHaystack(files: ReadonlyArray<AutoReconFile>): string {
  const parts: string[] = [];
  for (const f of files) {
    if (f.encoding === "base64") continue;
    parts.push(f.filename);
    parts.push(f.content);
  }
  return parts.join("\n").toLowerCase();
}

/**
 * Heuristic AutoRecon fingerprint extractor.
 *
 * Returns deterministic, deduplicated `AutoReconFingerprint[]`. Tags
 * derived from the curated keyword list come first; extension-based
 * tags from web-discovery tools are merged in next (deduplicated against
 * the keyword tags); CVEs follow last.
 *
 * No banner output — banner lines are nmap territory; AutoRecon adds
 * detail on top.
 */
export function extractAutoReconFingerprints(
  files: ReadonlyArray<AutoReconFile>,
): AutoReconFingerprint[] {
  const out: AutoReconFingerprint[] = [];
  if (files.length === 0) return out;

  const haystack = buildHaystack(files);

  // --- tech via shared keyword list ---
  const seenTech = new Set<string>();
  for (const tag of matchTechKeywords(haystack)) {
    out.push({ type: "tech", value: tag });
    seenTech.add(tag);
  }

  // --- tech via discovery-tool extension tally ---
  const tally = new Map<string, number>();
  for (const f of files) {
    if (f.encoding === "base64") continue;
    if (!DISCOVERY_TOOL_RE.test(f.filename)) continue;
    for (const [ext, count] of tallyExtensions(f.content)) {
      tally.set(ext, (tally.get(ext) ?? 0) + count);
    }
  }
  for (const tag of tagsFromExtensionTally(tally)) {
    if (seenTech.has(tag)) continue;
    out.push({ type: "tech", value: tag });
    seenTech.add(tag);
  }

  // --- CVEs ---
  for (const cve of matchCves(haystack)) {
    out.push({ type: "cves", value: cve });
  }

  return out;
}
