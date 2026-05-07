import { describe, expect, it, beforeEach } from "vitest";
import { createTestDb } from "../../../../tests/helpers/db.js";
import { engagements, hosts, ports } from "../schema.js";
import {
  replaceForPort,
  listForPort,
} from "../fingerprints-repo.js";

describe("fingerprints-repo (v2.4.0 P2 #27)", () => {
  let db: ReturnType<typeof createTestDb>;
  let portId: number;

  beforeEach(() => {
    db = createTestDb();
    const now = new Date().toISOString();
    const eng = db
      .insert(engagements)
      .values({
        name: "test-engagement",
        scanned_at: null,
        raw_input: "x",
        source: "nmap-text",
        created_at: now,
        updated_at: now,
      })
      .returning({ id: engagements.id })
      .get();
    const host = db
      .insert(hosts)
      .values({
        engagement_id: eng.id,
        ip: "10.0.0.1",
        is_primary: true,
      })
      .returning({ id: hosts.id })
      .get();
    const port = db
      .insert(ports)
      .values({
        engagement_id: eng.id,
        host_id: host.id,
        port: 80,
        protocol: "tcp",
        state: "open",
      })
      .returning({ id: ports.id })
      .get();
    portId = port.id;
  });

  it("inserts fingerprints inside a transaction", () => {
    db.transaction((tx) =>
      replaceForPort(tx, portId, "nmap", [
        { type: "tech", value: "apache" },
        { type: "cves", value: "CVE-2021-41773" },
      ]),
    );
    const rows = listForPort(db, portId);
    expect(rows.map((r) => `${r.type}:${r.value}`).sort()).toEqual([
      "cves:CVE-2021-41773",
      "tech:apache",
    ]);
  });

  it("replaces only the given source on re-call (AutoRecon survives)", () => {
    db.transaction((tx) => {
      replaceForPort(tx, portId, "nmap", [{ type: "tech", value: "apache" }]);
      replaceForPort(tx, portId, "autorecon", [
        { type: "tech", value: "wordpress" },
      ]);
    });
    db.transaction((tx) =>
      replaceForPort(tx, portId, "nmap", [{ type: "tech", value: "nginx" }]),
    );
    const rows = listForPort(db, portId);
    const sorted = rows
      .map((r) => `${r.source}:${r.type}:${r.value}`)
      .sort();
    expect(sorted).toEqual([
      "autorecon:tech:wordpress",
      "nmap:tech:nginx",
    ]);
  });

  it("idempotent — same set on re-call leaves identical rows", () => {
    const set = [
      { type: "tech" as const, value: "apache" },
      { type: "banners" as const, value: "Apache httpd 2.4.49" },
    ];
    db.transaction((tx) => replaceForPort(tx, portId, "nmap", set));
    const before = listForPort(db, portId).map(
      (r) => `${r.type}:${r.value}`,
    ).sort();
    db.transaction((tx) => replaceForPort(tx, portId, "nmap", set));
    const after = listForPort(db, portId).map(
      (r) => `${r.type}:${r.value}`,
    ).sort();
    expect(after).toEqual(before);
    expect(listForPort(db, portId).length).toBe(2);
  });

  it("empty array clears the source's rows", () => {
    db.transaction((tx) =>
      replaceForPort(tx, portId, "nmap", [
        { type: "tech", value: "apache" },
      ]),
    );
    expect(listForPort(db, portId).length).toBe(1);
    db.transaction((tx) => replaceForPort(tx, portId, "nmap", []));
    expect(listForPort(db, portId).length).toBe(0);
  });

  it("listForPort filters by source when supplied", () => {
    db.transaction((tx) => {
      replaceForPort(tx, portId, "nmap", [
        { type: "tech", value: "apache" },
      ]);
      replaceForPort(tx, portId, "autorecon", [
        { type: "tech", value: "wordpress" },
      ]);
    });
    expect(listForPort(db, portId, "nmap").map((r) => r.value)).toEqual([
      "apache",
    ]);
    expect(listForPort(db, portId, "autorecon").map((r) => r.value)).toEqual([
      "wordpress",
    ]);
    expect(listForPort(db, portId).length).toBe(2);
  });
});
