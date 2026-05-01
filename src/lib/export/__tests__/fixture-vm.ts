/**
 * Shared test fixture for Phase 6 export generators (Markdown/JSON/HTML).
 *
 * This module exports a single deterministic `buildFixtureViewModel()` used by
 * Plans 03 (Markdown), 04 (JSON), and 05 (HTML) generator tests. All three
 * generator golden fixtures are derived from the SAME input, so divergence
 * between formats can only come from the generator — never the fixture.
 *
 * Why 3 ports (and not 1)?
 *
 *   Port A — 443/tcp (https, closed check, AR data, tunnel=ssl):
 *     - Exercises: TCP, SSL tunnel field, AR files, AR commands, UNCHECKED check,
 *       NULL notes (proves CONTEXT.md D-06 "skip empty Notes section").
 *
 *   Port B — 80/tcp (http, XSS payload, non-empty notes):
 *     - Exercises: TCP, NSE script with `<script>alert(1)</script>` payload
 *       (CRITICAL — proves escapeHtml() works in Plan 05's HTML generator),
 *       CHECKED check, non-empty notes body, EMPTY AR files / AR commands arrays.
 *
 *   Port C — 53/udp (dns, UDP protocol):
 *     - Exercises: UDP protocol (proves non-TCP handling), CHECKED check,
 *       EMPTY-STRING notes body (also triggers D-06 skip), empty NSE output.
 *
 * Additional coverage:
 *   - One hostScript (smb-os-discovery) to cover host-level script rendering.
 *   - warnings_json populated with a sample warning to exercise the
 *     warnings parse + render path.
 *   - engagement.source === "autorecon" so AR rendering is exercised end-to-end.
 *   - Ports inserted in reverse order (443, 80, 53) so Plan 01's ascending sort
 *     invariant is observable in the golden fixture output.
 *
 * Pinned constants:
 *   - recon_deck_version: "0.0.0-test" — pinned so golden fixtures never drift
 *     when package.json bumps the real version.
 *   - FIXTURE_EXPORTED_AT: "2026-04-17T12:00:00.000Z" — exported separately so
 *     Plan 03's Markdown generator can inject a deterministic exported_at
 *     timestamp via dependency injection instead of `new Date().toISOString()`.
 *
 * Coordination note (Wave 1 parallel execution):
 *   Plan 01 defines `EngagementViewModel` in `src/lib/export/view-model.ts`.
 *   Plan 02 (this file) runs in a parallel worktree and therefore cannot
 *   `import type` from `../view-model` — the file does not yet exist in this
 *   worktree. The types are declared locally below as a temporary shim that
 *   matches the Plan 01 contract verbatim. Once Plans 01 + 02 both merge, a
 *   follow-up cleanup (mentioned in the phase SUMMARY) can replace these
 *   local declarations with `import type { ... } from "../view-model"`.
 *   The structural shape is identical — no runtime divergence.
 */

import type {
  Engagement,
  Port,
  PortScript,
  CheckState,
  PortNote,
  PortCommand,
} from "@/lib/db/schema";
import type { FullEngagement, PortWithDetails } from "@/lib/db/types";
import type {
  EngagementViewModel,
  HostViewModel,
  PortViewModel,
} from "../view-model";

// ---------------------------------------------------------------------------
// Re-export view-model types so existing test files (markdown/html/json)
// that import `EngagementViewModel` from this fixture keep working — the
// fixture used to declare a local shim during Wave 1 parallel execution
// (see file header coordination note); P1-F PR 3 promotes the real types
// from `../view-model` and re-exports them here as a compatibility shim.
// ---------------------------------------------------------------------------

export type { EngagementViewModel, HostViewModel, PortViewModel };

// ---------------------------------------------------------------------------
// Pinned constants
// ---------------------------------------------------------------------------

/**
 * Pinned fixture export timestamp. Plan 03's Markdown generator will accept
 * an optional `exportedAt` parameter; tests pass this constant so the
 * frontmatter `exported_at` field is deterministic across runs.
 */
