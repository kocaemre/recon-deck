import "server-only";

import JSZip from "jszip";
import { parseNmapXml } from "@/lib/parser";
import type { ParsedScan } from "@/lib/parser/types";

/**
 * AutoRecon zip importer (v2 enrichment).
 *
 * Discovers and parses the full AutoRecon `results/<ip>/` artifact set:
 *
 * Required (one of):
 *   - `scans/xml/_full_tcp_nmap.xml`         (preferred — full TCP)
 *   - `scans/xml/_quick_tcp_nmap.xml`        (fallback when full missing)
 *
 * Optional (collected when present):
 *   - `scans/xml/_top_20_udp_nmap.xml`               UDP ports merged
 *   - `scans/xml/{proto}_{port}_*_nmap.xml`          per-service nmap XML
 *   - `scans/{tcp|udp}{port}/...`                    per-port service files
 *     `scans/{tcp|udp}_{port}_...`                   flat-mode equivalent
 *   - `scans/_manual_commands.txt`                   port_commands
 *   - `scans/_patterns.log`                          highlights → warnings
 *   - `scans/_errors.log`                            tool failures → warnings
 *   - `scans/_commands.log`                          audit trail (artifact)
 *   - `loot/**`                                      credential dumps (artifact)
 *   - `report/notes.txt|proof.txt|local.txt`         operator notes (artifact)
 *   - `report/screenshots/**`                        screenshots (binary artifact)
 *   - `exploit/**`                                   exploit hints (artifact)
 *   - `*.png/*.jpg/*.jpeg/*.gif/*.webp`              screenshots stored base64
 *
 * Security-critical:
 *   - `import "server-only"` keeps jszip out of the client bundle (Pitfall 4).
 *   - Zip entry names are NEVER used as filesystem paths — every extracted
 *     entry is read into an in-memory string only (T-05-03 mitigation).
 *   - Per-entry decompressed-size limits prevent a single deflate-bombed
 *     entry from exhausting heap (defense-in-depth alongside the route's
 *     50 MB pre-load check). Implemented via a streaming reader that aborts
 *     once the per-entry budget is exceeded.
 *   - Aggregate decompressed-size budget across ALL entries caps total heap
 *     footprint at MAX_TOTAL_DECOMPRESSED.
 *   - Extracted XML is run through `parseNmapXml` (XXE defense from Phase 2).
 *
 * Throw / warn taxonomy:
 *   - Throws (hard reject):
 *       * empty zip (no entries)
 *       * zip without `_full_tcp_nmap.xml` AND `_quick_tcp_nmap.xml`
 *       * zip without a `scans/` directory component
 *       * extracted XML decompresses past per-entry budget (zip-bomb)
 *       * aggregate decompressed payload exceeds budget (zip-bomb)
 *       * `parseNmapXml` failure on the chosen TCP XML (re-thrown with prefix)
 *   - Warnings (soft, accumulated into `scan.warnings`):
 *       * fell back to quick scan
 *       * `_patterns.log` first 20 lines (signal highlights)
 *       * `_errors.log` first 20 lines (tool failures)
 *       * `_manual_commands.txt` header references a port not in the scan
 *
 * Tolerated silently (D-10):
 *   - Missing optional artifacts
 *   - Per-file entries larger than per-entry AR-file limit (skipped)
 */

export type ArArtifactKind =
  | "loot"
  | "report"
  | "screenshot"
  | "patterns"
  | "errors"
  | "commands"
  | "exploit"
  | "service-nmap-xml";

export interface ArFile {
  filename: string;
  /** Raw text or base64-encoded binary. */
  content: string;
  /** "utf8" for text files, "base64" for images. Defaults to "utf8" if omitted. */
  encoding?: "utf8" | "base64";
}

export interface ArArtifact {
  kind: ArArtifactKind;
  filename: string;
  /** Decoded content (utf8 string OR base64 of binary). */
  content: string;
  encoding: "utf8" | "base64";
}

export interface ArCommand {
  label: string;
  template: string;
}

export interface AutoReconResult {
  scan: ParsedScan;
  /** Per-port (port number) service file outputs. Same as v1. */
  arFiles: Map<number, ArFile[]>;
  /** Per-port (port number) manual commands. Same as v1. */
  arCommands: Map<number, ArCommand[]>;
  /** Engagement-level artifacts (loot, report, screenshots, patterns, ...). v2. */
  arArtifacts: ArArtifact[];
}

