import "server-only";

/**
 * Findings CSV export (P1-H).
 *
 * Flat CSV with one row per finding. Columns are stable so spreadsheet
 * pivots / triage workflows don't break across exports. The file is
 * RFC-4180 compliant: CRLF line endings, double-quote field wrapping
 * when needed, embedded `"` escaped as `""`.
 *
 * Columns (ordered): severity, title, host, port, protocol, service,
 * cve, description, created_at.
 *
 * Pure string generation — no DB calls, no network. Engagement-level
 * findings (port_id = null) emit empty `host`/`port`/`protocol`/`service`
 * cells so they sort cleanly in spreadsheet apps.
 */

import type { EngagementViewModel } from "./view-model";

/** Severity render order — alphabetical inside CSV stays consistent across exports. */
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const COLUMNS = [
  "severity",
  "title",
  "host",
  "port",
  "protocol",
  "service",
  "cve",
  "description",
  "created_at",
] as const;

/**
 * Escape one CSV field per RFC 4180 §2.6/§2.7. Wraps in double-quotes
 * when the value contains a comma, double-quote, CR, or LF; embedded
 * double-quotes are doubled. Other values pass through verbatim.
 */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function generateFindingsCsv(vm: EngagementViewModel): string {
  // Map ports to their host info for the host/port columns.
  const portIndex = new Map<
    number,
    {
      port: number;
      protocol: string;
      service: string | null;
      hostIp: string;
      hostHostname: string | null;
    }
  >();
  for (const hvm of vm.hosts) {
    for (const pvm of hvm.ports) {
      portIndex.set(pvm.port.id, {
        port: pvm.port.port,
        protocol: pvm.port.protocol,
        service: pvm.port.service,
        hostIp: hvm.host.ip,
        hostHostname: hvm.host.hostname,
      });
    }
  }
  // Fall back to legacy flat ports for single-host engagements that don't
  // populate vm.hosts (defensive — shouldn't happen post-PR-3).
  if (portIndex.size === 0) {
    for (const pvm of vm.ports) {
      portIndex.set(pvm.port.id, {
        port: pvm.port.port,
        protocol: pvm.port.protocol,
        service: pvm.port.service,
        hostIp: vm.engagement.target_ip,
        hostHostname: vm.engagement.target_hostname,
      });
    }
  }

  const sortedFindings = [...vm.engagement.findings].sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] ?? 99;
    const sb = SEVERITY_RANK[b.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.title.localeCompare(b.title);
  });

  const rows: string[][] = [
    [...COLUMNS],
  ];

  for (const f of sortedFindings) {
    const portInfo = f.port_id != null ? portIndex.get(f.port_id) : null;
    const hostLabel = portInfo
      ? portInfo.hostHostname
        ? `${portInfo.hostHostname} (${portInfo.hostIp})`
        : portInfo.hostIp
      : "";
    rows.push([
      f.severity,
      f.title,
      hostLabel,
      portInfo ? String(portInfo.port) : "",
      portInfo?.protocol ?? "",
      portInfo?.service ?? "",
      f.cve ?? "",
      f.description ?? "",
      f.created_at,
    ]);
  }

  // RFC 4180 §2.1: line endings are CRLF.
  return rows.map((cols) => cols.map(csvField).join(",")).join("\r\n") + "\r\n";
}
