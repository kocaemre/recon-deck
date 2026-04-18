import "server-only";

import JSZip from "jszip";
import { parseNmapXml } from "@/lib/parser";
import type { ParsedScan } from "@/lib/parser/types";

/**
 * AutoRecon zip importer — extracts a user-uploaded `results/<ip>/` zip,
 * finds the full TCP nmap XML, parses per-port service scan files and
 * `_manual_commands.txt`, and returns a structured `AutoReconResult` ready
 * for `createFromScan(...)` (Phase 5 D-13 / D-14).
 *
 * Security-critical:
 *   - `import "server-only"` keeps jszip out of the client bundle (Pitfall 4).
 *   - Zip entry names are NEVER used as filesystem paths — every extracted
 *     entry is read into an in-memory string only (T-05-03 mitigation).
 *   - Per-entry decompressed-size limits prevent a single deflate-bombed
 *     entry from exhausting heap (defense-in-depth alongside the route's
 *     50 MB pre-load check). Implemented via a streaming reader that aborts
 *     once the per-entry budget is exceeded — public jszip API, no reliance
 *     on private `_data.uncompressedSize` (HI-01, HI-02, ME-02).
 *   - Aggregate decompressed-size budget across ALL entries caps total heap
 *     footprint at MAX_TOTAL_DECOMPRESSED. Without this, hundreds of entries
 *     each just under the per-entry limit can sum to multi-GB (HI-02).
 *   - Extracted XML is run through the existing `parseNmapXml` which has the
 *     two-layer XXE defense from Phase 2 (T-05-05 reuse).
 *
 * Throw / warn taxonomy (mirrors Phase 2 D-07/D-08):
 *   - Throws (hard reject, user-facing, no stack frames):
 *       * empty zip (no entries)
 *       * zip missing `_full_tcp_nmap.xml`
 *       * zip without a `scans/` directory component
 *       * extracted XML decompresses past per-entry budget (zip-bomb)
 *       * aggregate decompressed payload exceeds budget (zip-bomb)
 *       * `parseNmapXml` failure on extracted XML (re-thrown with prefix)
 *   - Warnings (soft, accumulated into `scan.warnings`):
 *       * `_manual_commands.txt` header references a port not in the scan
 *
 * Tolerated silently (D-10):
 *   - Missing `_manual_commands.txt`
 *   - Missing per-port service files
 *   - Per-file entries larger than the per-entry AR-file limit (skipped,
 *     not fatal, since one oversized service file should not block import)
 *
 * Path resolution (CD-05 / Pitfall 5): we search by suffix
 * `xml/_full_tcp_nmap.xml` so both `results/<ip>/scans/xml/...` (user zipped
 * the IP folder) and `scans/xml/...` (user zipped from inside the IP folder)
 * layouts work without hardcoding a prefix.
 */

export interface ArFile {
  filename: string;
  content: string;
}

export interface ArCommand {
  label: string;
  template: string;
}

export interface AutoReconResult {
  scan: ParsedScan;
  arFiles: Map<number, ArFile[]>;
  arCommands: Map<number, ArCommand[]>;
}

/** AutoRecon `_manual_commands.txt` section header — `[*] {service} on {tcp|udp}/{port}`.
 *  Verified from `autorecon/main.py` (Pattern 5 in 05-RESEARCH.md). */
const HEADER_RE = /^\[\*\]\s+(\S+)\s+on\s+(tcp|udp)\/(\d+)\s*$/;

/** AutoRecon per-tool sub-header inside a section — `    [-] nikto`. */
const SUB_HEADER_RE = /^\s+\[-\]\s+(.+)$/;

/** Per-AR-file safety limit — skip individual service-file entries larger
 *  than this. AutoRecon nmap-text output is typically a few KB; 1 MB is
 *  generous. Going over this cap skips the entry (D-10: missing service
 *  files are tolerated) rather than aborting the whole import. */
const MAX_FILE_SIZE = 1 * 1024 * 1024;

