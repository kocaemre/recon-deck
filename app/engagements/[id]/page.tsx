/**
 * Engagement detail page — Modern IDE redesign (heatmap layout).
 *
 * Same data assembly as before (DB + KB + parser), but the rendering surface
 * is now an attack-surface heatmap grid + selected-port detail pane instead of
 * N vertical collapsible cards. The `/report` route retains the old vertical
 * pattern for print/PDF output.
 */

import { notFound } from "next/navigation";
import path from "node:path";
import {
  db,
  getById,
  matchUserCommands,
  getWordlistOverridesMap,
  listScanHistory,
} from "@/lib/db";
import { loadKnowledgeBase, matchPort } from "@/lib/kb";
import { interpolateWordlists } from "@/lib/kb/wordlists";
import { EngagementHeader } from "@/components/EngagementHeader";
import { EngagementResetExpand } from "@/components/EngagementResetExpand";
import { EngagementContextBridge } from "@/components/EngagementContextBridge";
import { KeyboardShortcutHandler } from "@/components/KeyboardShortcutHandler";
import { WarningBanner } from "@/components/WarningBanner";
import { EngagementHeatmap } from "@/components/EngagementHeatmap";
import { EngagementExtras } from "@/components/EngagementExtras";
import { FindingsPanel } from "@/components/FindingsPanel";
import { HostScriptCard } from "@/components/HostScriptCard";
import { parseNmapXml } from "@/lib/parser/nmap-xml";
import { parseNmapText } from "@/lib/parser/nmap-text";
import type {
  ScriptElem,
  ScriptTable,
  ParsedScan,
} from "@/lib/parser/types";

const kb = loadKnowledgeBase({
  shippedPortsDir: path.join(process.cwd(), "knowledge", "ports"),
  shippedDefaultFile: path.join(process.cwd(), "knowledge", "default.yaml"),
  userDir: process.env.RECON_KB_USER_DIR ?? undefined,
});

function interpolateCommand(
  template: string,
  ip: string,
  port: number,
  hostname: string | null,
  wordlistOverrides?: Record<string, string>,
): string {
  // P1-E: resolve {WORDLIST_*} first against operator overrides + shipped
  // defaults, then standard {IP}/{PORT}/{HOST}.
  const withWordlists = interpolateWordlists(template, wordlistOverrides);
  return withWordlists
    .replace(/\{IP\}/g, ip)
    .replace(/\{PORT\}/g, String(port))
    .replace(/\{HOST\}/g, hostname ?? ip);
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ host?: string }>;
}

