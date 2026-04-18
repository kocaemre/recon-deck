/**
 * Engagement detail page — RSC (Phase 4, Plan 04-05, Task 3).
 *
 * The main working screen where pentesters interact with their scans.
 * Assembles data from the database (getById) and knowledge base
 * (loadKnowledgeBase + matchPort), interpolates command templates
 * server-side, and renders the full engagement view.
 *
 * This is where the three backend modules (DB, KB, Parser) converge
 * with the UI components from Plans 04-04 and 04-05.
 *
 * Design refs: D-05 (KB in-memory index), D-08 (server-side interpolation),
 * D-12 (header bar), UI-01 (port cards), CD-05 (warnings_json).
 */

import { notFound } from "next/navigation";
import path from "node:path";
import { db, getById } from "@/lib/db";
import { loadKnowledgeBase, matchPort } from "@/lib/kb";
import { EngagementHeader } from "@/components/EngagementHeader";
import { EngagementResetExpand } from "@/components/EngagementResetExpand";
import { EngagementContextBridge } from "@/components/EngagementContextBridge";
import { KeyboardShortcutHandler } from "@/components/KeyboardShortcutHandler";
import { WarningBanner } from "@/components/WarningBanner";
import { PortCard } from "@/components/PortCard";
import { HostScriptCard } from "@/components/HostScriptCard";
import { parseNmapXml } from "@/lib/parser/nmap-xml";
import type { ScriptElem, ScriptTable } from "@/lib/parser/types";

// Load KB once at module level (O(1) in-memory index, per D-05)
const kb = loadKnowledgeBase({
  shippedPortsDir: path.join(process.cwd(), "knowledge", "ports"),
  shippedDefaultFile: path.join(process.cwd(), "knowledge", "default.yaml"),
  userDir: process.env.RECON_KB_USER_DIR ?? undefined,
});

/**
 * Interpolate command template placeholders with engagement target values.
 * Per KB-09: commands contain {IP}, {PORT}, {HOST} placeholders.
 * Per D-08: interpolation happens server-side — client receives rendered strings.
 */