/* --------------------------- regexes & limits ----------------------------- */

const HEADER_RE = /^\[\*\]\s+(\S+)\s+on\s+(tcp|udp)\/(\d+)\s*$/;
const SUB_HEADER_RE = /^\s+\[-\]\s+(.+)$/;

const MAX_FILE_SIZE = 1 * 1024 * 1024;
const MAX_REQUIRED_ENTRY_SIZE = 16 * 1024 * 1024;
/** Larger cap for binary screenshots (gowitness/aquatone png+jpg are 100-500 KB). */
const MAX_BINARY_FILE_SIZE = 4 * 1024 * 1024;
const MAX_TOTAL_DECOMPRESSED = 200 * 1024 * 1024;

const BINARY_EXT_RE = /\.(png|jpe?g|gif|webp|bmp)$/i;
const SERVICE_NMAP_XML_RE = /xml\/(tcp|udp)_(\d+)_[^/]+_nmap\.xml$/;

/* --------------------------- streaming readers ---------------------------- */

async function readEntryAsBuffer(
  entry: JSZip.JSZipObject,
  perEntryLimit: number,
  budget: { used: number },
): Promise<Buffer> {
  const remainingAggregate = MAX_TOTAL_DECOMPRESSED - budget.used;
  if (remainingAggregate <= 0) {
    throw new Error(
      "AutoRecon zip decompresses to more than 200 MB. " +
        "Possible zip bomb; rejected.",
    );
  }
  const effectiveLimit = Math.min(perEntryLimit, remainingAggregate);

  return await new Promise<Buffer>((resolve, reject) => {
    type AbortableStream = NodeJS.ReadableStream & { destroy?: () => void };
    const stream: AbortableStream = entry.nodeStream("nodebuffer");
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const cleanup = () => {
      stream.removeAllListeners("data");
      stream.removeAllListeners("end");
      stream.removeAllListeners("error");
    };

    stream.on("data", (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > effectiveLimit) {
        settled = true;
        cleanup();
        stream.destroy?.();
        if (total > perEntryLimit) {
          reject(
            new Error(
              `AutoRecon zip entry "${entry.name}" decompresses to more than ` +
                `${Math.floor(perEntryLimit / (1024 * 1024))} MB. ` +
                "Possible zip bomb; rejected.",
            ),
          );
        } else {
          reject(
            new Error(
              "AutoRecon zip decompresses to more than 200 MB. " +
                "Possible zip bomb; rejected.",
            ),
          );
        }
        return;
      }
      chunks.push(chunk);
    });

    stream.on("end", () => {
      if (settled) return;
      settled = true;
      cleanup();
      budget.used += total;
      resolve(Buffer.concat(chunks));
    });

    stream.on("error", (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });
  });
}

async function readEntryAsString(
  entry: JSZip.JSZipObject,
  perEntryLimit: number,
  budget: { used: number },
): Promise<string> {
  const buf = await readEntryAsBuffer(entry, perEntryLimit, budget);
  return buf.toString("utf8");
}

async function readEntryAsBase64(
  entry: JSZip.JSZipObject,
  perEntryLimit: number,
  budget: { used: number },
): Promise<string> {
  const buf = await readEntryAsBuffer(entry, perEntryLimit, budget);
  return buf.toString("base64");
}

/* --------------------------- helpers ------------------------------------- */

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

/** Find the scans/ base prefix from a known suffix entry. */
function deriveScansBase(entryName: string, suffixToStrip: RegExp): string {
  return entryName.replace(suffixToStrip, "");
}

/* --------------------------- main entrypoint ----------------------------- */

