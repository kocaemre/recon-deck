/**
 * Plan 06-01 Task 2 — EngagementViewModel unit tests.
 *
 * Covers 5 behaviors mandated by PLAN.md:
 *   Test 1: Ports sorted ascending by port number
 *   Test 2: Per-port fields (nseScripts, arFiles, kbCommands, arCommands,
 *           kbChecks, checkMap, risk) assembled correctly
 *   Test 3: Command placeholder interpolation ({IP}, {PORT}, {HOST} with
 *           hostname → IP fallback)
 *   Test 4: Coverage calculation — Math.round(100 * done / total), 0 when no checks
 *   Test 5: Top-level pass-through (engagement, hostScripts, warnings parse,
 *           recon_deck_version from env)
 *
 * The tests build a FullEngagement fixture in memory (no DB) and a hand-rolled
 * KnowledgeBase stub (no YAML I/O) so the generator stays unit-testable per
 * RESEARCH.md Pitfall 5.
 */

import { describe, it, expect } from "vitest";
import type { FullEngagement } from "@/lib/db/types";
import type { KnowledgeBase } from "@/lib/kb";
import type { KbEntry } from "@/lib/kb";
import { loadEngagementForExport } from "../view-model";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

/**
 * Minimal KbEntry — satisfies the Zod-inferred shape used by loadEngagementForExport.
 * All optional fields resolved to sensible defaults so the stub behaves like a
 * freshly-parsed shipped entry.
 */
function kbEntry(opts: {
  port: number;
  service: string;
  commands?: Array<{ label: string; template: string }>;
  checks?: Array<{ key: string; label: string }>;
  risk?: KbEntry["risk"];
}): KbEntry {
  return {
    schema_version: 1,
    port: opts.port,
    service: opts.service,
    protocol: "tcp",
    aliases: [],
    checks: opts.checks ?? [],
    commands: opts.commands ?? [],
    resources: [],
    risk: opts.risk ?? "info",
  };
}

/** Build a stub KnowledgeBase keyed by the same `{port}-{service}` convention. */
function stubKb(entries: Record<string, KbEntry>, defaultEntry: KbEntry): KnowledgeBase {
  return {
    get: (k) => entries[k.toLowerCase()],
    getDefault: () => defaultEntry,
    keys: () => Object.keys(entries)[Symbol.iterator](),
  };
}

/**
 * Build a FullEngagement with 3 ports inserted in REVERSE order (443, 80, 22).
 * Exercises Test 1 (sort ascending) and Tests 2/3/4 (per-port assembly).
 */
function buildEngagement(): FullEngagement {
  const now = "2026-04-17T12:00:00.000Z";
  return {
    id: 1,
    name: "box.htb (10.10.10.5)",
    source: "nmap-xml",
    scanned_at: null,
    os_name: null,
    os_accuracy: null,
    raw_input: "<nmaprun/>",
    warnings_json: JSON.stringify(["sample warning"]),
    created_at: now,
    updated_at: now,
    // Migration 0011: empty tags + active.
    tags: "[]",
    is_archived: false,
    deleted_at: null,
    writeup: "",
    // P1-F PR 1: every port carries host_id — fixture's primary host id is 1.
    hosts: [
      {
        id: 1,
        engagement_id: 1,
        ip: "10.10.10.5",
        hostname: "box.htb",
        state: null,
        os_name: null,
        os_accuracy: null,
        is_primary: true,
        scanned_at: null,
      },
    ],
    // Ports inserted in descending order on purpose — view model must sort ASC.
    ports: [
      {
        id: 30,
        engagement_id: 1,
        host_id: 1,
        first_seen_scan_id: null,
        last_seen_scan_id: null,
        closed_at_scan_id: null,
      starred: false,
        port: 443,
        protocol: "tcp",
        state: "open",
        service: "https",
        product: null,
        version: null,
        tunnel: "ssl",
        extrainfo: null,
        scripts: [],
        checks: [],
        notes: null,
        commands: [],
      },
      {
        id: 20,
        engagement_id: 1,
        host_id: 1,
        first_seen_scan_id: null,
        last_seen_scan_id: null,
        closed_at_scan_id: null,
      starred: false,
        port: 80,
        protocol: "tcp",
        state: "open",
        service: "http",
        product: null,
        version: null,
        tunnel: null,
        extrainfo: null,
        scripts: [
          // NSE script (source='nmap' or undefined)
          {
            id: 101,
            engagement_id: 1,
            port_id: 20,
            host_id: 1,
            script_id: "http-title",
            output: "Apache2 Debian Default",
            is_host_script: false,
            source: "nmap",
          },
          // AutoRecon file (source='autorecon')
          {
            id: 102,
            engagement_id: 1,
            port_id: 20,
            host_id: 1,
            script_id: "tcp_80_http_whatweb.txt",
            output: "WhatWeb output goes here",
            is_host_script: false,
            source: "autorecon",
          },
        ],
        checks: [
          {
            engagement_id: 1,
            port_id: 20,
            check_key: "http-dir-listing",
            checked: true,
            updated_at: now,
          },
          {
            engagement_id: 1,
            port_id: 20,
            check_key: "http-robots-txt",
            checked: false,
            updated_at: now,
          },
        ],
        notes: null,
        commands: [
          {
            id: 401,
            engagement_id: 1,
            port_id: 20,
            source: "autorecon",
            label: "nikto",
            template: "nikto -h http://{HOST}:{PORT}",
          },
        ],
      },
      {
        id: 10,
        engagement_id: 1,
        host_id: 1,
        first_seen_scan_id: null,
        last_seen_scan_id: null,
        closed_at_scan_id: null,
      starred: false,
        port: 22,
        protocol: "tcp",
        state: "open",
        service: "ssh",
        product: null,
        version: null,
        tunnel: null,
        extrainfo: null,
        scripts: [],
        checks: [],
        notes: null,
        commands: [],
      },
    ],
    hostScripts: [
      {
        id: 999,
        engagement_id: 1,
        port_id: null,
        host_id: 1,
        script_id: "smb-os-discovery",
        output: "Host discovery output",
        is_host_script: true,
        source: "nmap",
      },
    ],
    engagementArtifacts: [],
    evidence: [],
    findings: [],
  };
}

