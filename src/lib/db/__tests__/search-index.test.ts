import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTestDb } from "../../../../tests/helpers/db.js";
import { parseNmapXml } from "../../parser/nmap-xml.js";
import { createFromScan } from "../engagement-repo.js";
import { createFinding } from "../findings-repo.js";
import { upsertNote } from "../notes-repo.js";
import { deletePort } from "../ports-repo.js";
import { rescanEngagement } from "../scan-history-repo.js";
import { searchEngagements } from "../search.js";
import * as schema from "../schema.js";

type Db = ReturnType<typeof createTestDb>;
const MIGRATIONS = path.resolve("src/lib/db/migrations");
const databases: Db[] = [];
const scratchDirs: string[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close();
  for (const dir of scratchDirs.splice(0)) fs.rmSync(dir, { recursive: true });
});

function openDb(): Db {
  const db = createTestDb();
  databases.push(db);
  return db;
}

function scanXml(product = "Oldbanner", output = "Oldresponse"): string {
  return `<nmaprun><host><status state="up"/>
    <address addr="192.0.2.10" addrtype="ipv4"/>
    <ports><port protocol="tcp" portid="80"><state state="open"/>
      <service name="http" product="${product}"/>
      <script id="http-title" output="${output}"/>
    </port></ports></host></nmaprun>`;
}

function seed(db: Db, product?: string, output?: string) {
  const raw = scanXml(product, output);
  const { id } = createFromScan(db, parseNmapXml(raw), raw);
  const port = db.select().from(schema.ports)
    .where(eq(schema.ports.engagement_id, id))
    .get()!;
  return { id, port };
}

function reimport(db: Db, id: number) {
  const raw = scanXml("Newbanner", "Newresponse");
  rescanEngagement(db, id, parseNmapXml(raw), raw);
}

function addScreenshot(db: Db, id: number) {
  db.insert(schema.port_scripts).values({
    engagement_id: id,
    script_id: "screenshot.png",
    output: "Binarypayload",
    source: "autorecon-screenshot",
  }).run();
}

function openLegacyDb(): Db {
  // Use the real Drizzle runner and journal so the upgrade exercises the
  // same migration boundary as an existing installation at schema 0023.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "search-index-legacy-"));
  scratchDirs.push(dir);
  fs.mkdirSync(path.join(dir, "meta"));
  const journal = JSON.parse(
    fs.readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf8"),
  );
  journal.entries = journal.entries.filter(
    (entry: { idx: number }) => entry.idx < 24,
  );
  fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries) {
    fs.copyFileSync(
      path.join(MIGRATIONS, `${entry.tag}.sql`),
      path.join(dir, `${entry.tag}.sql`),
    );
  }
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  databases.push(db);
  migrate(db, { migrationsFolder: dir });
  return db;
}

