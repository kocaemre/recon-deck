import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/helpers/db.js";
import {
  createFromScan,
  deleteEngagement,
  getById,
  listSummaries,
} from "../engagement-repo.js";
import { engagements, ports, port_scripts, hosts } from "../schema.js";
import { eq, and } from "drizzle-orm";
import type { ParsedScan } from "../../parser/types.js";

// ---------------------------------------------------------------------------
// Test fixture factory
// ---------------------------------------------------------------------------

function makeScan(overrides: Partial<ParsedScan> = {}): ParsedScan {
  const target = overrides.target ?? { ip: "10.10.10.5" };
  const ports: ParsedScan["ports"] = overrides.ports ?? [
    {
      port: 22,
      protocol: "tcp",
      state: "open",
      service: "ssh",
      scripts: [],
    },
    {
      port: 80,
      protocol: "tcp",
      state: "open",
      service: "http",
      product: "Apache",
      version: "2.4.41",
      scripts: [{ id: "http-title", output: "Test Page" }],
    },
  ];
  const hostScripts = overrides.hostScripts ?? [];
  // hosts[0] mirrors target/ports/hostScripts so createFromScan (which now
  // reads scan.hosts) sees the same overrides callers pass at the top level.
  const primaryHost: ParsedScan["hosts"][number] = {
    target,
    ports,
    hostScripts,
  };
  if (overrides.os) primaryHost.os = overrides.os;
  return {
    hosts: overrides.hosts ?? [primaryHost],
    target,
    source: overrides.source ?? "nmap-text",
    ports,
    hostScripts,
    warnings: overrides.warnings ?? [],
    ...(overrides.os ? { os: overrides.os } : {}),
    ...(overrides.scannedAt ? { scannedAt: overrides.scannedAt } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createFromScan (Plan 03)", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("PERSIST-02: creates engagement with auto-generated name from IP only (D-01)", () => {
    const scan = makeScan();
    const result = createFromScan(db, scan, "<raw>");
    expect(result.id).toBeGreaterThan(0);
    expect(result.name).toBe("10.10.10.5");
  });

  it("PERSIST-02: creates engagement with hostname (ip) format when hostname present (D-01)", () => {
    const scan = makeScan({ target: { ip: "10.10.10.5", hostname: "box.htb" } });
    const result = createFromScan(db, scan, "<raw>");
    expect(result.name).toBe("box.htb (10.10.10.5)");
  });

  it("PERSIST-02: name falls back to IP when hostname equals IP (D-01)", () => {
    const scan = makeScan({ target: { ip: "10.10.10.5", hostname: "10.10.10.5" } });
    const result = createFromScan(db, scan, "<raw>");
    expect(result.name).toBe("10.10.10.5");
  });

  it("PERSIST-04: raw_input is stored and retrievable via getById", () => {
    const rawInput =
      "Nmap scan report for 10.10.10.5\nPORT STATE SERVICE\n22/tcp open ssh";
    const result = createFromScan(db, makeScan(), rawInput);
    const full = getById(db, result.id);
    expect(full).not.toBeNull();
    expect(full!.raw_input).toBe(rawInput);
  });

  it("PERSIST-01: engagement with ports and scripts persists correctly", () => {
    const result = createFromScan(db, makeScan(), "<raw>");
    const full = getById(db, result.id);
    expect(full).not.toBeNull();
    expect(full!.ports).toHaveLength(2);
    // Port 80 (index 1) has the http-title script
    const port80 = full!.ports.find((p) => p.port === 80);
    expect(port80).toBeDefined();
    expect(port80!.scripts).toHaveLength(1);
    expect(port80!.scripts[0].script_id).toBe("http-title");
    expect(port80!.scripts[0].output).toBe("Test Page");
  });

  it("D-08: host scripts stored separately from port scripts with is_host_script=true", () => {
    const scan = makeScan({
      hostScripts: [{ id: "smb-os-discovery", output: "Windows 10" }],
    });
    const result = createFromScan(db, scan, "<raw>");
    const full = getById(db, result.id);
    expect(full).not.toBeNull();
    expect(full!.hostScripts).toHaveLength(1);
    expect(full!.hostScripts[0].script_id).toBe("smb-os-discovery");
    expect(full!.hostScripts[0].output).toBe("Windows 10");
    expect(full!.hostScripts[0].is_host_script).toBe(true);
    expect(full!.hostScripts[0].port_id).toBeNull();
  });

  it("getById returns null for non-existent ID", () => {
    expect(getById(db, 9999)).toBeNull();
  });

  it("PERSIST-02: listSummaries returns all engagements with correct port counts", () => {
    // Engagement 1: 2 ports (10.10.10.5)
    const scan1 = makeScan();
    createFromScan(db, scan1, "<raw1>");

    // Engagement 2: 1 port (10.10.10.6)
    const scan2 = makeScan({
      target: { ip: "10.10.10.6" },
      ports: [{ port: 443, protocol: "tcp", state: "open", service: "https", scripts: [] }],
    });
    createFromScan(db, scan2, "<raw2>");

    const summaries = listSummaries(db);
    expect(summaries).toHaveLength(2);

    // Find by primary_ip to avoid ordering ambiguity when timestamps are identical
    const summary5 = summaries.find((s) => s.primary_ip === "10.10.10.5");
    const summary6 = summaries.find((s) => s.primary_ip === "10.10.10.6");
    expect(summary5).toBeDefined();
    expect(summary6).toBeDefined();
    expect(summary5!.port_count).toBe(2);
    expect(summary6!.port_count).toBe(1);
  });

  it("source column preserves nmap-text vs nmap-xml distinction", () => {
    const textResult = createFromScan(db, makeScan({ source: "nmap-text" }), "<raw>");
    const xmlResult = createFromScan(
      db,
      makeScan({ source: "nmap-xml", target: { ip: "10.10.10.6" } }),
      "<xml-raw>",
    );
    expect(getById(db, textResult.id)!.source).toBe("nmap-text");
    expect(getById(db, xmlResult.id)!.source).toBe("nmap-xml");
  });

  it("optional fields stored correctly: os, scannedAt, warnings", () => {
    const scan = makeScan({
      os: { name: "Linux 4.x", accuracy: 95 },
      scannedAt: "2024-01-01T00:00:00Z",
      warnings: ["Multi-host scan detected"],
    });
    const result = createFromScan(db, scan, "<raw>");
    const full = getById(db, result.id);
    expect(full).not.toBeNull();
    expect(full!.os_name).toBe("Linux 4.x");
    expect(full!.os_accuracy).toBe(95);
    expect(full!.scanned_at).toBe("2024-01-01T00:00:00Z");
    expect(JSON.parse(full!.warnings_json)).toEqual(["Multi-host scan detected"]);
  });

  it("P1-F PR 1: createFromScan inserts a primary host row mirroring the target", () => {
    const scan = makeScan({
      target: { ip: "10.10.10.7", hostname: "dc01.htb" },
      os: { name: "Windows Server 2019", accuracy: 95 },
      scannedAt: "2026-04-25T00:00:00Z",
    });
    const result = createFromScan(db, scan, "<raw>");

    const hostRows = db
      .select()
      .from(hosts)
      .where(eq(hosts.engagement_id, result.id))
      .all();
    expect(hostRows).toHaveLength(1);

    const primary = hostRows[0];
    expect(primary.is_primary).toBe(true);
    expect(primary.ip).toBe("10.10.10.7");
    expect(primary.hostname).toBe("dc01.htb");
    expect(primary.os_name).toBe("Windows Server 2019");
    expect(primary.os_accuracy).toBe(95);
    expect(primary.scanned_at).toBe("2026-04-25T00:00:00Z");
  });

  it("P1-F PR 1: every inserted port is linked to the primary host via host_id", () => {
    const result = createFromScan(db, makeScan(), "<raw>");
    const primary = db
      .select()
      .from(hosts)
      .where(
        and(eq(hosts.engagement_id, result.id), eq(hosts.is_primary, true)),
      )
      .get();
    expect(primary).toBeDefined();

    const portRows = db
      .select()
      .from(ports)
      .where(eq(ports.engagement_id, result.id))
      .all();
    expect(portRows.length).toBeGreaterThan(0);
    for (const p of portRows) {
      expect(p.host_id).toBe(primary!.id);
    }
  });

  it("P1-F PR 1: getById exposes the engagement's hosts", () => {
    const result = createFromScan(
      db,
      makeScan({ target: { ip: "10.10.10.9", hostname: "ws01.htb" } }),
      "<raw>",
    );
    const full = getById(db, result.id);
    expect(full).not.toBeNull();
    expect(full!.hosts).toHaveLength(1);
    expect(full!.hosts[0].is_primary).toBe(true);
    expect(full!.hosts[0].ip).toBe("10.10.10.9");
    expect(full!.hosts[0].hostname).toBe("ws01.htb");
  });

  it("P1-F PR 2: createFromScan inserts N hosts when scan.hosts has multiple entries", () => {
    // Build a 3-host scan where each host has its own ports.
    const dc = {
      target: { ip: "10.10.10.5", hostname: "dc01.htb" },
      ports: [
        {
          port: 88,
          protocol: "tcp" as const,
          state: "open" as const,
          service: "kerberos-sec",
          scripts: [],
        },
        {
          port: 445,
          protocol: "tcp" as const,
          state: "open" as const,
          service: "microsoft-ds",
          scripts: [],
        },
      ],
      hostScripts: [],
    };
    const ws01 = {
      target: { ip: "10.10.10.6", hostname: "ws01.htb" },
      ports: [
        {
          port: 3389,
          protocol: "tcp" as const,
          state: "open" as const,
          service: "ms-wbt-server",
          scripts: [],
        },
      ],
      hostScripts: [],
    };
    const ws02 = {
      target: { ip: "10.10.10.7", hostname: "ws02.htb" },
      ports: [
        {
          port: 22,
          protocol: "tcp" as const,
          state: "open" as const,
          service: "ssh",
          scripts: [],
        },
      ],
      hostScripts: [],
    };

    const scan = makeScan({
      target: dc.target,
      ports: dc.ports,
      hosts: [dc, ws01, ws02],
    });
    const result = createFromScan(db, scan, "<raw>");

    const full = getById(db, result.id);
    expect(full).not.toBeNull();
    expect(full!.hosts).toHaveLength(3);

    // Primary first, others sorted by IP.
    expect(full!.hosts[0].is_primary).toBe(true);
    expect(full!.hosts[0].ip).toBe("10.10.10.5");
    expect(full!.hosts[1].ip).toBe("10.10.10.6");
    expect(full!.hosts[2].ip).toBe("10.10.10.7");

    // Each port carries the correct host_id.
    const dcId = full!.hosts[0].id;
    const ws01Id = full!.hosts[1].id;
    const ws02Id = full!.hosts[2].id;

    const portsByHost = new Map<number, number[]>();
    for (const p of full!.ports) {
      const list = portsByHost.get(p.host_id ?? 0) ?? [];
      list.push(p.port);
      portsByHost.set(p.host_id ?? 0, list);
    }
    expect(portsByHost.get(dcId)?.sort((a, b) => a - b)).toEqual([88, 445]);
    expect(portsByHost.get(ws01Id)).toEqual([3389]);
    expect(portsByHost.get(ws02Id)).toEqual([22]);
  });

  it("cascade delete removes all ports and scripts when engagement is deleted", () => {
    const result = createFromScan(db, makeScan(), "<raw>");

    // Confirm ports and scripts exist
    const portsBefore = db
      .select()
      .from(ports)
      .where(eq(ports.engagement_id, result.id))
      .all();
    expect(portsBefore.length).toBeGreaterThan(0);

    const scriptsBefore = db
      .select()
      .from(port_scripts)
      .where(eq(port_scripts.engagement_id, result.id))
      .all();
    expect(scriptsBefore.length).toBeGreaterThan(0);

    // Delete engagement — cascade should remove child rows
    db.delete(engagements).where(eq(engagements.id, result.id)).run();

    const portsAfter = db
      .select()
      .from(ports)
      .where(eq(ports.engagement_id, result.id))
      .all();
    expect(portsAfter).toHaveLength(0);

    const scriptsAfter = db
      .select()
      .from(port_scripts)
      .where(eq(port_scripts.engagement_id, result.id))
      .all();
    expect(scriptsAfter).toHaveLength(0);
  });

  it("deleteEngagement cascades through every child table", () => {
    const result = createFromScan(db, makeScan(), "<raw>");

    // Sanity: rows exist before delete.
    const portsBefore = db
      .select()
      .from(ports)
      .where(eq(ports.engagement_id, result.id))
      .all();
    expect(portsBefore.length).toBeGreaterThan(0);

    const removed = deleteEngagement(db, result.id);
    expect(removed).toBe(true);

    // Engagement gone.
    const engAfter = getById(db, result.id);
    expect(engAfter).toBeNull();

    // Cascade — child tables empty.
    const portsAfter = db
      .select()
      .from(ports)
      .where(eq(ports.engagement_id, result.id))
      .all();
    const scriptsAfter = db
      .select()
      .from(port_scripts)
      .where(eq(port_scripts.engagement_id, result.id))
      .all();
    const hostsAfter = db
      .select()
      .from(hosts)
      .where(eq(hosts.engagement_id, result.id))
      .all();
    expect(portsAfter).toHaveLength(0);
    expect(scriptsAfter).toHaveLength(0);
    expect(hostsAfter).toHaveLength(0);

    // Second delete is a no-op (already gone).
    expect(deleteEngagement(db, result.id)).toBe(false);
  });
});
