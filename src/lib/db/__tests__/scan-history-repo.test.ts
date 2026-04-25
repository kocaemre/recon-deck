import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/helpers/db.js";
import { createFromScan, getById } from "../engagement-repo.js";
import { listScanHistory, rescanEngagement } from "../scan-history-repo.js";
import { ports } from "../schema.js";
import { eq } from "drizzle-orm";
import type { ParsedScan } from "../../parser/types.js";

function makeScan(opts: {
  ip?: string;
  hostname?: string;
  ports?: { port: number; protocol: "tcp" | "udp"; service?: string }[];
} = {}): ParsedScan {
  const target = {
    ip: opts.ip ?? "10.10.10.5",
    ...(opts.hostname ? { hostname: opts.hostname } : {}),
  };
  const portList = (opts.ports ?? [
    { port: 22, protocol: "tcp" as const, service: "ssh" },
    { port: 80, protocol: "tcp" as const, service: "http" },
  ]).map((p) => ({
    port: p.port,
    protocol: p.protocol,
    state: "open" as const,
    service: p.service,
    scripts: [],
  }));
  return {
    hosts: [{ target, ports: portList, hostScripts: [] }],
    target,
    source: "nmap-text",
    ports: portList,
    hostScripts: [],
    warnings: [],
  };
}

describe("scan-history-repo (P1-G PR 1)", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("createFromScan inserts an inaugural scan_history row + links ports", () => {
    const result = createFromScan(db, makeScan(), "<raw>");
    const history = listScanHistory(db, result.id);
    expect(history).toHaveLength(1);
    expect(history[0].source).toBe("nmap-text");
    expect(history[0].raw_input).toBe("<raw>");

    const portRows = db
      .select()
      .from(ports)
      .where(eq(ports.engagement_id, result.id))
      .all();
    for (const p of portRows) {
      expect(p.first_seen_scan_id).toBe(history[0].id);
      expect(p.last_seen_scan_id).toBe(history[0].id);
      expect(p.closed_at_scan_id).toBeNull();
    }
  });

  it("rescan: re-observed ports get last_seen advanced; absentees get closed_at", () => {
    const created = createFromScan(db, makeScan(), "<raw1>");
    const initialHistory = listScanHistory(db, created.id);
    const initialScanId = initialHistory[0].id;

    // Second scan: keeps 22 open, drops 80, adds 443.
    const rescan = makeScan({
      ports: [
        { port: 22, protocol: "tcp", service: "ssh" },
        { port: 443, protocol: "tcp", service: "https" },
      ],
    });
    const result = rescanEngagement(db, created.id, rescan, "<raw2>");
    expect(result.added).toBe(1);
    expect(result.closed).toBe(1);
    expect(result.reaffirmed).toBe(1);
    expect(result.reopened).toBe(0);
    expect(result.newHosts).toBe(0);

    const history = listScanHistory(db, created.id);
    expect(history).toHaveLength(2);
    // listScanHistory orders newest-first.
    expect(history[0].id).toBe(result.scanId);
    expect(history[1].id).toBe(initialScanId);

    const allPorts = db
      .select()
      .from(ports)
      .where(eq(ports.engagement_id, created.id))
      .all();
    const port22 = allPorts.find((p) => p.port === 22)!;
    const port80 = allPorts.find((p) => p.port === 80)!;
    const port443 = allPorts.find((p) => p.port === 443)!;
    expect(port22.last_seen_scan_id).toBe(result.scanId);
    expect(port22.closed_at_scan_id).toBeNull();
    expect(port80.last_seen_scan_id).toBe(initialScanId);
    expect(port80.closed_at_scan_id).toBe(result.scanId);
    expect(port443.first_seen_scan_id).toBe(result.scanId);
    expect(port443.last_seen_scan_id).toBe(result.scanId);
  });

  it("rescan: a previously-closed port that returns becomes reopened", () => {
    const created = createFromScan(db, makeScan(), "<raw1>");
    // Close 80 by re-importing without it.
    rescanEngagement(
      db,
      created.id,
      makeScan({ ports: [{ port: 22, protocol: "tcp", service: "ssh" }] }),
      "<raw2>",
    );
    // Bring 80 back.
    const result = rescanEngagement(
      db,
      created.id,
      makeScan(),
      "<raw3>",
    );
    expect(result.reopened).toBe(1);
    expect(result.added).toBe(0);
    expect(result.closed).toBe(0);

    const portRows = db
      .select()
      .from(ports)
      .where(eq(ports.engagement_id, created.id))
      .all();
    const port80 = portRows.find((p) => p.port === 80)!;
    expect(port80.closed_at_scan_id).toBeNull();
    expect(port80.last_seen_scan_id).toBe(result.scanId);
  });

  it("rescan: new host surfaces with a non-primary hosts row + counted in newHosts", () => {
    const created = createFromScan(db, makeScan(), "<raw1>");
    // Multi-host re-import: original DC + new ws01.
    const rescan: ParsedScan = {
      hosts: [
        {
          target: { ip: "10.10.10.5" },
          ports: [
            {
              port: 22,
              protocol: "tcp",
              state: "open",
              service: "ssh",
              scripts: [],
            },
          ],
          hostScripts: [],
        },
        {
          target: { ip: "10.10.10.6", hostname: "ws01.htb" },
          ports: [
            {
              port: 3389,
              protocol: "tcp",
              state: "open",
              service: "ms-wbt-server",
              scripts: [],
            },
          ],
          hostScripts: [],
        },
      ],
      target: { ip: "10.10.10.5" },
      source: "nmap-text",
      ports: [],
      hostScripts: [],
      warnings: [],
    };
    const result = rescanEngagement(db, created.id, rescan, "<raw2>");
    expect(result.newHosts).toBe(1);

    const full = getById(db, created.id);
    expect(full!.hosts).toHaveLength(2);
    const newHost = full!.hosts.find((h) => h.ip === "10.10.10.6");
    expect(newHost).toBeDefined();
    expect(newHost!.is_primary).toBe(false);
    expect(newHost!.hostname).toBe("ws01.htb");
  });
});
