/**
 * Engagement detail page — Modern IDE redesign (heatmap layout).
 *
 * Same data assembly as before (DB + KB + parser), but the rendering surface
 * is now an attack-surface heatmap grid + selected-port detail pane instead of
 * N vertical collapsible cards. The `/report` route retains the old vertical
 * pattern for print/PDF output.
 */

import { notFound } from "next/navigation";
import {
  db,
  getById,
  touchEngagementVisit,
  matchUserCommands,
  getWordlistOverridesMap,
  listScanHistory,
  effectiveAppState,
  listFingerprintsForPorts,
} from "@/lib/db";
import { getKb, matchPort, applyConditionals } from "@/lib/kb";
import { interpolateWordlists } from "@/lib/kb/wordlists";
import { EngagementHeader } from "@/components/EngagementHeader";
import { EngagementResetExpand } from "@/components/EngagementResetExpand";
import { EngagementContextBridge } from "@/components/EngagementContextBridge";
import { KeyboardShortcutHandler } from "@/components/KeyboardShortcutHandler";
import { WarningBanner } from "@/components/WarningBanner";
import { EngagementHeatmap } from "@/components/EngagementHeatmap";
import { EngagementExtras } from "@/components/EngagementExtras";
import { FindingsPanel } from "@/components/FindingsPanel";
import { WriteupPanel } from "@/components/WriteupPanel";
import { HostScriptCard } from "@/components/HostScriptCard";
import { parseNmapXml } from "@/lib/parser/nmap-xml";
import { parseNmapText } from "@/lib/parser/nmap-text";
import type {
  ScriptElem,
  ScriptTable,
  ParsedScan,
} from "@/lib/parser/types";

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
  searchParams: Promise<{ host?: string; port?: string }>;
}