describe("search index lifecycle", () => {
  it("re-import replaces searchable metadata and NSE output without accumulating hits", () => {
    const db = openDb();
    const { id, port } = seed(db);

    for (let i = 0; i < 2; i++) {
      reimport(db, id);
      expect(searchEngagements(db, "Oldbanner")).toEqual([]);
      expect(searchEngagements(db, "Oldresponse")).toEqual([]);
      expect(searchEngagements(db, "Newbanner")).toMatchObject([
        { kind: "port", refId: port.id, engagementId: id },
      ]);
      const script = db.select().from(schema.port_scripts)
        .where(eq(schema.port_scripts.port_id, port.id))
        .get()!;
      expect(searchEngagements(db, "Newresponse")).toMatchObject([
        { kind: "script", refId: script.id, engagementId: id },
      ]);
    }
  });

  it("deleting a port removes its port, script and note hits without affecting another engagement", () => {
    const db = openDb();
    const first = seed(db);
    const second = seed(db);
    upsertNote(db, first.id, first.port.id, "Portannotation");
    upsertNote(db, second.id, second.port.id, "Portannotation");

    expect(deletePort(db, first.id, first.port.id)).toBe(true);

    for (const query of ["Oldbanner", "Oldresponse", "Portannotation"]) {
      expect(searchEngagements(db, query).map((hit) => hit.engagementId))
        .toEqual([second.id]);
    }
    expect(db.$client.prepare(
      "SELECT kind FROM search_index WHERE engagement_id = ?",
    ).all(first.id)).toEqual([{ kind: "engagement" }]);
  });

  it("updates script content and keeps screenshots excluded when the source changes", () => {
    const db = openDb();
    const { id, port } = seed(db);
    const script = db.select().from(schema.port_scripts)
      .where(eq(schema.port_scripts.port_id, port.id))
      .get()!;
    const update = (patch: Partial<typeof schema.port_scripts.$inferInsert>) => {
      db.update(schema.port_scripts).set(patch)
        .where(eq(schema.port_scripts.id, script.id)).run();
    };

    update({ script_id: "Updatedscript", output: "Updatedresponse" });
    expect(searchEngagements(db, "Oldresponse")).toEqual([]);
    expect(searchEngagements(db, "Updatedscript")).toMatchObject([
      { kind: "script", refId: script.id, engagementId: id },
    ]);
    expect(searchEngagements(db, "Updatedresponse")).toHaveLength(1);

    update({ source: "autorecon-screenshot", output: "Binarypayload" });
    expect(searchEngagements(db, "Updatedscript")).toEqual([]);
    expect(searchEngagements(db, "Updatedresponse")).toEqual([]);
    expect(searchEngagements(db, "Binarypayload")).toEqual([]);

    update({ source: "autorecon", output: "Textartifact" });
    expect(searchEngagements(db, "Textartifact")).toHaveLength(1);
    db.delete(schema.port_scripts)
      .where(eq(schema.port_scripts.id, script.id)).run();
    expect(searchEngagements(db, "Textartifact")).toEqual([]);
  });

  it("deleting a host also removes its port and host-script search hits", () => {
    const db = openDb();
    const { id, port } = seed(db);
    upsertNote(db, id, port.id, "Portannotation");
    db.insert(schema.port_scripts).values({
      engagement_id: id,
      host_id: port.host_id,
      is_host_script: true,
      script_id: "hostscript",
      output: "Hostresponse",
    }).run();

    db.delete(schema.hosts).where(eq(schema.hosts.id, port.host_id!)).run();

    for (const query of [
      "Oldbanner", "Oldresponse", "Portannotation", "Hostresponse",
    ]) {
      expect(searchEngagements(db, query)).toEqual([]);
    }
  });

  it("repairs stale existing indexes on upgrade and keeps current data searchable", () => {
    const db = openLegacyDb();
    const current = seed(db);
    const removed = seed(db, "Removedbanner", "Removedresponse");
    upsertNote(db, current.id, current.port.id, "");
    upsertNote(db, removed.id, removed.port.id, "Removedannotation");
    addScreenshot(db, current.id);
    const finding = createFinding(db, {
      engagementId: current.id, portId: current.port.id,
      severity: "high", title: "Retainedfinding",
    });
    reimport(db, current.id);
    reimport(db, current.id);
    deletePort(db, removed.id, removed.port.id);

    // Demonstrate the pre-0024 defects using ordinary repository mutations.
    expect(searchEngagements(db, "Oldbanner")).toHaveLength(1);
    expect(searchEngagements(db, "Newbanner")).toEqual([]);
    expect(searchEngagements(db, "Newresponse")).toHaveLength(2);
    expect(searchEngagements(db, "Removedannotation")).toHaveLength(1);
    const unaffectedRows = db.$client.prepare(
      "SELECT * FROM search_index WHERE kind IN ('engagement', 'finding') ORDER BY kind, ref_id",
    ).all();

    migrate(db, { migrationsFolder: MIGRATIONS });

    for (const query of [
      "Oldbanner", "Oldresponse", "Removedbanner", "Removedresponse",
      "Removedannotation", "Binarypayload",
    ]) {
      expect(searchEngagements(db, query)).toEqual([]);
    }
    expect(searchEngagements(db, "Newbanner")).toHaveLength(1);
    expect(searchEngagements(db, "Newresponse")).toHaveLength(1);
    expect(searchEngagements(db, "Retainedfinding")).toMatchObject([
      { kind: "finding", refId: finding.id },
    ]);
    expect(db.$client.prepare(
      "SELECT * FROM search_index WHERE kind IN ('engagement', 'finding') ORDER BY kind, ref_id",
    ).all()).toEqual(unaffectedRows);

    // Empty notes need an index row so their existing UPDATE trigger still
    // finds it when the user starts writing after the upgrade.
    upsertNote(db, current.id, current.port.id, "Newannotation");
    expect(searchEngagements(db, "Newannotation")).toHaveLength(1);
    const indexRows = db.$client.prepare(
      "SELECT * FROM search_index ORDER BY rowid",
    ).all();
    migrate(db, { migrationsFolder: MIGRATIONS });
    expect(db.$client.prepare("SELECT * FROM search_index ORDER BY rowid").all())
      .toEqual(indexRows);
    expect(db.$client.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
    expect(db.$client.pragma("foreign_key_check")).toEqual([]);
  });
});
