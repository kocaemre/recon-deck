import "server-only";

/**
 * Shared findings enrichment for the Markdown / JSON / HTML exports.
 *
 * The CSV / SysReptor / PwnDoc formatters each resolve a finding's affected
 * host/port inline; this consolidates that logic so the three report-style
 * exports (which previously omitted findings entirely — a reporting-correctness
 * bug) render them consistently: severity-sorted, with the affected host/port
 * resolved from the view model.
 */

import type { EngagementViewModel } from "./view-model";

/** Severity render order — critical first. */
export const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface EnrichedFinding {
  id: number;
  severity: string;
  title: string;
  description: string | null;
  cve: string | null;
  createdAt: string;
  /** "hostname (ip)" or "ip" for a port-linked finding; null when engagement-level. */
  host: string | null;
  port: number | null;
  protocol: string | null;
  service: string | null;
}

/**
 * Resolve + severity-sort an engagement's findings. Port-linked findings carry
 * their affected host/port/service; engagement-level findings (port_id = null)
 * leave those fields null.
 */
export function enrichFindings(vm: EngagementViewModel): EnrichedFinding[] {
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
  // Defensive fallback for single-host VMs that don't populate vm.hosts.
  if (portIndex.size === 0) {
    const primaryHost = vm.engagement.hosts[0];
    for (const pvm of vm.ports) {
      portIndex.set(pvm.port.id, {
        port: pvm.port.port,
        protocol: pvm.port.protocol,
        service: pvm.port.service,
        hostIp: primaryHost?.ip ?? "",
        hostHostname: primaryHost?.hostname ?? null,
      });
    }
  }

  return [...vm.engagement.findings]
    .sort((a, b) => {
      const sa = SEVERITY_RANK[a.severity] ?? 99;
      const sb = SEVERITY_RANK[b.severity] ?? 99;
      if (sa !== sb) return sa - sb;
      return a.title.localeCompare(b.title);
    })
    .map((f) => {
      const info = f.port_id != null ? portIndex.get(f.port_id) : null;
      const host = info
        ? info.hostHostname
          ? `${info.hostHostname} (${info.hostIp})`
          : info.hostIp
        : null;
      return {
        id: f.id,
        severity: f.severity,
        title: f.title,
        description: f.description ?? null,
        cve: f.cve ?? null,
        createdAt: f.created_at,
        host,
        port: info?.port ?? null,
        protocol: info?.protocol ?? null,
        service: info?.service ?? null,
      };
    });
}