/** Per-entry hard cap for the main AutoRecon XML and `_manual_commands.txt`.
 *  These are required for a successful import, so exceeding the cap is fatal
 *  (rejected as a probable zip-bomb). 16 MB comfortably exceeds the largest
 *  real AutoRecon XML observed (~5 MB for full TCP scan with NSE) while
 *  blocking ratio-1000x deflate bombs that target a 50 MB upload bucket. */
const MAX_REQUIRED_ENTRY_SIZE = 16 * 1024 * 1024;

/** Aggregate decompressed-size budget across ALL entries read from the zip.
 *  The 50 MB upload cap bounds COMPRESSED size; deflate ratios of 100x-1000x
 *  are routine over repetitive data, so a 50 MB zip can yield multi-GB of
 *  heap. 200 MB aggregate is far above any legitimate AutoRecon output and
 *  far below a Node default heap (~1.5 GB). */
const MAX_TOTAL_DECOMPRESSED = 200 * 1024 * 1024;

/**
 * Read a zip entry as a UTF-8 string with both per-entry and aggregate size
 * caps. Uses the public jszip `nodeStream("nodebuffer")` API (avoids the
 * brittle private `_data.uncompressedSize` field — see ME-02 in REVIEW.md).
 *
 * Bytes are accumulated chunk-by-chunk; once either limit is hit the stream
 * is destroyed and the promise rejects, so we never materialize the full
 * payload in memory beyond the limit + one in-flight chunk (~64 KB).
 *
 * Returns the decoded string AND mutates `budget.used` so the caller can
 * carry the running aggregate across multiple reads.
 */
async function readEntryAsString(
  entry: JSZip.JSZipObject,
  perEntryLimit: number,
  budget: { used: number },
): Promise<string> {
  const remainingAggregate = MAX_TOTAL_DECOMPRESSED - budget.used;
  if (remainingAggregate <= 0) {
    throw new Error(
      "AutoRecon zip decompresses to more than 200 MB. " +
        "Possible zip bomb; rejected.",
    );
  }
  const effectiveLimit = Math.min(perEntryLimit, remainingAggregate);

  return await new Promise<string>((resolve, reject) => {
    // jszip's `nodeStream` is typed as the legacy NodeJS.ReadableStream
    // interface (no `destroy`), but at runtime returns a Readable. We cast
    // through Readable so we can abort decompression on overflow.
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
        // Destroy aborts decompression — heap stops growing immediately.
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
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    stream.on("error", (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });
  });
}

