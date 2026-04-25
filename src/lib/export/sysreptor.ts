import "server-only";

/**
 * SysReptor JSON export (P1-H).
 *
 * SysReptor (https://docs.sysreptor.com) is an open-source pentest report
 * platform that imports project + finding data via JSON. The schema below
 * is a *generic, template-agnostic* shape — operators map our
 * `affected_components` / `description` fields onto their own SysReptor
 * design templates after import. Pin to `format: "projects/v1"` until
 * SysReptor formalises a v2.
 *
 * Fields chosen for round-trip:
 *   - data.title       → engagement.name
 *   - data.scope       → list of "<hostname> (<ip>)" strings, one per host
 *   - data.target_count → recon-deck specific; helps templates sanity-check
 *   - findings[].data.{title, severity, cve, description, affected_components}
 *
 * `affected_components` is a string list of "<hostLabel>:<port>/<proto>"
 * tokens (or the bare host label for engagement-level findings). Template
 * authors can reformat as they wish; the source-of-truth shape is stable.
 *
 * Pure string generation — no DB / network. Caller passes the view model.
 */

import type { EngagementViewModel } from "./view-model";

interface SysReptorFinding {
  id: string;
  status: "open";
  data: {
    title: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    cve?: string;
    description: string;
    affected_components: string[];
    recon_deck_finding_id: number;
  };
}

interface SysReptorExport {
  format: "projects/v1";
  recon_deck_version: string;
  name: string;
  data: {
    title: string;
    scope: string[];
    target_count: number;
    coverage_percent: number;
  };
  findings: SysReptorFinding[];
}

export function generateSysReptor(vm: EngagementViewModel): string {
  // Build host-IP-keyed lookup for finding affected_components resolution.
  const portIndex = new Map<
    number,
    { port: number; protocol: string; hostLabel: string }
  >();
  const scope: string[] = [];
  for (const hvm of vm.hosts) {
    const hostLabel = hvm.host.hostname
      ? `${hvm.host.hostname} (${hvm.host.ip})`
      : hvm.host.ip;
    scope.push(hostLabel);
    for (const pvm of hvm.ports) {
      portIndex.set(pvm.port.id, {
        port: pvm.port.port,
        protocol: pvm.port.protocol,
        hostLabel,
      });
    }
  }
  // Defensive fallback — pre-PR-3 engagements with empty vm.hosts.
  if (scope.length === 0) {
    const fallbackLabel = vm.engagement.target_hostname
      ? `${vm.engagement.target_hostname} (${vm.engagement.target_ip})`
      : vm.engagement.target_ip;
    scope.push(fallbackLabel);
    for (const pvm of vm.ports) {
      portIndex.set(pvm.port.id, {
        port: pvm.port.port,
        protocol: pvm.port.protocol,
        hostLabel: fallbackLabel,
      });
    }
  }

  const findings: SysReptorFinding[] = vm.engagement.findings.map((f) => {
    const affected: string[] = [];
    if (f.port_id != null) {
      const pi = portIndex.get(f.port_id);
      if (pi) affected.push(`${pi.hostLabel}:${pi.port}/${pi.protocol}`);
    }
    if (affected.length === 0) {
      // Engagement-level finding — surface every scope item so the SysReptor
      // template can render "Affected: all hosts" by default.
      for (const s of scope) affected.push(s);
    }
    const out: SysReptorFinding = {
      id: `recon-deck-finding-${f.id}`,
      status: "open",
      data: {
        title: f.title,
        severity: f.severity,
        description: f.description,
        affected_components: affected,
        recon_deck_finding_id: f.id,
      },
    };
    if (f.cve) out.data.cve = f.cve;
    return out;
  });

  const out: SysReptorExport = {
    format: "projects/v1",
    recon_deck_version: vm.recon_deck_version,
    name: vm.engagement.name,
    data: {
      title: vm.engagement.name,
      scope,
      target_count: scope.length,
      coverage_percent: vm.coverage,
    },
    findings,
  };

  return JSON.stringify(out, null, 2);
}
