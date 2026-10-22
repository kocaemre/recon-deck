import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/helpers/db.js";
import { parseNmapXml } from "../../parser/nmap-xml.js";
import { createFromScan, getById } from "../engagement-repo.js";
import { rescanEngagement } from "../scan-history-repo.js";
import { port_scripts } from "../schema.js";

function host(ip: string, scripts: Array<[string, string]>): string {
  return `<host><status state="up"/><address addr="${ip}" addrtype="ipv4"/>
    <ports><port protocol="tcp" portid="445"><state state="open"/>
      <service name="microsoft-ds"/>
      <script id="smb2-security-mode" output="Signing enabled"/>
    </port></ports>
    <hostscript>${scripts.map(([id, output]) =>
      `<script id="${id}" output="${output}"/>`).join("")}</hostscript>
  </host>`;
}

function scan(...hosts: string[]) {
  const raw = `<?xml version="1.0"?><nmaprun>${hosts.join("")}</nmaprun>`;
  return { raw, parsed: parseNmapXml(raw) };
}

describe("rescanEngagement host scripts", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => db.$client.close());

  it("refreshes an observed host's script without changing other hosts or engagements", () => {
    const initial = scan(
      host("192.0.2.10", [["smb-os-discovery", "Old DC result"]]),
      host("192.0.2.20", [["smb-os-discovery", "Workstation result"]]),
    );
    const source = createFromScan(db, initial.parsed, initial.raw);
    const unrelated = createFromScan(db, initial.parsed, initial.raw);
    const fresh = scan(host("192.0.2.10", [["smb-os-discovery", "New DC result"]]));

    rescanEngagement(db, source.id, fresh.parsed, fresh.raw);

    const full = getById(db, source.id)!;
    for (const h of full.hosts) {
      const scripts = full.hostScripts.filter((s) => s.host_id === h.id);
      expect(scripts.map((s) => s.output)).toEqual([
        h.ip === "192.0.2.10" ? "New DC result" : "Workstation result",
      ]);
    }
    expect(getById(db, unrelated.id)!.hostScripts.map((s) => s.output))
      .toEqual(["Old DC result", "Workstation result"]);
    expect(full.ports[0].scripts[0].output).toBe("Signing enabled");
  });

  it("persists host scripts for a newly discovered host", () => {
    const initial = scan(host("192.0.2.10", []));
    const source = createFromScan(db, initial.parsed, initial.raw);
    const fresh = scan(host("192.0.2.20", [["smb-os-discovery", "New host result"]]));

    rescanEngagement(db, source.id, fresh.parsed, fresh.raw);

    const full = getById(db, source.id)!;
    const newHost = full.hosts.find((h) => h.ip === "192.0.2.20")!;
    expect(full.hostScripts).toEqual([
      expect.objectContaining({
        host_id: newHost.id,
        port_id: null,
        is_host_script: true,
        source: "nmap",
        script_id: "smb-os-discovery",
        output: "New host result",
      }),
    ]);
  });

  it("updates observed script ids once and preserves unobserved scripts and AR data", () => {
    const initial = scan(host("192.0.2.10", [
      ["smb-os-discovery", "Original result"], ["smb2-time", "Earlier time"],
    ]));
    const source = createFromScan(db, initial.parsed, initial.raw);
    const hostId = getById(db, source.id)!.hosts[0].id;
    db.insert(port_scripts).values({
      engagement_id: source.id,
      host_id: hostId,
      port_id: null,
      is_host_script: true,
      source: "autorecon",
      script_id: "smb-os-discovery",
      output: "Retained AutoRecon output",
    }).run();
    const fresh = scan(host("192.0.2.10", [
      ["smb-os-discovery", "Updated result"], ["smb2-capabilities", "New result"],
    ]));

    for (let i = 0; i < 2; i++) {
      rescanEngagement(db, source.id, fresh.parsed, fresh.raw);
    }
    // An empty later hostscript block does not prove those scripts were run.
    const noScripts = scan(host("192.0.2.10", []));
    rescanEngagement(db, source.id, noScripts.parsed, noScripts.raw);

    expect(getById(db, source.id)!.hostScripts.map((s) => s.output).sort())
      .toEqual([
        "Earlier time", "New result", "Retained AutoRecon output", "Updated result",
      ]);
  });
});
