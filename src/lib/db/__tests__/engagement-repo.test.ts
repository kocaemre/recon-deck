import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/helpers/db.js";
import {
  archiveEngagement,
  cloneEngagement,
  createFromScan,
  deleteEngagement,
  getById,
  listSummaries,
  renameEngagement,
  setEngagementTags,
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

  it("migration 0010: host scripts in a multi-host engagement carry their owning host_id", () => {
    const dc = {
      target: { ip: "10.10.10.5", hostname: "dc01.htb" },
      ports: [],
      hostScripts: [
        { id: "smb-os-discovery", output: "OS: Windows Server 2019" },
      ],
    };
    const ws01 = {
      target: { ip: "10.10.10.6", hostname: "ws01.htb" },
      ports: [],
      hostScripts: [
        { id: "smb-os-discovery", output: "OS: Windows 10" },
      ],
    };

    const scan = makeScan({
      target: dc.target,
      ports: [],
      hosts: [dc, ws01],
    });
    const result = createFromScan(db, scan, "<raw>");

    const full = getById(db, result.id);
    expect(full).not.toBeNull();
    const dcId = full!.hosts.find((h) => h.ip === "10.10.10.5")!.id;
    const ws01Id = full!.hosts.find((h) => h.ip === "10.10.10.6")!.id;

    // Both host scripts present, each tagged with its owning host —
    // proving they're no longer collapsed onto the engagement.
    expect(full!.hostScripts).toHaveLength(2);
    const dcScript = full!.hostScripts.find((s) => s.host_id === dcId);
    const ws01Script = full!.hostScripts.find((s) => s.host_id === ws01Id);
    expect(dcScript?.output).toBe("OS: Windows Server 2019");
    expect(ws01Script?.output).toBe("OS: Windows 10");
  });

  it("migration 0010: port-level scripts inherit host_id from their owning host", () => {
    const dc = {
      target: { ip: "10.10.10.5", hostname: "dc01.htb" },
      ports: [
        {
          port: 445,
          protocol: "tcp" as const,
          state: "open" as const,
          service: "microsoft-ds",
          scripts: [{ id: "smb2-time", output: "DC time" }],
        },
      ],
      hostScripts: [],
    };
    const ws01 = {
      target: { ip: "10.10.10.6", hostname: "ws01.htb" },
      ports: [
        {
          port: 22,
          protocol: "tcp" as const,
          state: "open" as const,
          service: "ssh",
          scripts: [{ id: "ssh-hostkey", output: "WS01 hostkey" }],
        },
      ],
      hostScripts: [],
    };

    const scan = makeScan({
      target: dc.target,
      ports: dc.ports,
      hosts: [dc, ws01],
    });
    const result = createFromScan(db, scan, "<raw>");

    const full = getById(db, result.id);
    expect(full).not.toBeNull();
    const dcId = full!.hosts.find((h) => h.ip === "10.10.10.5")!.id;
    const ws01Id = full!.hosts.find((h) => h.ip === "10.10.10.6")!.id;

    const dcPort = full!.ports.find((p) => p.port === 445)!;
    const wsPort = full!.ports.find((p) => p.port === 22)!;
    expect(dcPort.scripts[0].host_id).toBe(dcId);
    expect(wsPort.scripts[0].host_id).toBe(ws01Id);
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

  it("renameEngagement overrides label without touching host identity", () => {
    const result = createFromScan(db, makeScan(), "<raw>");
    const before = db
      .select()
      .from(engagements)
      .where(eq(engagements.id, result.id))
      .get();
    const hostBefore = db
      .select()
      .from(hosts)
      .where(
        and(eq(hosts.engagement_id, result.id), eq(hosts.is_primary, true)),
      )
      .get();
    expect(before).toBeDefined();
    expect(hostBefore).toBeDefined();

    const ok = renameEngagement(db, result.id, "lame.htb writeup");
    expect(ok).toBe(true);

    const after = db
      .select()
      .from(engagements)
      .where(eq(engagements.id, result.id))
      .get();
    const hostAfter = db
      .select()
      .from(hosts)
      .where(
        and(eq(hosts.engagement_id, result.id), eq(hosts.is_primary, true)),
      )
      .get();

    expect(after?.name).toBe("lame.htb writeup");
    // updated_at refreshed: lexicographic ISO-8601 compare. Equal is
    // tolerated (millisecond clock resolution can collapse insert+update
    // into the same tick on a fast machine); strictly earlier is the
    // failure mode this guards against.
    expect(after?.updated_at.localeCompare(before!.updated_at)).toBeGreaterThanOrEqual(0);
    // Host identity (ip/hostname) untouched — rename is label-only.
    expect(hostAfter?.ip).toBe(hostBefore?.ip);
    expect(hostAfter?.hostname).toBe(hostBefore?.hostname);
  });

  it("renameEngagement returns false for unknown engagement id", () => {
    expect(renameEngagement(db, 99999, "nope")).toBe(false);
  });

  it("cloneEngagement returns null for unknown engagement id", () => {
    expect(cloneEngagement(db, 99999)).toBeNull();
  });

  it("cloneEngagement deep-copies a multi-host engagement with isolated ids", () => {
    const dc = {
      target: { ip: "10.10.10.5", hostname: "dc01.htb" },
      ports: [
        {
          port: 445,
          protocol: "tcp" as const,
          state: "open" as const,
          service: "microsoft-ds",
          scripts: [{ id: "smb2-time", output: "DC time" }],
        },
      ],
      hostScripts: [
        { id: "smb-os-discovery", output: "OS: Windows Server 2019" },
      ],
    };
    const ws01 = {
      target: { ip: "10.10.10.6", hostname: "ws01.htb" },
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
      hosts: [dc, ws01],
    });
    const source = createFromScan(db, scan, "<raw>");

    const cloneId = cloneEngagement(db, source.id, "DC writeup (template)");
    expect(cloneId).not.toBeNull();
    expect(cloneId).not.toBe(source.id);

    const original = getById(db, source.id);
    const copy = getById(db, cloneId!);
    expect(copy).not.toBeNull();
    expect(copy!.name).toBe("DC writeup (template)");

    // Per-table cardinalities match the original.
    expect(copy!.hosts).toHaveLength(original!.hosts.length);
    expect(copy!.ports).toHaveLength(original!.ports.length);
    expect(copy!.hostScripts).toHaveLength(original!.hostScripts.length);

    // Copy uses fresh primary keys — host_id, port_id all distinct.
    const originalHostIds = new Set(original!.hosts.map((h) => h.id));
    const originalPortIds = new Set(original!.ports.map((p) => p.id));
    for (const h of copy!.hosts) expect(originalHostIds.has(h.id)).toBe(false);
    for (const p of copy!.ports) expect(originalPortIds.has(p.id)).toBe(false);

    // Per-host attribution survives the copy: DC has the smb-os-discovery
    // host script and the 445 port; ws01 has 22.
    const copyDc = copy!.hosts.find((h) => h.ip === "10.10.10.5")!;
    const copyWs = copy!.hosts.find((h) => h.ip === "10.10.10.6")!;
    expect(copyDc.is_primary).toBe(true);

    const dcHostScripts = copy!.hostScripts.filter(
      (s) => s.host_id === copyDc.id,
    );
    expect(dcHostScripts).toHaveLength(1);
    expect(dcHostScripts[0].script_id).toBe("smb-os-discovery");
    expect(dcHostScripts[0].output).toBe("OS: Windows Server 2019");

    const dcPort = copy!.ports.find((p) => p.host_id === copyDc.id)!;
    expect(dcPort.port).toBe(445);
    expect(dcPort.scripts).toHaveLength(1);
    expect(dcPort.scripts[0].script_id).toBe("smb2-time");
    expect(dcPort.scripts[0].host_id).toBe(copyDc.id);

    const wsPort = copy!.ports.find((p) => p.host_id === copyWs.id)!;
    expect(wsPort.port).toBe(22);
  });

  it("cloneEngagement isolates the copy: deleting the source preserves the clone", () => {
    const source = createFromScan(db, makeScan(), "<raw>");
    const cloneId = cloneEngagement(db, source.id);
    expect(cloneId).not.toBeNull();

    deleteEngagement(db, source.id);

    // Source is gone but the copy still resolves and still has its ports.
    expect(getById(db, source.id)).toBeNull();
    const copy = getById(db, cloneId!);
    expect(copy).not.toBeNull();
    expect(copy!.ports.length).toBeGreaterThan(0);
  });

  it("cloneEngagement default name appends ' (copy)' when no override is given", () => {
    const source = createFromScan(
      db,
      makeScan({ target: { ip: "10.10.10.5", hostname: "lame.htb" } }),
      "<raw>",
    );
    const cloneId = cloneEngagement(db, source.id);
    expect(cloneId).not.toBeNull();
    const copy = getById(db, cloneId!);
    expect(copy!.name).toBe("lame.htb (10.10.10.5) (copy)");
  });

  it("listSummaries defaults tags=[] and is_archived=false on legacy rows", () => {
    const result = createFromScan(db, makeScan(), "<raw>");
    const summary = listSummaries(db).find((s) => s.id === result.id);
    expect(summary).toBeDefined();
    expect(summary!.tags).toEqual([]);
    expect(summary!.is_archived).toBe(false);
  });

  it("setEngagementTags roundtrips through listSummaries with parsed array", () => {
    const result = createFromScan(db, makeScan(), "<raw>");
    expect(setEngagementTags(db, result.id, ["htb", "oscp"])).toBe(true);
    const summary = listSummaries(db).find((s) => s.id === result.id);
    expect(summary!.tags).toEqual(["htb", "oscp"]);

    // Replace, not append.
    expect(setEngagementTags(db, result.id, ["client-acme"])).toBe(true);
    const summary2 = listSummaries(db).find((s) => s.id === result.id);
    expect(summary2!.tags).toEqual(["client-acme"]);

    // Empty array clears the chip set.
    expect(setEngagementTags(db, result.id, [])).toBe(true);
    const summary3 = listSummaries(db).find((s) => s.id === result.id);
    expect(summary3!.tags).toEqual([]);
  });

  it("setEngagementTags returns false for unknown engagement", () => {
    expect(setEngagementTags(db, 99999, ["nope"])).toBe(false);
  });

  it("listSummaries falls through to [] when tags column holds malformed JSON", () => {
    const result = createFromScan(db, makeScan(), "<raw>");
    // Bypass the helper to plant invalid JSON and prove the parser is defensive.
    db.update(engagements)
      .set({ tags: "not-json" })
      .where(eq(engagements.id, result.id))
      .run();
    const summary = listSummaries(db).find((s) => s.id === result.id);
    expect(summary!.tags).toEqual([]);
  });

  it("archiveEngagement flips the is_archived flag", () => {
    const result = createFromScan(db, makeScan(), "<raw>");
    expect(archiveEngagement(db, result.id, true)).toBe(true);
    const archived = listSummaries(db).find((s) => s.id === result.id);
    expect(archived!.is_archived).toBe(true);

    expect(archiveEngagement(db, result.id, false)).toBe(true);
    const restored = listSummaries(db).find((s) => s.id === result.id);
    expect(restored!.is_archived).toBe(false);
  });

  it("archiveEngagement returns false for unknown engagement", () => {
    expect(archiveEngagement(db, 99999, true)).toBe(false);
  });

  it("archived engagements still cascade-delete via deleteEngagement", () => {
    const result = createFromScan(db, makeScan(), "<raw>");
    archiveEngagement(db, result.id, true);
    expect(deleteEngagement(db, result.id)).toBe(true);
    expect(getById(db, result.id)).toBeNull();
  });
});
