import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../../../tests/helpers/db.js";
import { addManualPort, deletePort } from "../ports-repo.js";
import { createFromScan } from "../engagement-repo.js";
import { hosts, ports, scan_history } from "../schema.js";
import type { ParsedScan, ParsedHost } from "../../parser/types.js";

function buildScan(targets: Array<{ ip: string; hostname?: string }>): ParsedScan {
  const parsedHosts: ParsedHost[] = targets.map((t) => ({
    target: t,
    ports: [
      { port: 22, protocol: "tcp", state: "open", service: "ssh", scripts: [] },
    ],
    hostScripts: [],
  }));
  const primary = parsedHosts[0];
  return {
    hosts: parsedHosts,
    target: primary.target,
    source: "nmap-xml",
    ports: primary.ports,
    hostScripts: primary.hostScripts,
    warnings: [],
  };
}

describe("addManualPort (host_id + scan_id binding)", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("binds new port to engagement's primary host when hostId is omitted", () => {
    const eng = createFromScan(db, buildScan([{ ip: "10.10.10.5" }]), "<raw>");
    const primary = db
      .select()
      .from(hosts)
      .where(eq(hosts.engagement_id, eng.id))
      .get()!;

    const port = addManualPort(db, {
      engagementId: eng.id,
      port: 8080,
      protocol: "tcp",
      service: "http-proxy",
    });

    expect(port.host_id).toBe(primary.id);
  });

  it("binds new port to the explicit host when hostId is provided", () => {
    const eng = createFromScan(
      db,
      buildScan([
        { ip: "10.10.10.5", hostname: "dc01" },
        { ip: "10.10.10.6", hostname: "ws01" },
      ]),
      "<raw>",
    );
    const allHosts = db
      .select()
      .from(hosts)
      .where(eq(hosts.engagement_id, eng.id))
      .all();
    const ws01 = allHosts.find((h) => h.ip === "10.10.10.6")!;

    const port = addManualPort(db, {
      engagementId: eng.id,
      hostId: ws01.id,
      port: 4444,
      protocol: "tcp",
    });

    expect(port.host_id).toBe(ws01.id);
  });

  it("rejects hostId that belongs to a different engagement", () => {
    const engA = createFromScan(db, buildScan([{ ip: "10.10.10.5" }]), "<a>");
    const engB = createFromScan(db, buildScan([{ ip: "10.20.20.5" }]), "<b>");
    const wrongHost = db
      .select()
      .from(hosts)
      .where(eq(hosts.engagement_id, engB.id))
      .get()!;

    expect(() =>
      addManualPort(db, {
        engagementId: engA.id,
        hostId: wrongHost.id,
        port: 9999,
        protocol: "tcp",
      }),
    ).toThrow(/does not belong to engagement/);
  });

  it("stamps first_seen_scan_id and last_seen_scan_id from the latest scan_history row", () => {
    const eng = createFromScan(db, buildScan([{ ip: "10.10.10.5" }]), "<raw>");
    const inaugural = db
      .select()
      .from(scan_history)
      .where(eq(scan_history.engagement_id, eng.id))
      .get()!;

    const port = addManualPort(db, {
      engagementId: eng.id,
      port: 8443,
      protocol: "tcp",
    });

    expect(port.first_seen_scan_id).toBe(inaugural.id);
    expect(port.last_seen_scan_id).toBe(inaugural.id);
    expect(port.closed_at_scan_id).toBeNull();
  });

  it("allows the same (port, protocol) on different hosts within an engagement", () => {
    const eng = createFromScan(
      db,
      buildScan([
        { ip: "10.10.10.5", hostname: "dc01" },
        { ip: "10.10.10.6", hostname: "ws01" },
      ]),
      "<raw>",
    );
    const allHosts = db
      .select()
      .from(hosts)
      .where(eq(hosts.engagement_id, eng.id))
      .all();
    const dc01 = allHosts.find((h) => h.ip === "10.10.10.5")!;
    const ws01 = allHosts.find((h) => h.ip === "10.10.10.6")!;

    addManualPort(db, {
      engagementId: eng.id,
      hostId: dc01.id,
      port: 5000,
      protocol: "tcp",
    });
    // Same port number on a different host — should not collide.
    expect(() =>
      addManualPort(db, {
        engagementId: eng.id,
        hostId: ws01.id,
        port: 5000,
        protocol: "tcp",
      }),
    ).not.toThrow();
  });

  it("rejects duplicate (host, port, protocol)", () => {
    const eng = createFromScan(db, buildScan([{ ip: "10.10.10.5" }]), "<raw>");
    addManualPort(db, {
      engagementId: eng.id,
      port: 7000,
      protocol: "tcp",
    });
    expect(() =>
      addManualPort(db, {
        engagementId: eng.id,
        port: 7000,
        protocol: "tcp",
      }),
    ).toThrow(/already exists/);
  });

  it("deletePort removes the row scoped to its engagement", () => {
    const eng = createFromScan(db, buildScan([{ ip: "10.10.10.5" }]), "<raw>");
    const port = addManualPort(db, {
      engagementId: eng.id,
      port: 9090,
      protocol: "tcp",
    });
    const removed = deletePort(db, eng.id, port.id);
    expect(removed).toBe(true);

    const after = db.select().from(ports).where(eq(ports.id, port.id)).get();
    expect(after).toBeUndefined();
  });
});