export const FIXTURE_EXPORTED_AT = "2026-04-17T12:00:00.000Z";

/**
 * Pinned recon-deck version used in golden fixtures.
 * Decoupled from package.json so version bumps do not force snapshot updates.
 */
export const FIXTURE_RECON_DECK_VERSION = "0.0.0-test";

// ---------------------------------------------------------------------------
// Row-level fixture builders
// ---------------------------------------------------------------------------

const ENGAGEMENT_ID = 1;
const CREATED_AT = "2026-04-17T09:00:00.000Z";
const UPDATED_AT = "2026-04-17T10:30:00.000Z";
const SCANNED_AT = "2026-04-17T10:00:00.000Z";
const TARGET_IP = "10.10.10.5";
const TARGET_HOSTNAME = "box.htb";

// P1-F PR 1: every Port row has host_id; the fixture's primary host id is 1.
const PRIMARY_HOST_ID = 1;

// Port A — 443/tcp (https, AR data, unchecked check, NULL notes)
const PORT_A_ID = 3;
const portA: Port = {
  id: PORT_A_ID,
  engagement_id: ENGAGEMENT_ID,
  host_id: PRIMARY_HOST_ID,
  first_seen_scan_id: null,
  last_seen_scan_id: null,
  closed_at_scan_id: null,
  port: 443,
  protocol: "tcp",
  state: "open",
  service: "https",
  product: "nginx",
  version: "1.18",
  tunnel: "ssl",
  extrainfo: null,
};

const portA_nseScripts: PortScript[] = [
  {
    id: 1,
    engagement_id: ENGAGEMENT_ID,
    port_id: PORT_A_ID,
    host_id: PRIMARY_HOST_ID,
    script_id: "ssl-cert",
    output: "Subject: CN=box.htb",
    is_host_script: false,
    source: "nmap",
  },
];

const portA_arFiles: PortScript[] = [
  {
    id: 2,
    engagement_id: ENGAGEMENT_ID,
    port_id: PORT_A_ID,
    host_id: PRIMARY_HOST_ID,
    script_id: "tcp_443_https_curl.txt",
    output: "HTTP/1.1 200 OK",
    is_host_script: false,
    source: "autorecon",
  },
];

const portA_checks: CheckState[] = [
  {
    engagement_id: ENGAGEMENT_ID,
    port_id: PORT_A_ID,
    check_key: "ssl-cert-check",
    checked: false,
    updated_at: UPDATED_AT,
  },
];

const portA_commands: PortCommand[] = [
  {
    id: 10,
    engagement_id: ENGAGEMENT_ID,
    port_id: PORT_A_ID,
    source: "autorecon",
    label: "nikto",
    template: "nikto -h {IP}:{PORT}",
  },
];

const portA_detail: PortWithDetails = {
  ...portA,
  scripts: [...portA_nseScripts, ...portA_arFiles],
  checks: portA_checks,
  notes: null, // NULL — exercises D-06 "skip empty Notes section"
  commands: portA_commands,
};

// Port B — 80/tcp (http, XSS NSE payload, non-empty notes, checked check)
const PORT_B_ID = 2;
const portB: Port = {
  id: PORT_B_ID,
  engagement_id: ENGAGEMENT_ID,
  host_id: PRIMARY_HOST_ID,
  first_seen_scan_id: null,
  last_seen_scan_id: null,
  closed_at_scan_id: null,
  port: 80,
  protocol: "tcp",
  state: "open",
  service: "http",
  product: "Apache",
  version: "2.4.52",
  tunnel: null,
  extrainfo: null,
};