function interpolateCommand(
  template: string,
  ip: string,
  port: number,
  hostname: string | null,
): string {
  return template
    .replace(/\{IP\}/g, ip)
    .replace(/\{PORT\}/g, String(port))
    .replace(/\{HOST\}/g, hostname ?? ip);
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EngagementPage({ params }: PageProps) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);

  if (isNaN(id)) {
    notFound();
  }

  const engagement = getById(db, id);
  if (!engagement) {
    notFound();
  }

  // Parse warnings from stored JSON (warnings_json column — CD-05)
  let warnings: string[] = [];
  try {
    warnings = JSON.parse(engagement.warnings_json);
  } catch {
    warnings = [];
  }

  // Sort ports by port number ascending
  const sortedPorts = [...engagement.ports].sort((a, b) => a.port - b.port);

  // Compute global check stats across all ports
  let totalChecks = 0;
  let doneChecks = 0;

  // UI-11 / PARSE-03: re-parse engagement.raw_input to surface structured
  // <elem>/<table> data on NSE script output. We don't persist structured
  // fields in the DB (re-parse is sub-50ms for typical scans — see Pattern 6
  // Open Question / Pitfall 5). This adds zero migration cost.
  //
  // Failure modes that fall through silently to no-structured rendering:
  //   - source === "nmap-text" (paste, no XML to re-parse)
  //   - sample engagement (raw_input is a marker string, not real XML)
  //   - corrupted raw_input (extremely rare; parser throws → caught here)
  //
  // In every fallthrough, StructuredScriptOutput renders the existing
  // <pre>{output}</pre> branch — UX matches today's behavior exactly.
  const structuredByKey = new Map<string, Array<ScriptElem | ScriptTable>>();
  if (engagement.source === "nmap-xml" || engagement.source === "autorecon") {
    try {
      const reparsed = parseNmapXml(engagement.raw_input);
      for (const p of reparsed.ports) {
        for (const s of p.scripts) {
          if (s.structured && s.structured.length > 0) {
            structuredByKey.set(`${p.port}:${s.id}`, s.structured);
          }
        }
      }
      for (const hs of reparsed.hostScripts) {
        if (hs.structured && hs.structured.length > 0) {
          structuredByKey.set(`host:${hs.id}`, hs.structured);
        }
      }
    } catch {
      // Pitfall 5: parse failure is non-fatal — fallback to no-structured.
      // No console.error; not all engagements have re-parseable raw_input
      // (e.g. autorecon imports may store raw_input as filename, not XML).
    }
  }

  // Pre-compute KB data for each port
  const portData = sortedPorts.map((p) => {
    const kbEntry = matchPort(kb, p.port, p.service ?? undefined);

    // Interpolate commands (D-08, KB-09)
    const kbCommands = kbEntry.commands.map((cmd) => ({
      label: cmd.label,
      command: interpolateCommand(
        cmd.template,
        engagement.target_ip,
        p.port,
        engagement.target_hostname,
      ),
    }));

    // Build KB checks array
    const kbChecks = kbEntry.checks.map((c) => ({
      key: c.key,
      label: c.label,
    }));

    // Build KB resources array
    const kbResources = kbEntry.resources.map((r) => ({
      title: r.title,
      url: r.url,
    }));

    // Accumulate check counts
    const checkMap = new Map(
      p.checks.map((c) => [c.check_key, c.checked]),
    );
    totalChecks += kbChecks.length;
    doneChecks += kbChecks.filter(
      (c) => checkMap.get(c.key) === true,
    ).length;

    // Phase 5 D-12: separate NSE scripts (source='nmap') from AutoRecon
    // per-port service file outputs (source='autorecon'). The NSE Script
    // Output section in PortCard only receives nseScripts — the AR file
    // outputs go to the new AutoRecon Files section as { filename, content }.
    const nseScripts = p.scripts.filter(
      (s) => !s.source || s.source === "nmap",
    );
    const arFileScripts = p.scripts.filter((s) => s.source === "autorecon");

    // Merge re-parsed structured data onto NSE scripts. The DB-loaded scripts
    // don't carry `structured` — we add it here from the re-parse map so PortCard
    // can pass it through to StructuredScriptOutput.
    const enrichedNseScripts = nseScripts.map((s) => {
      const structured = structuredByKey.get(`${p.port}:${s.script_id}`);
      return structured ? { ...s, structured } : s;
    });

    // Shape AR file scripts into the PortCard arFiles prop contract.
    // script_id holds the AR filename; output holds the full file contents (D-05).
    const arFiles = arFileScripts.map((s) => ({
      filename: s.script_id,
      content: s.output,
    }));

    // Phase 5 D-08: AutoRecon commands interpolate {IP}/{PORT}/{HOST} the
    // same way KB commands do — server-side so the client receives rendered
    // strings. p.commands comes from port_commands (CD-01 resolution).
    const arCommands = p.commands.map((cmd) => ({
      label: cmd.label,
      command: interpolateCommand(
        cmd.template,
        engagement.target_ip,
        p.port,
        engagement.target_hostname,
      ),
    }));

    return {
      port: p,
      nseScripts: enrichedNseScripts,
      kbCommands,
      kbChecks,
      kbResources,
      risk: kbEntry.risk,
      arFiles,
      arCommands,
    };
  });

  // Enrich hostScripts with structured data the same way as port scripts.
  const enrichedHostScripts = engagement.hostScripts.map((hs) => {
    const structured = structuredByKey.get(`host:${hs.script_id}`);
    return structured ? { ...hs, structured } : hs;
  });

  // UI-08 palette context — narrow projection of portData for the global
  // CommandPalette. Sorted (portData is already sorted ascending by port number).
  const paletteContextPorts = portData.map(({ port: p }) => ({
    id: p.id,
    port: p.port,
    service: p.service,
  }));

  // UI-08 palette context — flatten KB commands across all ports for "Copy
  // command" items. Each item carries its portId so the palette can scope
  // labels (and a future v1.1 visual could group by port).
  const paletteContextCommands = portData.flatMap(({ port: p, kbCommands }) =>
    kbCommands.map((cmd) => ({
      portId: p.id,
      label: cmd.label,
      command: cmd.command,
    })),
  );

  // UI-07 `x` shortcut — checks-by-port map for the keyboard handler. Each
  // entry carries the current `checked` state (read from the DB-loaded checks).
  const checksByPort = new Map<
    number,
    Array<{ key: string; label: string; checked: boolean }>
  >();
  for (const { port: p, kbChecks } of portData) {
    const checkMap = new Map(p.checks.map((c) => [c.check_key, c.checked]));
    checksByPort.set(
      p.id,
      kbChecks.map((c) => ({
        key: c.key,
        label: c.label,
        checked: checkMap.get(c.key) === true,
      })),
    );
  }

  return (
    <div className="flex flex-col">
      {/* Reset port expand + active-port + engagement-context state on navigation (WR-03 + Pitfall #4) */}
      <EngagementResetExpand engagementId={engagement.id} />

      {/* Bridge RSC-computed data into zustand for the global CommandPalette (Pitfall #3) */}
      <EngagementContextBridge
        engagementId={engagement.id}
        ports={paletteContextPorts}
        kbCommands={paletteContextCommands}
      />

      {/* Keyboard shortcuts — engagement-scoped j/k/x/c + global Cmd+K/?/`/` (UI-07) */}
      <KeyboardShortcutHandler
        engagementId={engagement.id}
        checksByPort={checksByPort}
      />

      {/* Engagement header with editable target, progress — D-12, INPUT-03, UI-05 */}
      <EngagementHeader
        engagementId={engagement.id}
        name={engagement.name}
        targetIp={engagement.target_ip}
        targetHostname={engagement.target_hostname}
        portCount={sortedPorts.length}
        totalChecks={totalChecks}
        doneChecks={doneChecks}
      />

      {/* Warning banner — D-04, D-13 */}
      {warnings.length > 0 && (
        <div className="px-6 pt-4">
          <WarningBanner warnings={warnings} />
        </div>
      )}

      {/* Port cards — UI-01, sorted by port number */}
      <div className="space-y-4 p-6">
        {/* Host scripts — distinct purple-bordered card per PARSE-03 success criterion 5 */}
        <HostScriptCard hostScripts={enrichedHostScripts} />

        {sortedPorts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No open ports found in this scan.
          </p>
        ) : (
          portData.map(
            ({
              port: p,
              nseScripts,
              kbCommands,
              kbChecks,
              kbResources,
              risk,
              arFiles,
              arCommands,
            }) => (
              <PortCard
                key={p.id}
                engagementId={engagement.id}
                portId={p.id}
                port={p.port}
                protocol={p.protocol}
                state={p.state}
                service={p.service}
                product={p.product}
                version={p.version}
                scripts={nseScripts}
                checks={p.checks}
                notes={p.notes}
                kbCommands={kbCommands}
                kbChecks={kbChecks}
                kbResources={kbResources}
                risk={risk}
                arFiles={arFiles}
                arCommands={arCommands}
              />
            ),
          )
        )}
      </div>
    </div>
  );
}