export default async function EngagementPage({
  params,
  searchParams,
}: PageProps) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const engagement = getById(db, id);
  const appCfg = effectiveAppState(db);
  if (!engagement) notFound();

  // v1.4.0 #15: stamp the visit so the landing-page banner can resume
  // back here. `?port=<id>` (used by the banner's deep-link target)
  // wins; otherwise we record null and let the heatmap pick its
  // default selection on the next render.
  const { port: portParam } = await searchParams;
  const portIdParsed = portParam ? parseInt(portParam, 10) : NaN;
  const validPortId =
    Number.isInteger(portIdParsed) &&
    engagement.ports.some((p) => p.id === portIdParsed)
      ? portIdParsed
      : null;
  touchEngagementVisit(db, engagement.id, validPortId);

  // KB resolves through the cached singleton — picks up user YAML
  // edits since the last fs.watch tick without a server restart.
  const kb = getKb();

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

  // v2.4.0 P4 (#29): bulk-load fingerprints for every port up front so
  // the resolver doesn't N+1 against port_fingerprints inside the
  // sortedPorts.map below.
  const fingerprintsByPort = listFingerprintsForPorts(
    db,
    sortedPorts.map((p) => p.id),
  );

  const portData = sortedPorts.map((p) => {
    const kbEntry = matchPort(kb, p.port, p.service ?? undefined);

    // v2.4.0 P4 (#29): apply context-aware conditional groups before
    // mapping to wire-format kbCommands/kbChecks. The resolver merges
    // matched conditionals into the baseline KB, leaving the existing
    // template-interpolation pipeline untouched. Provenance metadata
    // (which conditional fired, what it changed) lands in P5's UI.
    const fingerprintRows = fingerprintsByPort.get(p.id) ?? [];
    const resolveCtx = {
      port: {
        service: p.service,
        product: p.product,
        version: p.version,
      },
      scripts: p.scripts
        .filter((s) => !s.is_host_script)
        .map((s) => ({ id: s.script_id, output: s.output })),
      fingerprints: fingerprintRows.map((f) => ({
        source: f.source,
        type: f.type,
        value: f.value,
      })),
    };
    const resolved = applyConditionals(kbEntry, resolveCtx);

    const kbCommands = resolved.commands.map((cmd) => {
      // v2.4.0 P5 (#30): surface which conditionals modified this
      // command so PortDetailPane can render the "+id" provenance pill.
      // Replace contributors come first (the heavy hammer), appends
      // follow in declaration order to mirror how the template was
      // assembled.
      const ids = [
        ...(cmd.replacedBy ? [cmd.replacedBy] : []),
        ...cmd.appendedBy,
      ];
      return {
        label: cmd.label,
        command: interpolateCommand(
          cmd.template,
          targetIp,
          p.port,
          targetHostname,
          wordlistOverrides,
        ),
        ...(ids.length > 0 ? { conditionalIds: ids } : {}),
      };
    });

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
    // v2.4.0 P5 (#30): map resolved checks to wire format + reconcile
    // orphans. A check is orphan when an inactive conditional declared
    // its key AND the operator already toggled it (check_states row
    // exists) — preserves UX continuity when a signal drops out (e.g.
    // re-import lost the http-server-header line) without silently
    // discarding the operator's prior work.
    const checkKeysWithState = new Set(p.checks.map((c) => c.check_key));
    const seenCheckKeys = new Set<string>();
    const kbChecks: Array<{
      key: string;
      label: string;
      source: "baseline" | "conditional" | "orphan";
      conditionalId?: string;
    }> = [];
    for (const c of resolved.checks) {
      seenCheckKeys.add(c.key);
      kbChecks.push({
        key: c.key,
        label: c.label,
        source: c.source,
        ...(c.conditionalId ? { conditionalId: c.conditionalId } : {}),
      });
    }
    for (const inactive of resolved.inactive) {
      for (const orphanCheck of inactive.adds_checks) {
        if (!checkKeysWithState.has(orphanCheck.key)) continue;
        if (seenCheckKeys.has(orphanCheck.key)) continue;
        kbChecks.push({
          key: orphanCheck.key,
          label: orphanCheck.label,
          source: "orphan",
          conditionalId: inactive.id,
        });
        seenCheckKeys.add(orphanCheck.key);
      }
    }
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

    // v1.4.0 #10: surface KB-declared default credentials so the
    // operator can drop straight into a hydra brute attempt without
    // re-Googling vendor docs. KB authors put the most common pairs
    // first (e.g. "admin/admin" before "service/service").
    const defaultCreds = (kbEntry.default_creds ?? []).map((c) => ({
      username: c.username,
      password: c.password,
      notes: c.notes ?? null,
    }));

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
      defaultCreds,
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
      // v1.2.0 #11: surface the starred flag so the heatmap renders the
      // ★ glyph and lifts the tile to the top of its host group.
      starred: p.starred ?? false,
      // v1.4.0 #10: host label for the default-credentials hydra
      // command generator. Multi-host engagements pick the host the
      // port actually belongs to; single-host fall back to the
      // engagement's primary host.
      hostLabel: (() => {
        const host = engagement.hosts.find((h) => h.id === p.host_id);
        return host?.hostname ?? host?.ip ?? targetHostname ?? targetIp;
      })(),
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
        engagementName={engagement.name}
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
        findings={engagement.findings}
        portsByFindingId={(() => {
          // v1.4.0 #5: build a finding-id → port info lookup so the
          // Cmd+Shift+C shortcut can render `_Port:_ host:port/proto`
          // without re-walking the ports tree on every keypress.
          const m = new Map<
            number,
            {
              port: number;
              protocol: string;
              service: string | null;
              hostIp?: string | null;
              hostHostname?: string | null;
            }
          >();
          for (const f of engagement.findings) {
            if (f.port_id == null) continue;
            const p = engagement.ports.find((pp) => pp.id === f.port_id);
            if (!p) continue;
            const host = engagement.hosts.find((h) => h.id === p.host_id);
            m.set(f.id, {
              port: p.port,
              protocol: p.protocol,
              service: p.service,
              hostIp: host?.ip,
              hostHostname: host?.hostname,
            });
          }
          return m;
        })()}
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
        isSample={engagement.is_sample}
        localExportDir={appCfg.localExportDir}
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
        osLabel={(() => {
          const active =
            engagement.hosts.find((h) => h.id === activeHostId) ??
            engagement.hosts.find((h) => h.is_primary) ??
            engagement.hosts[0];
          return active?.os_name ?? engagement.os_name ?? null;
        })()}
        osAccuracy={(() => {
          const active =
            engagement.hosts.find((h) => h.id === activeHostId) ??
            engagement.hosts.find((h) => h.is_primary) ??
            engagement.hosts[0];
          return active?.os_accuracy ?? engagement.os_accuracy ?? null;
        })()}
      />

      <WriteupPanel
        engagementId={engagement.id}
        initialWriteup={engagement.writeup}
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