// CRITICAL: the `<script>alert(1)</script>` payload is the input Plan 05's
// HTML generator test uses to prove escapeHtml() runs on NSE output. Do not
// alter this string — golden fixtures depend on it byte-for-byte.
const portB_nseScripts: PortScript[] = [
  {
    id: 3,
    engagement_id: ENGAGEMENT_ID,
    port_id: PORT_B_ID,
    host_id: PRIMARY_HOST_ID,
    script_id: "http-title",
    output: "<script>alert(1)</script> Site Title",
    is_host_script: false,
    source: "nmap",
  },
];

const portB_checks: CheckState[] = [
  {
    engagement_id: ENGAGEMENT_ID,
    port_id: PORT_B_ID,
    check_key: "http-dir-listing",
    checked: true,
    updated_at: UPDATED_AT,
  },
];

const portB_notes: PortNote = {
  engagement_id: ENGAGEMENT_ID,
  port_id: PORT_B_ID,
  body: "Looked at main page, see screenshot-01.png in HackTricks folder",
  updated_at: UPDATED_AT,
};

const portB_detail: PortWithDetails = {
  ...portB,
  scripts: portB_nseScripts,
  checks: portB_checks,
  notes: portB_notes,
  commands: [], // empty AR commands path
};

// Port C — 53/udp (dns, UDP protocol, empty-string notes)
const PORT_C_ID = 1;
const portC: Port = {
  id: PORT_C_ID,
  engagement_id: ENGAGEMENT_ID,
  host_id: PRIMARY_HOST_ID,
  first_seen_scan_id: null,
  last_seen_scan_id: null,
  closed_at_scan_id: null,
  port: 53,
  protocol: "udp",
  state: "open",
  service: "domain",
  product: null,
  version: null,
  tunnel: null,
  extrainfo: null,
};

const portC_checks: CheckState[] = [
  {
    engagement_id: ENGAGEMENT_ID,
    port_id: PORT_C_ID,
    check_key: "dns-axfr",
    checked: true,
    updated_at: UPDATED_AT,
  },
];

const portC_notes: PortNote = {
  engagement_id: ENGAGEMENT_ID,
  port_id: PORT_C_ID,
  body: "", // empty string — triggers D-06 skip-empty Notes section
  updated_at: UPDATED_AT,
};

const portC_detail: PortWithDetails = {
  ...portC,
  scripts: [], // empty NSE path
  checks: portC_checks,
  notes: portC_notes,
  commands: [],
};

// Host-level script (port_id = null, host_id = primary host).
// Migration 0010: host_id is the attribution primitive for host scripts
// in multi-host engagements; in this single-host fixture it pins to the
// primary host so the shape mirrors what createFromScan now writes.
const hostScript: PortScript = {
  id: 99,
  engagement_id: ENGAGEMENT_ID,
  port_id: null,
  host_id: PRIMARY_HOST_ID,
  script_id: "smb-os-discovery",
  output: "OS: Windows Server 2019",
  is_host_script: true,
  source: "nmap",
};

// Engagement metadata — "autorecon" source to exercise AR rendering end-to-end.
// Migration 0009: target identity comes from `hosts` (primaryHost below);
// legacy target_ip / target_hostname columns no longer exist on Engagement.
const engagement: Engagement = {
  id: ENGAGEMENT_ID,
  name: "box.htb (10.10.10.5)",
  source: "autorecon",
  scanned_at: SCANNED_AT,
  os_name: "Linux 5.x",
  os_accuracy: 95,
  raw_input: "example.zip", // AR engagements store the zip filename (Phase 5 D-14)
  warnings_json: '["skipped sctp port 9999"]',
  created_at: CREATED_AT,
  updated_at: UPDATED_AT,
  // Migration 0011: empty tag set + active by default.
  tags: "[]",
  is_archived: false,
};

// P1-F PR 1: primary host row mirroring the legacy target columns. Once the
// UI reads from `hosts` directly this fixture will gain multi-host variants.
const primaryHost = {
  id: PRIMARY_HOST_ID,
  engagement_id: ENGAGEMENT_ID,
  ip: TARGET_IP,
  hostname: TARGET_HOSTNAME,
  state: null,
  os_name: "Linux 5.x",
  os_accuracy: 95,
  is_primary: true,
  scanned_at: SCANNED_AT,
};