export async function importAutoRecon(
  buffer: ArrayBuffer,
  // zipFilename retained in the signature so future telemetry / error context
  // can include it; the importer itself doesn't need it for processing — the
  // route handler stores it in `engagements.raw_input` per D-14.
  _zipFilename: string,
): Promise<AutoReconResult> {
  const zip = await JSZip.loadAsync(buffer);

  // Aggregate decompressed-byte counter shared across every readEntryAsString
  // call below. Mutated in-place by the helper. See MAX_TOTAL_DECOMPRESSED.
  const budget = { used: 0 };

  // 1. Empty zip guard.
  if (Object.keys(zip.files).length === 0) {
    throw new Error("Zip contains no files.");
  }

  // 2. Flexible XML discovery (CD-05 / Pitfall 2 / Pitfall 5). We search by
  //    suffix so both nested (`<ip>/scans/xml/...`) and flat (`scans/xml/...`)
  //    layouts work without hardcoding a prefix. The match REQUIRES a
  //    `scans/` component up front — previously the find accepted bare
  //    `xml/_full_tcp_nmap.xml` only to be rejected 8 lines later by a
  //    redundant scans-check (ME-03 dead-code branch).
  const xmlEntry = Object.values(zip.files).find(
    (f) =>
      !f.dir &&
      (f.name.endsWith("/scans/xml/_full_tcp_nmap.xml") ||
        f.name === "scans/xml/_full_tcp_nmap.xml"),
  );

  if (!xmlEntry) {
    throw new Error(
      "Could not find scans/_full_tcp_nmap.xml in the uploaded zip. " +
        "Make sure you're zipping the results/<ip>/ folder.",
    );
  }

  // 3. Derive the scans/ base prefix by stripping `xml/_full_tcp_nmap.xml`.
  //    Always ends in `scans/` because the find above guarantees the suffix.
  //    e.g. "10.10.10.5/scans/xml/_full_tcp_nmap.xml" -> "10.10.10.5/scans/"
  //    e.g. "scans/xml/_full_tcp_nmap.xml"            -> "scans/"
  const scansBase = xmlEntry.name.replace(/xml\/_full_tcp_nmap\.xml$/, "");

  // 4. Parse XML using the existing Phase 2 parser (D-13 reuse). Wrap so
  //    parser errors are re-thrown with an AutoRecon-context prefix.
  //    The streaming reader enforces both a per-entry 16 MB cap and the
  //    aggregate 200 MB budget — required to defeat zip-bomb XML payloads
  //    that the 50 MB upload cap alone cannot block (HI-01, HI-02).
  const xmlString = await readEntryAsString(
    xmlEntry,
    MAX_REQUIRED_ENTRY_SIZE,
    budget,
  );
  let scan: ParsedScan;
  try {
    scan = parseNmapXml(xmlString);
  } catch (err) {
    throw new Error(
      "AutoRecon XML could not be parsed: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  // Override source — this scan came from an AutoRecon zip, not a paste.
  // Cast through the union; the field is statically the union, runtime is fine.
  (scan as { source: ParsedScan["source"] }).source = "autorecon";

  // 5. Per-port service file extraction (D-04 / D-05). Two layout modes:
  //    a) Port-dirs (default): files under `{scansBase}tcp{port}/...`
  //    b) No-port-dirs: files directly in `{scansBase}` matching `tcp_{port}_...`
  const arFiles = new Map<number, ArFile[]>();

  for (const port of scan.ports) {
    const portDirPrefix = `${scansBase}tcp${port.port}/`;
    const flatPrefix = `${scansBase}tcp_${port.port}_`;

    const matches = Object.values(zip.files).filter(
      (f) =>
        !f.dir &&
        (f.name.startsWith(portDirPrefix) || f.name.startsWith(flatPrefix)),
    );

    if (matches.length === 0) continue;

    const files: ArFile[] = [];
    for (const entry of matches) {
      // Per-AR-file safety limit (T-05-04 defense-in-depth). The streaming
      // reader aborts decompression once the per-entry budget is hit, so a
      // single huge file cannot exhaust heap mid-read. D-10 says missing
      // service files are tolerated, so an oversized entry is SKIPPED
      // (caught below) — it does not abort the import. ME-02: no longer
      // touches the private `_data.uncompressedSize` field.
      let content: string;
      try {
        content = await readEntryAsString(entry, MAX_FILE_SIZE, budget);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Aggregate-budget failure is fatal (zip-bomb in the small); per-entry
        // overflow is a soft skip per D-10.
        if (msg.includes("more than 200 MB")) {
          throw err;
        }
        continue;
      }

      // Strip the directory prefix to get just the basename for display.
      const lastSlash = entry.name.lastIndexOf("/");
      const filename =
        lastSlash >= 0 ? entry.name.slice(lastSlash + 1) : entry.name;

      files.push({ filename, content });
    }

    if (files.length > 0) {
      arFiles.set(port.port, files);
    }
  }

  // 6. Manual commands parsing (D-06 / D-07 / Pitfall 1).
  //    Optional file (D-10). When present, parse `[*] service on proto/port`
  //    sections, then `    [-] tool` sub-headers, then indented command lines.
  const arCommands = new Map<number, ArCommand[]>();
  const manualCommandsPath = `${scansBase}_manual_commands.txt`;
  const manualCommandsEntry = zip.file(manualCommandsPath);

  if (manualCommandsEntry) {
    // 16 MB cap: `_manual_commands.txt` is plain text — typical files are
    // a few KB. A bombed manual_commands.txt was previously unbounded
    // (HI-02). Aggregate budget also enforced via `budget`.
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
          // Only warn once per dropped port — not once per command.
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

      // Command line: indented + non-empty after trim, AND we're inside a
      // section with a known port and label.
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

  return { scan, arFiles, arCommands };
}