export default async function EngagementPage({
  params,
  searchParams,
}: PageProps) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const engagement = getById(db, id);
  if (!engagement) notFound();

  // P1-E: read once per render so every command (KB, AR, user) gets the
  // same {WORDLIST_*} resolution.
  const wordlistOverrides = getWordlistOverridesMap(db);

  // P1-F PR 4: resolve the active host from `?host=<id>` search param.
  // Fallback chain: explicit param → primary host → first host (defensive).
  // Single-host engagements ignore the param entirely; the active host is
  // simply the only host. Multi-host engagements use the param to drive the
  // header chip selector and filter the heatmap.
  const { host: hostParam } = await searchParams;
  const requestedHostId = hostParam ? parseInt(hostParam, 10) : NaN;
  const activeHost =
    engagement.hosts.find((h) => h.id === requestedHostId) ??
    engagement.hosts.find((h) => h.is_primary) ??
    engagement.hosts[0];
  const activeHostId = activeHost?.id ?? null;
  const isMultiHost = engagement.hosts.length > 1;

  let warnings: string[] = [];
  try {
    warnings = JSON.parse(engagement.warnings_json);
  } catch {
    warnings = [];
  }

  // P1-F PR 4: filter ports to the active host. host_id was backfilled by
  // migration 0007 so every port has one; the `?? null` fallback only
  // triggers if a future code path forgets to set it.
  const sortedPorts = [...engagement.ports]
    .filter((p) => activeHostId === null || p.host_id === activeHostId)
    .sort((a, b) => a.port - b.port);

  // P1-G PR 2: scan history drives port lifecycle chips. With a single scan
  // (scanHistory.length === 1) every port is just "current"; with multiple
  // scans we surface "new" / "closed" badges on the heatmap so re-imports
  // are legible at a glance.
  const scanHistory = listScanHistory(db, engagement.id);
  const latestScanId = scanHistory[0]?.id ?? null;
  const hasMultipleScans = scanHistory.length > 1;

  let totalChecks = 0;
  let doneChecks = 0;

  // UI-11 / PARSE-03 + v2 enrichment: re-parse raw_input to surface
  // structured NSE elem/table data AND v2 fields (cpe, reason, traceroute,
  // os.matches, prescript/postscript, scanner, runstats, extraports). For
  // AutoRecon imports raw_input is just the zip filename, so re-parse is
  // skipped — v2 fields will be empty/undefined (importer fills extraports
  // for nmap-text by accumulating "Not shown" lines, see nmap-text.ts).
  const structuredByKey = new Map<string, Array<ScriptElem | ScriptTable>>();
  const reparsedByPort = new Map<number, { reason?: string; cpe?: string[] }>();
  let reparsed: ParsedScan | undefined;
  if (engagement.source === "nmap-xml") {
    try {
      reparsed = parseNmapXml(engagement.raw_input);
    } catch {
      /* non-fatal */
    }
  } else if (engagement.source === "nmap-text") {
    try {
      reparsed = parseNmapText(engagement.raw_input);
    } catch {
      /* non-fatal */
    }
  } else if (engagement.source === "autorecon") {
    // AR import retains the extracted full-TCP XML in engagement.engagementArtifacts
    // (now exposed by getById). Re-parse it so the engagement page surfaces v2
    // fields (cpe, reason, traceroute, OS classes, scanner, runstats, extraports).
    const xmlRow = engagement.engagementArtifacts.find(
      (a) =>
        a.source === "autorecon-service-nmap-xml" &&
        a.script_id === "_full_tcp_nmap.xml",
    );
    if (xmlRow) {
      try {
        reparsed = parseNmapXml(xmlRow.output);
      } catch {
        /* non-fatal */
      }
    }
  }
  if (reparsed) {
    for (const p of reparsed.ports) {
      for (const s of p.scripts) {
        if (s.structured && s.structured.length > 0) {
          structuredByKey.set(`${p.port}:${s.id}`, s.structured);
        }
      }
      const meta: { reason?: string; cpe?: string[] } = {};
      if (p.reason) meta.reason = p.reason;
      if (p.cpe && p.cpe.length > 0) meta.cpe = p.cpe;
      if (meta.reason || meta.cpe) reparsedByPort.set(p.port, meta);
    }
    for (const hs of reparsed.hostScripts) {
      if (hs.structured && hs.structured.length > 0) {
        structuredByKey.set(`host:${hs.id}`, hs.structured);
      }
    }
  }

  // v2: engagement-level artifacts now come straight off FullEngagement
  // (getById was extended to expose them).
  const artifactRows = engagement.engagementArtifacts.filter((s) =>
    s.source.startsWith("autorecon-"),
  );

  type ArKind =
    | "loot"
    | "report"
    | "screenshot"
    | "patterns"
    | "errors"
    | "commands"
    | "exploit"
    | "service-nmap-xml";
  const extrasArtifacts = artifactRows
    .filter(
      // Hide the retained source XML — it was stored only so the engagement
      // page can re-parse for v2 fields, not to surface as a downloadable.
      (r) =>
        !(
          r.source === "autorecon-service-nmap-xml" &&
          r.script_id === "_full_tcp_nmap.xml"
        ),
    )
    .map((r) => {
      const kind = r.source.replace(/^autorecon-/, "") as ArKind;
      return {
        kind,
        filename: r.script_id,
        content: r.output,
        encoding: (kind === "screenshot" ? "base64" : "utf8") as
          | "utf8"
          | "base64",
      };
    });

  const riskCounts: Partial<
    Record<"critical" | "high" | "medium" | "low" | "info", number>
  > = {};

  // Bucket per-port evidence rows. port_id=null evidence stays on the
  // engagement level (rendered separately or surfaced via the future
  // engagement-level evidence panel).
  const evidenceByPortId = new Map<number, typeof engagement.evidence>();
  for (const ev of engagement.evidence) {
    if (ev.port_id !== null) {
      const list = evidenceByPortId.get(ev.port_id) ?? [];
      list.push(ev);
      evidenceByPortId.set(ev.port_id, list);
    }
  }

  // Migration 0009: target_ip / target_hostname columns dropped. Identity
  // sourced from `hosts.is_primary = 1` (always present after migration
  // 0007). `activeHost` is set above and falls through to the primary host
  // when the URL doesn't pin a specific one.
  const targetIp = activeHost?.ip ?? engagement.hosts[0].ip;
  const targetHostname = activeHost?.hostname ?? engagement.hosts[0].hostname;

  const portData = sortedPorts.map((p) => {
    const kbEntry = matchPort(kb, p.port, p.service ?? undefined);

    const kbCommands = kbEntry.commands.map((cmd) => ({
      label: cmd.label,
      command: interpolateCommand(
        cmd.template,
        targetIp,
        p.port,
        targetHostname,
        wordlistOverrides,
      ),
    }));

    // v2/P0-D: merge user-defined snippets that match this (service, port).
    const userMatches = matchUserCommands(db, p.service ?? null, p.port);
    const userCommands = userMatches.map((u) => ({
      label: u.label,
      command: interpolateCommand(
        u.template,
        targetIp,
        p.port,
        targetHostname,
        wordlistOverrides,
      ),
    }));
    const kbChecks = kbEntry.checks.map((c) => ({ key: c.key, label: c.label }));
    const kbResources = kbEntry.resources.map((r) => ({
      title: r.title,
      url: r.url,
    }));

    // P2 follow-up: KB known_vulns auto-match. Each KB entry can list
    // version-specific advisories (e.g. "Apache 2.4.49" → CVE-2021-41773).
    // Surface only the entries whose `match` string is a case-insensitive
    // substring of the port's product+version line — substrings without a
    // strong anchor ("Apache" alone) would over-match, so the KB authors
    // are expected to scope their `match` strings tightly.
    const productVersion = [p.product, p.version]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const knownVulns = (kbEntry.known_vulns ?? [])
      .filter((v) =>
        productVersion.length > 0 &&
        productVersion.includes(v.match.toLowerCase()),
      )
      .map((v) => ({ match: v.match, note: v.note, link: v.link }));

    const checkMap = new Map(p.checks.map((c) => [c.check_key, c.checked]));
    totalChecks += kbChecks.length;
    doneChecks += kbChecks.filter((c) => checkMap.get(c.key) === true).length;

    const nseScripts = p.scripts.filter(
      (s) => !s.source || s.source === "nmap",
    );
    const arFileScripts = p.scripts.filter((s) => s.source === "autorecon");

    const enrichedNseScripts = nseScripts.map((s) => {
      const structured = structuredByKey.get(`${p.port}:${s.script_id}`);
      return structured ? { ...s, structured } : s;
    });

    const arFiles = arFileScripts.map((s) => ({
      filename: s.script_id,
      content: s.output,
    }));

    const arCommands = p.commands.map((cmd) => ({
      label: cmd.label,
      command: interpolateCommand(
        cmd.template,
        targetIp,
        p.port,
        targetHostname,
        wordlistOverrides,
      ),
    }));

    const risk = kbEntry.risk as
      | "critical"
      | "high"
      | "medium"
      | "low"
      | "info";
    riskCounts[risk] = (riskCounts[risk] ?? 0) + 1;

    const portDone = kbChecks.filter((c) => checkMap.get(c.key) === true)
      .length;

    const meta = reparsedByPort.get(p.port);

    return {
      id: p.id,
      port: p.port,
      protocol: p.protocol,
      service: p.service,
      product: p.product,
      version: p.version,
      risk,
      total: kbChecks.length,
      done: portDone,
      scripts: enrichedNseScripts,
      checks: p.checks,
      notes: p.notes,
      kbCommands,
      kbChecks,
      kbResources,
      knownVulns,
      arFiles,
      arCommands,
      userCommands,
      reason: meta?.reason,
      cpe: meta?.cpe,
      evidence: evidenceByPortId.get(p.id) ?? [],
      // P1-G PR 2: port lifecycle relative to the latest scan. Only
      // meaningful when the engagement has been re-imported at least
      // once (hasMultipleScans). Single-scan engagements report `null`
      // so the heatmap renders the legacy chip-free tile.
      isClosed: p.closed_at_scan_id != null,
      isNew:
        hasMultipleScans &&
        latestScanId !== null &&
        p.first_seen_scan_id === latestScanId,
      // P2: searchsploit query. Prefer `<product> <version>` (most
      // specific), fall back to `<product>` alone, then `<service>`,
      // then nothing — empty/undefined suppresses the section.
      exploitQuery:
        p.product && p.version
          ? `${p.product} ${p.version}`
          : (p.product || p.service || "").trim() || undefined,
    };
  });

  // Migration 0010: host scripts now carry host_id, so multi-host
  // engagements scope the Host-Level Findings card to whichever host
  // the operator has activated via `?host=<id>`. Single-host
  // engagements (and legacy rows without host_id from the historical
  // multi-host conflation) fall through to the unfiltered list, which
  // matches the pre-migration behavior.
  const enrichedHostScripts = engagement.hostScripts
    .filter(
      (hs) =>
        activeHostId === null ||
        hs.host_id === null ||
        hs.host_id === activeHostId,
    )
    .map((hs) => {
      const structured = structuredByKey.get(`host:${hs.script_id}`);
      return structured ? { ...hs, structured } : hs;
    });

  const paletteContextPorts = portData.map((p) => ({
    id: p.id,
    port: p.port,
    service: p.service,
    risk: p.risk,
  }));
  const paletteContextCommands = portData.flatMap((p) =>
    p.kbCommands.map((cmd) => ({
      portId: p.id,
      label: cmd.label,
      command: cmd.command,
    })),
  );

  const checksByPort = new Map<
    number,
    Array<{ key: string; label: string; checked: boolean }>
  >();
  for (const p of portData) {
    const checkMap = new Map(p.checks.map((c) => [c.check_key, c.checked]));
    checksByPort.set(
      p.id,
      p.kbChecks.map((c) => ({
        key: c.key,
        label: c.label,
        checked: checkMap.get(c.key) === true,
      })),
    );
  }

  return (
    <div className="flex flex-col">
      <EngagementResetExpand engagementId={engagement.id} />

      <EngagementContextBridge
        engagementId={engagement.id}
        ports={paletteContextPorts}
        kbCommands={paletteContextCommands}
        hosts={engagement.hosts.map((h) => ({
          id: h.id,
          ip: h.ip,
          hostname: h.hostname,
          is_primary: h.is_primary,
        }))}
        activeHostId={activeHostId}
      />

      <KeyboardShortcutHandler
        engagementId={engagement.id}
        checksByPort={checksByPort}
      />

      <EngagementHeader
        engagementId={engagement.id}
        name={engagement.name}
        source={engagement.source}
        createdAt={engagement.created_at}
        targetIp={targetIp}
        targetHostname={targetHostname}
        portCount={sortedPorts.length}
        totalChecks={totalChecks}
        doneChecks={doneChecks}
        riskCounts={riskCounts}
        hosts={engagement.hosts.map((h) => ({
          id: h.id,
          ip: h.ip,
          hostname: h.hostname,
          is_primary: h.is_primary,
          // Active-host OS chip is sourced here. Falls back to the
          // engagement-level os_name/accuracy on the primary host so
          // single-host engagements that never wrote per-host OS still
          // surface something.
          os_name: h.os_name ?? (h.is_primary ? engagement.os_name : null),
          os_accuracy:
            h.os_accuracy ?? (h.is_primary ? engagement.os_accuracy : null),
        }))}
        activeHostId={activeHostId}
        scanCount={scanHistory.length}
        scanner={reparsed?.scanner}
        extraPorts={reparsed?.extraPorts}
        finishedAt={reparsed?.runstats?.finishedAt}
        addresses={reparsed?.target.addresses}
        hostnames={reparsed?.target.hostnames}
      />

      {warnings.length > 0 && (
        <div className="px-6 pt-4">
          <WarningBanner warnings={warnings} />
        </div>
      )}

      {/* Host scripts — retained purple-bordered card above heatmap */}
      {enrichedHostScripts.length > 0 && (
        <div className="px-6 pt-4">
          <HostScriptCard hostScripts={enrichedHostScripts} />
        </div>
      )}

      <EngagementHeatmap
        engagementId={engagement.id}
        ports={portData}
        showAddPort
        activeHostId={activeHostId}
      />

      <FindingsPanel
        engagementId={engagement.id}
        findings={engagement.findings}
        ports={engagement.ports.map((p) => {
          const host = engagement.hosts.find((h) => h.id === p.host_id);
          return {
            id: p.id,
            port: p.port,
            protocol: p.protocol,
            service: p.service,
            hostIp: host?.ip ?? null,
            hostHostname: host?.hostname ?? null,
          };
        })}
        isMultiHost={isMultiHost}
      />

      <EngagementExtras
        os={reparsed?.os}
        traceroute={reparsed?.traceroute}
        preScripts={reparsed?.preScripts}
        postScripts={reparsed?.postScripts}
        artifacts={extrasArtifacts}
      />
    </div>
  );
}