// Ports inserted in REVERSE order so Plan 01's ascending sort is observable.
const fullEngagement: FullEngagement = {
  ...engagement,
  hosts: [primaryHost],
  ports: [portA_detail, portB_detail, portC_detail],
  hostScripts: [hostScript],
  engagementArtifacts: [],
  evidence: [],
  findings: [],
};

// ---------------------------------------------------------------------------
// Per-port view model assembly (mirrors Plan 01 loadEngagementForExport logic)
// ---------------------------------------------------------------------------

// Port A (443/tcp) view model
const portA_vm: PortViewModel = {
  port: portA_detail,
  nseScripts: portA_nseScripts,
  arFiles: portA_arFiles.map((s) => ({
    filename: s.script_id,
    content: s.output,
  })),
  kbCommands: [
    {
      label: "openssl s_client",
      command: `openssl s_client -connect ${TARGET_IP}:443`,
    },
  ],
  arCommands: portA_commands.map((c) => ({
    label: c.label,
    command: c.template
      .replace(/\{IP\}/g, TARGET_IP)
      .replace(/\{PORT\}/g, "443")
      .replace(/\{HOST\}/g, TARGET_HOSTNAME),
  })),
  kbChecks: [{ key: "ssl-cert-check", label: "Inspect TLS certificate" }],
  checkMap: new Map<string, boolean>([["ssl-cert-check", false]]),
  risk: "low",
};

// Port B (80/tcp) view model
const portB_vm: PortViewModel = {
  port: portB_detail,
  nseScripts: portB_nseScripts,
  arFiles: [], // empty AR-files path
  kbCommands: [
    {
      label: "gobuster dir",
      command: `gobuster dir -u http://${TARGET_IP}:80/`,
    },
  ],
  arCommands: [], // empty AR-commands path
  kbChecks: [{ key: "http-dir-listing", label: "Check for directory listing" }],
  checkMap: new Map<string, boolean>([["http-dir-listing", true]]),
  risk: "medium",
};

// Port C (53/udp) view model
const portC_vm: PortViewModel = {
  port: portC_detail,
  nseScripts: [],
  arFiles: [],
  kbCommands: [
    {
      label: "dig axfr",
      command: `dig axfr @${TARGET_IP} ${TARGET_HOSTNAME}`,
    },
  ],
  arCommands: [],
  kbChecks: [{ key: "dns-axfr", label: "Attempt zone transfer (AXFR)" }],
  checkMap: new Map<string, boolean>([["dns-axfr", true]]),
  risk: "low",
};

// ---------------------------------------------------------------------------
// Public fixture factory
// ---------------------------------------------------------------------------

/**
 * Returns a curated EngagementViewModel that exercises every code path the
 * three export generators (MD/JSON/HTML) must cover. Deterministic — each
 * call returns the same logical structure (fresh object/Map instances so
 * tests can mutate without leaking state).
 *
 * Top-level invariants baked into this fixture:
 *   - ports are returned ascending by port number (53, 80, 443)
 *   - totalChecks = 3 (one kbCheck per port)
 *   - doneChecks = 2 (port 80 http-dir-listing + port 53 dns-axfr)
 *   - coverage = Math.round(2/3 * 100) = 67
 *   - warnings = ["skipped sctp port 9999"] (parsed from engagement.warnings_json)
 *   - recon_deck_version = FIXTURE_RECON_DECK_VERSION ("0.0.0-test")
 */
