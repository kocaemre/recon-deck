import "server-only";

/**
 * Parser barrel — public entry point for the nmap parser subsystem.
 *
 * Re-exports:
 *   - `ParsedScan`, `ParsedPort`, `ScriptOutput` types (the shared contract).
 *   - `parseNmapXml(raw: string): ParsedScan` — XML path (fast-xml-parser).
 *   - `parseNmapText(raw: string): ParsedScan` — `-oN` text path (regex).
 *   - `parseAny(raw: string): ParsedScan` — D-11 format dispatcher: looks at
 *     the first non-whitespace characters of the input and routes XML-prologued
 *     payloads (`<?xml ...?>`) to the XML parser; everything else goes to the
 *     text parser.
 *
 * Consumers:
 *   - `app/api/scan/route.ts` (Phase 4) — POST handler calls `parseAny` on
 *     user-pasted input.
 *   - Phase 5 AutoRecon importer — calls `parseNmapXml` directly on
 *     `scans/_full_tcp_nmap.xml` contents (D-13).
 *
 * Server-only per ARCHITECTURE.md bundle strategy: fast-xml-parser is heavy, and
 * text parsing is gated by `import "server-only"` on both underlying modules.
 * Pulling this barrel from client code at build time is a Next.js compile
 * error — exactly what we want.
 */

export type { ParsedScan, ParsedPort, ScriptOutput } from "./types";
export { parseNmapXml } from "./nmap-xml";
export { parseNmapText } from "./nmap-text";

import type { ParsedScan } from "./types";
import { parseNmapXml } from "./nmap-xml";
import { parseNmapText } from "./nmap-text";

/**
 * D-11 format detection — look at the first non-whitespace characters.
 * Any input starting with `<?xml` (case-insensitive) is treated as XML;
 * everything else is treated as nmap `-oN` text output.
 *
 * Empty / whitespace-only input is rejected up front with INPUT-04 wording
 * (actionable, no stack frames) before either underlying parser is invoked —
 * this keeps the dispatcher responsible for the "which flavor of paste?"
 * error surface and avoids leaking XML-specific vs text-specific wording
 * when the user has actually pasted nothing at all.
 *
 * Warning wording note: the underlying parsers each have their own locked
 * empty-input error wording (`Empty input — paste your nmap -oX output...`
 * for XML, `Empty nmap output — paste the full scan result...` for text).
 * Neither is reachable from `parseAny` because we gate empty input before
 * dispatch; `parseAny`'s own error message is the one users see in the
 * paste-any UX.
 */
export function parseAny(raw: string): ParsedScan {
  // D-07 / INPUT-04: empty or whitespace-only input. Actionable message,
  // no stack frame syntax. TEST-02: /at Object\.|at new |\s+at / must not match.
  if (!raw || !raw.trim()) {
    throw new Error(
      "Empty input — paste your nmap scan output (either -oN text or -oX XML) and try again.",
    );
  }

  // D-11 format detection: sniff the first non-whitespace characters.
  // Case-insensitive so `<?XML` is still routed to the XML parser.
  const leading = raw.trimStart().slice(0, 5).toLowerCase();
  if (leading.startsWith("<?xml")) {
    return parseNmapXml(raw);
  }
  return parseNmapText(raw);
}
