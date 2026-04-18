import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/helpers/db.js";
import { createFromScan, getById, listSummaries } from "../engagement-repo.js";
import { engagements, ports, port_scripts } from "../schema.js";
import { eq } from "drizzle-orm";
import type { ParsedScan } from "../../parser/types.js";

// ---------------------------------------------------------------------------
// Test fixture factory
// ---------------------------------------------------------------------------

function makeScan(overrides: Partial<ParsedScan> = {}): ParsedScan {
  return {
    target: { ip: "10.10.10.5" },
    source: "nmap-text",
    ports: [
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
    ],
    hostScripts: [],
    warnings: [],
    ...overrides,
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

    // Find by target_ip to avoid ordering ambiguity when timestamps are identical
    const summary5 = summaries.find((s) => s.target_ip === "10.10.10.5");
    const summary6 = summaries.find((s) => s.target_ip === "10.10.10.6");
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
});