export async function importAutoRecon(
  buffer: ArrayBuffer,
  _zipFilename: string,
): Promise<AutoReconResult> {
  const zip = await JSZip.loadAsync(buffer);
  const budget = { used: 0 };

  if (Object.keys(zip.files).length === 0) {
    throw new Error("Zip contains no files.");
  }

  // ----- 1. Locate required TCP XML (full preferred, quick fallback) -----
  // P1-G follow-up: multi-IP zips put each `<ip>/` under its own results/
  // root, so the same _full_tcp_nmap.xml suffix shows up multiple times.
  // Collect every match — the first becomes the primary import path
  // (existing per-port AR file / manual-command logic), and the rest are
  // walked at the end to populate scan.hosts[] without re-running the
  // expensive AR collection routines.
  const isFullTcp = (name: string): boolean =>
    name.endsWith("/scans/xml/_full_tcp_nmap.xml") ||
    name === "scans/xml/_full_tcp_nmap.xml";
  const isQuickTcp = (name: string): boolean =>
    name.endsWith("/scans/xml/_quick_tcp_nmap.xml") ||
    name === "scans/xml/_quick_tcp_nmap.xml";

  const allFullEntries = Object.values(zip.files).filter(
    (f) => !f.dir && isFullTcp(f.name),
  );
  const allQuickEntries = Object.values(zip.files).filter(
    (f) => !f.dir && isQuickTcp(f.name),
  );

  const fullEntry = allFullEntries[0];
  const quickEntry = allQuickEntries[0];

  const tcpEntry = fullEntry ?? quickEntry;
  if (!tcpEntry) {
    throw new Error(
      "Could not find scans/xml/_full_tcp_nmap.xml (or _quick_tcp_nmap.xml) " +
        "in the uploaded zip. Make sure you're zipping the results/<ip>/ folder.",
    );
  }

  const usedQuickFallback = !fullEntry && !!quickEntry;

  const scansBase = deriveScansBase(
    tcpEntry.name,
    /xml\/_(?:full|quick)_tcp_nmap\.xml$/,
  );

  // Tally extra TCP XMLs (full preferred over quick, but if a host only has
  // _quick we'll use that). Filter out the entry already chosen as primary.
  const secondaryEntries: JSZip.JSZipObject[] = [];
  const claimedNames = new Set<string>([tcpEntry.name]);
  for (const e of allFullEntries) {
    if (!claimedNames.has(e.name)) {
      secondaryEntries.push(e);
      claimedNames.add(e.name);
    }
  }
  // For hosts where only _quick exists, fall back to that. Detect by base.
  const fullBaseNames = new Set(
    allFullEntries.map((e) =>
      deriveScansBase(e.name, /xml\/_full_tcp_nmap\.xml$/),
    ),
  );
  for (const e of allQuickEntries) {
    const base = deriveScansBase(e.name, /xml\/_quick_tcp_nmap\.xml$/);
    if (!fullBaseNames.has(base) && !claimedNames.has(e.name)) {
      secondaryEntries.push(e);
      claimedNames.add(e.name);
    }
  }

  // ----- 2. Parse TCP XML -----
  const tcpXmlString = await readEntryAsString(
    tcpEntry,
    MAX_REQUIRED_ENTRY_SIZE,
    budget,
  );
  let scan: ParsedScan;
  try {
    scan = parseNmapXml(tcpXmlString);
  } catch (err) {
    throw new Error(
      "AutoRecon XML could not be parsed: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  (scan as { source: ParsedScan["source"] }).source = "autorecon";

  // Stash the extracted full TCP XML so the engagement page can re-parse it
  // and surface v2 fields (cpe, reason, traceroute, OS classes, scanner,
  // runstats, extraports). Without this the engagement.raw_input column would
  // only hold the zip filename — re-parse impossible.
  const sourceXmlForRetainment = tcpXmlString;

  if (usedQuickFallback) {
    scan.warnings.push(
      "AutoRecon: full TCP scan XML missing — used _quick_tcp_nmap.xml " +
        "(top-1000 ports only). Re-run AutoRecon for complete coverage.",
    );
  }

  // ----- 3. Optional UDP merge -----
  const udpEntry = Object.values(zip.files).find(
    (f) =>
      !f.dir &&
      (f.name === `${scansBase}xml/_top_20_udp_nmap.xml` ||
        f.name.endsWith("/scans/xml/_top_20_udp_nmap.xml")),
  );
  if (udpEntry) {
    try {
      const udpXmlString = await readEntryAsString(
        udpEntry,
        MAX_REQUIRED_ENTRY_SIZE,
        budget,
      );
      const udpScan = parseNmapXml(udpXmlString);
      // Merge UDP ports — dedupe by (proto, port).
      const seen = new Set(scan.ports.map((p) => `${p.protocol}:${p.port}`));
      for (const p of udpScan.ports) {
        const key = `${p.protocol}:${p.port}`;
        if (!seen.has(key)) {
          scan.ports.push(p);
          seen.add(key);
        }
      }
      scan.ports.sort((a, b) => a.port - b.port);
      // Carry forward UDP-side warnings prefixed for context.
      for (const w of udpScan.warnings) {
        scan.warnings.push(`UDP scan: ${w}`);
      }
    } catch (err) {
      scan.warnings.push(
        "AutoRecon: failed to parse _top_20_udp_nmap.xml — " +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  // ----- 4. Per-port service files (TCP + UDP, port-dirs + flat) -----
  const arFiles = new Map<number, ArFile[]>();
  for (const port of scan.ports) {
    const proto = port.protocol;
    const portDirPrefix = `${scansBase}${proto}${port.port}/`;
    const flatPrefix = `${scansBase}${proto}_${port.port}_`;

    const matches = Object.values(zip.files).filter(
      (f) =>
        !f.dir &&
        (f.name.startsWith(portDirPrefix) || f.name.startsWith(flatPrefix)),
    );
    if (matches.length === 0) continue;

    const files: ArFile[] = [];
    for (const entry of matches) {
      // Binary detection for screenshots tucked under per-port dirs (rare,
      // but seen in some plugin configurations).
      if (BINARY_EXT_RE.test(entry.name)) {
        let content: string;
        try {
          content = await readEntryAsBase64(
            entry,
            MAX_BINARY_FILE_SIZE,
            budget,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("more than 200 MB")) throw err;
          continue;
        }
        files.push({
          filename: basename(entry.name),
          content,
          encoding: "base64",
        });
        continue;
      }

      let content: string;
      try {
        content = await readEntryAsString(entry, MAX_FILE_SIZE, budget);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("more than 200 MB")) throw err;
        continue;
      }
      files.push({
        filename: basename(entry.name),
        content,
        encoding: "utf8",
      });
    }
    if (files.length > 0) arFiles.set(port.port, files);
  }

  // ----- 5. Manual commands -----
  const arCommands = new Map<number, ArCommand[]>();
  const manualCommandsPath = `${scansBase}_manual_commands.txt`;
  const manualCommandsEntry = zip.file(manualCommandsPath);
  if (manualCommandsEntry) {
    const text = await readEntryAsString(
      manualCommandsEntry,
      MAX_REQUIRED_ENTRY_SIZE,
      budget,
    );
    const lines = text.split(/\r?\n/);
    let currentPort: number | null = null;
    let currentLabel: string | null = null;
    const validPorts = new Set(scan.ports.map((p) => p.port));
    const warnedPorts = new Set<number>();
    for (const line of lines) {
      const headerMatch = HEADER_RE.exec(line);
      if (headerMatch) {
        const portNum = Number(headerMatch[3]);
        if (validPorts.has(portNum)) {
          currentPort = portNum;
        } else {
          currentPort = null;
          if (!warnedPorts.has(portNum)) {
            warnedPorts.add(portNum);
            scan.warnings.push(
              `AutoRecon manual command for port ${portNum} dropped — ` +
                `port not found in scan results.`,
            );
          }
        }
        currentLabel = null;
        continue;
      }
      const subMatch = SUB_HEADER_RE.exec(line);
      if (subMatch) {
        currentLabel = subMatch[1].trim();
        continue;
      }
      if (
        currentPort !== null &&
        currentLabel !== null &&
        line.length > 0 &&
        /^\s/.test(line)
      ) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        const list = arCommands.get(currentPort) ?? [];
        list.push({ label: currentLabel, template: trimmed });
        arCommands.set(currentPort, list);
      }
    }
  }

  // ----- 6. Engagement-level artifacts ----------------------------------
  const arArtifacts: ArArtifact[] = [];

  const tryReadArtifact = async (
    entry: JSZip.JSZipObject,
    kind: ArArtifactKind,
    cap: number,
    binary: boolean,
  ) => {
    try {
      const content = binary
        ? await readEntryAsBase64(entry, cap, budget)
        : await readEntryAsString(entry, cap, budget);
      arArtifacts.push({
        kind,
        filename: entry.name,
        content,
        encoding: binary ? "base64" : "utf8",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("more than 200 MB")) throw err;
      // soft-skip oversize/parse failures per D-10
    }
  };

  // Determine the engagement-root prefix (`results/<ip>/` or empty for flat zip).
  const engagementRoot = scansBase.replace(/scans\/$/, "");

  // patterns.log + errors.log + commands.log
  for (const name of ["_patterns.log", "_errors.log", "_commands.log"]) {
    const entry = zip.file(`${scansBase}${name}`);
    if (entry) {
      const kind: ArArtifactKind =
        name === "_patterns.log"
          ? "patterns"
          : name === "_errors.log"
            ? "errors"
            : "commands";
      await tryReadArtifact(entry, kind, MAX_REQUIRED_ENTRY_SIZE, false);
      // Push first 20 highlight lines from patterns/errors into warnings so
      // they surface in the engagement banner.
      if (kind === "patterns" || kind === "errors") {
        const last = arArtifacts[arArtifacts.length - 1];
        if (last && last.kind === kind) {
          const lines = last.content
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
          const cap = 20;
          for (const l of lines.slice(0, cap)) {
            scan.warnings.push(
              `AutoRecon ${kind === "patterns" ? "pattern" : "error"}: ${l}`,
            );
          }
          if (lines.length > cap) {
            scan.warnings.push(
              `AutoRecon ${kind}: …and ${lines.length - cap} more (see artifact).`,
            );
          }
        }
      }
    }
  }

  // Per-service nmap XML under scans/xml/{proto}_{port}_{svc}_nmap.xml
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    if (!entry.name.startsWith(scansBase)) continue;
    if (!SERVICE_NMAP_XML_RE.test(entry.name)) continue;
    await tryReadArtifact(
      entry,
      "service-nmap-xml",
      MAX_REQUIRED_ENTRY_SIZE,
      false,
    );
  }

  // loot/, report/, exploit/ directory dumps
  const dirArtifactKinds: Array<{ prefix: string; kind: ArArtifactKind }> = [
    { prefix: `${engagementRoot}loot/`, kind: "loot" },
    { prefix: `${engagementRoot}report/`, kind: "report" },
    { prefix: `${engagementRoot}exploit/`, kind: "exploit" },
  ];
  for (const { prefix, kind } of dirArtifactKinds) {
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      if (!entry.name.startsWith(prefix)) continue;
      const isBinary = BINARY_EXT_RE.test(entry.name);
      const useKind: ArArtifactKind = isBinary ? "screenshot" : kind;
      const cap = isBinary ? MAX_BINARY_FILE_SIZE : MAX_REQUIRED_ENTRY_SIZE;
      await tryReadArtifact(entry, useKind, cap, isBinary);
    }
  }

  // Catch-all: any other binary screenshot anywhere under engagementRoot
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    if (!entry.name.startsWith(engagementRoot)) continue;
    if (!BINARY_EXT_RE.test(entry.name)) continue;
    // Skip if already collected by a previous loop (per-port files or dir dump).
    if (arArtifacts.some((a) => a.filename === entry.name)) continue;
    if (
      Array.from(arFiles.values()).some((files) =>
        files.some((f) => f.filename === basename(entry.name)),
      )
    ) {
      continue;
    }
    await tryReadArtifact(entry, "screenshot", MAX_BINARY_FILE_SIZE, true);
  }

  // ----- 7. Retain extracted full TCP XML so the engagement page can
  //         re-parse for v2 enrichment (cpe, reason, traceroute, ...).
  arArtifacts.push({
    kind: "service-nmap-xml",
    filename: "_full_tcp_nmap.xml",
    content: sourceXmlForRetainment,
    encoding: "utf8",
  });

  // ----- 8. P1-G follow-up: append secondary hosts from multi-IP zips.
  //         Each extra `_full_tcp_nmap.xml` (or `_quick_*` when full is
  //         absent) becomes another ParsedHost on scan.hosts. Per-port AR
  //         data and engagement-level artifacts stay scoped to the primary
  //         host — multi-IP AR data merge is out of scope for now.
  if (secondaryEntries.length > 0) {
    scan.warnings.push(
      `AutoRecon multi-IP zip detected — ${secondaryEntries.length} ` +
        `secondary host${secondaryEntries.length === 1 ? "" : "s"} ` +
        "imported (ports + scripts only; per-host AR data not merged).",
    );
    for (const entry of secondaryEntries) {
      try {
        const xmlString = await readEntryAsString(
          entry,
          MAX_REQUIRED_ENTRY_SIZE,
          budget,
        );
        const secondaryScan = parseNmapXml(xmlString);
        // parseNmapXml always returns hosts.length >= 1; copy the first
        // (and typically only) host into our aggregate.
        for (const ph of secondaryScan.hosts) {
          scan.hosts.push(ph);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        scan.warnings.push(
          `AutoRecon: failed to parse secondary host "${entry.name}" — ${msg}`,
        );
      }
    }
  }

  return { scan, arFiles, arCommands, arArtifacts };
}