/** Stub KB with matching entries for ports 22/80/443 + a default fallback. */
function buildKb(): KnowledgeBase {
  const defaultEntry = kbEntry({
    port: 0,
    service: "default",
    commands: [],
    checks: [],
  });
  return stubKb(
    {
      "22-ssh": kbEntry({
        port: 22,
        service: "ssh",
        commands: [
          {
            label: "version scan",
            template: "nmap -sV -p {PORT} {IP}",
          },
        ],
        checks: [
          { key: "ssh-banner", label: "Grab SSH banner" },
          { key: "ssh-creds", label: "Test default creds" },
        ],
        risk: "medium",
      }),
      "80-http": kbEntry({
        port: 80,
        service: "http",
        commands: [
          {
            label: "curl headers",
            template: "curl -I http://{HOST}:{PORT}/",
          },
        ],
        checks: [
          { key: "http-dir-listing", label: "Check directory listing" },
          { key: "http-robots-txt", label: "Fetch robots.txt" },
          { key: "http-uncovered", label: "Unchecked fallback" },
        ],
        risk: "low",
      }),
      "443-https": kbEntry({
        port: 443,
        service: "https",
        commands: [],
        checks: [{ key: "https-cert", label: "Inspect TLS cert" }],
        risk: "low",
      }),
    },
    defaultEntry,
  );
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("loadEngagementForExport (Plan 06-01 Task 2)", () => {
  it("Test 1: sorts ports ascending by port number", () => {
    const vm = loadEngagementForExport(buildEngagement(), buildKb());
    const portNumbers = vm.ports.map((pvm) => pvm.port.port);
    expect(portNumbers).toEqual([22, 80, 443]);
  });

  it("Test 2: per-port fields assembled (nseScripts, arFiles, kbCommands, arCommands, kbChecks, checkMap, risk)", () => {
    const vm = loadEngagementForExport(buildEngagement(), buildKb());
    const port80 = vm.ports.find((p) => p.port.port === 80)!;
    expect(port80).toBeDefined();

    // nseScripts: only source !== 'autorecon' entries
    expect(port80.nseScripts).toHaveLength(1);
    expect(port80.nseScripts[0].script_id).toBe("http-title");

    // arFiles: source === 'autorecon', shaped as {filename, content}
    expect(port80.arFiles).toHaveLength(1);
    expect(port80.arFiles[0]).toEqual({
      filename: "tcp_80_http_whatweb.txt",
      content: "WhatWeb output goes here",
    });

    // kbCommands interpolated — {HOST} -> hostname 'box.htb', {PORT} -> 80
    expect(port80.kbCommands).toHaveLength(1);
    expect(port80.kbCommands[0]).toEqual({
      label: "curl headers",
      command: "curl -I http://box.htb:80/",
    });

    // arCommands interpolated from port.commands
    expect(port80.arCommands).toHaveLength(1);
    expect(port80.arCommands[0]).toEqual({
      label: "nikto",
      command: "nikto -h http://box.htb:80",
    });

    // kbChecks shape
    expect(port80.kbChecks).toEqual([
      { key: "http-dir-listing", label: "Check directory listing" },
      { key: "http-robots-txt", label: "Fetch robots.txt" },
      { key: "http-uncovered", label: "Unchecked fallback" },
    ]);

    // checkMap reflects DB state
    expect(port80.checkMap.get("http-dir-listing")).toBe(true);
    expect(port80.checkMap.get("http-robots-txt")).toBe(false);
    expect(port80.checkMap.has("http-uncovered")).toBe(false); // never toggled

    // risk surfaced
    expect(port80.risk).toBe("low");
  });

  it("Test 3: interpolation — {IP}, {PORT}, {HOST}; HOST falls back to IP when hostname null", () => {
    // Rebuild engagement with hostname = null to exercise {HOST} fallback.
    const base = buildEngagement();
    const engNoHost: FullEngagement = {
      ...base,
      // Migration 0009: hostname now lives on the primary host row.
      hosts: base.hosts.map((h, i) => (i === 0 ? { ...h, hostname: null } : h)),
      ports: [
        {
          id: 10,
          engagement_id: 1,
          host_id: 1,
        first_seen_scan_id: null,
        last_seen_scan_id: null,
        closed_at_scan_id: null,
      starred: false,
          port: 22,
          protocol: "tcp",
          state: "open",
          service: "ssh",
          product: null,
          version: null,
          tunnel: null,
          extrainfo: null,
          scripts: [],
          checks: [],
          notes: null,
          commands: [
            {
              id: 501,
              engagement_id: 1,
              port_id: 10,
              source: "autorecon",
              label: "banner",
              template: "nc {HOST} {PORT}  # IP={IP}",
            },
          ],
        },
      ],
    };
    const vm = loadEngagementForExport(engNoHost, buildKb());
    const port22 = vm.ports.find((p) => p.port.port === 22)!;
    // KB command uses {IP} and {PORT}
    expect(port22.kbCommands[0].command).toBe("nmap -sV -p 22 10.10.10.5");
    // AR command exercises all three placeholders; {HOST} should resolve to IP.
    expect(port22.arCommands[0].command).toBe(
      "nc 10.10.10.5 22  # IP=10.10.10.5",
    );
  });

  it("Test 4: coverage = Math.round(100 * done / total); 0 when totalChecks === 0", () => {
    const vm = loadEngagementForExport(buildEngagement(), buildKb());
    // Expected check accounting:
    //   port 22 (ssh):   2 checks (ssh-banner, ssh-creds)       → 0 done
    //   port 80 (http):  3 checks (dir-listing, robots, uncov)  → 1 done (dir-listing)
    //   port 443 (https):1 check  (https-cert)                  → 0 done
    //   totals: done=1, total=6 → round(100/6) = 17
    expect(vm.totalChecks).toBe(6);
    expect(vm.doneChecks).toBe(1);
    expect(vm.coverage).toBe(17);

    // Empty engagement (no ports) — coverage should be 0, not NaN.
    const empty: FullEngagement = {
      ...buildEngagement(),
      ports: [],
    };
    const vmEmpty = loadEngagementForExport(empty, buildKb());
    expect(vmEmpty.totalChecks).toBe(0);
    expect(vmEmpty.doneChecks).toBe(0);
    expect(vmEmpty.coverage).toBe(0);
  });

  it("Test 5: top-level fields — engagement, hostScripts, warnings parsed, recon_deck_version from env", () => {
    const vm = loadEngagementForExport(buildEngagement(), buildKb());

    // Engagement passed through verbatim
    expect(vm.engagement.id).toBe(1);
    expect(vm.engagement.name).toBe("box.htb (10.10.10.5)");
    // Migration 0009: target identity sourced from primary host (hosts[0]).
    expect(vm.engagement.hosts[0].ip).toBe("10.10.10.5");

    // hostScripts pass-through
    expect(vm.hostScripts).toHaveLength(1);
    expect(vm.hostScripts[0].script_id).toBe("smb-os-discovery");

    // warnings parsed from warnings_json
    expect(vm.warnings).toEqual(["sample warning"]);

    // recon_deck_version — comes from npm_package_version OR fallback "0.0.0-dev".
    // In the vitest runtime either is acceptable; the string must be non-empty.
    expect(typeof vm.recon_deck_version).toBe("string");
    expect(vm.recon_deck_version.length).toBeGreaterThan(0);
  });

  it("Test 5b: malformed warnings_json defaults to empty array (T-06-01 mitigation)", () => {
    const badWarnings: FullEngagement = {
      ...buildEngagement(),
      warnings_json: "{not valid json",
    };
    const vm = loadEngagementForExport(badWarnings, buildKb());
    expect(vm.warnings).toEqual([]);
  });
});