export function buildFixtureViewModel(): EngagementViewModel {
  // Rebuild fresh Map instances so mutation in one test does not leak into
  // another. Port/Script/Notes objects are read-only data — safe to share.
  const portA_fresh: PortViewModel = {
    ...portA_vm,
    checkMap: new Map<string, boolean>(portA_vm.checkMap),
  };
  const portB_fresh: PortViewModel = {
    ...portB_vm,
    checkMap: new Map<string, boolean>(portB_vm.checkMap),
  };
  const portC_fresh: PortViewModel = {
    ...portC_vm,
    checkMap: new Map<string, boolean>(portC_vm.checkMap),
  };

  // Ports ascending by port number (53 → 80 → 443). Plan 01 guarantees this
  // sort in loadEngagementForExport; mirror it here so golden fixtures match.
  const sortedPorts: PortViewModel[] = [portC_fresh, portB_fresh, portA_fresh];

  const totalChecks = sortedPorts.reduce(
    (acc, p) => acc + p.kbChecks.length,
    0,
  );
  const doneChecks = sortedPorts.reduce(
    (acc, p) =>
      acc + p.kbChecks.filter((c) => p.checkMap.get(c.key) === true).length,
    0,
  );
  const coverage =
    totalChecks === 0 ? 0 : Math.round((doneChecks / totalChecks) * 100);

  // P1-F PR 3: single-host fixture — every port goes to the engagement's
  // primary host. Generators that branch on `vm.hosts.length > 1` must NOT
  // emit host headers for this fixture; the existing golden fixtures stay
  // byte-stable (single-host == legacy rendering).
  const primaryHostVm: HostViewModel = {
    host: primaryHost,
    ports: sortedPorts,
    hostScripts: [hostScript],
    isPrimary: true,
  };

  return {
    engagement: fullEngagement,
    hosts: [primaryHostVm],
    ports: sortedPorts,
    hostScripts: [hostScript],
    totalChecks,
    doneChecks,
    coverage,
    warnings: ["skipped sctp port 9999"],
    recon_deck_version: FIXTURE_RECON_DECK_VERSION,
  };
}

/**
 * Multi-host fixture (P1-F PR 3) — 2 hosts, used by smoke tests for
 * markdown/json/html multi-host rendering. Reuses the primary host fixture
 * plus a minimal secondary "ws01" host carrying one RDP port. Engagement-
 * level fields (warnings, coverage, recon_deck_version) inherit the
 * single-host fixture's values so assertions stay readable.
 */
export function buildMultiHostFixtureViewModel(): EngagementViewModel {
  const base = buildFixtureViewModel();

  const secondaryHostId = 2;
  const secondaryIp = "10.10.10.6";
  const secondaryHostname = "ws01.htb";

  const secondaryPort: PortWithDetails = {
    id: 999,
    engagement_id: ENGAGEMENT_ID,
    host_id: secondaryHostId,
    first_seen_scan_id: null,
    last_seen_scan_id: null,
    closed_at_scan_id: null,
    port: 3389,
    protocol: "tcp",
    state: "open",
    service: "ms-wbt-server",
    product: null,
    version: null,
    tunnel: null,
    extrainfo: null,
    scripts: [],
    checks: [],
    notes: null,
    commands: [],
  };

  const secondaryPortVm: PortViewModel = {
    port: secondaryPort,
    nseScripts: [],
    arFiles: [],
    kbCommands: [],
    arCommands: [],
    kbChecks: [],
    checkMap: new Map<string, boolean>(),
    risk: "medium",
  };

  const secondaryHostVm: HostViewModel = {
    host: {
      id: secondaryHostId,
      engagement_id: ENGAGEMENT_ID,
      ip: secondaryIp,
      hostname: secondaryHostname,
      state: null,
      os_name: null,
      os_accuracy: null,
      is_primary: false,
      scanned_at: null,
    },
    ports: [secondaryPortVm],
    hostScripts: [],
    isPrimary: false,
  };

  // Primary host inherits its ports from the base fixture; mark it as
  // primary explicitly (base already has it as such).
  const primaryHostVm = base.hosts[0];

  return {
    ...base,
    hosts: [primaryHostVm, secondaryHostVm],
    // Legacy mirror still points at the primary host's ports + scripts
    // (used by single-host code paths inside generators).
  };
}
