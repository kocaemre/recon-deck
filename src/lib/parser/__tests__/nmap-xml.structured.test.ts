/**
 * RED tests for UI-11 structured-NSE parser extension.
 *
 * Wave 1 (Plan 07-01) ships these failing tests; Wave 1 (Plan 07-02) takes
 * them GREEN by extending parseNmapXml to walk <elem>/<table> children.
 *
 * Asserts the structured-extraction contract documented in
 * `src/lib/parser/types.ts` (ScriptElem / ScriptTable / ScriptOutput.structured?).
 *
 * Test fixture: `tests/fixtures/parser/xml/structured-nse.xml` — ssl-cert with
 * elem + nested table on port 443, plain http-title on port 80, smb-os-discovery
 * with 3 elems in <hostscript>.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseNmapXml } from "../nmap-xml.js";
import type { ScriptElem, ScriptTable } from "../types.js";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "tests/fixtures/parser/xml/structured-nse.xml",
);
const xml = fs.readFileSync(FIXTURE_PATH, "utf8");

function isTable(x: ScriptElem | ScriptTable): x is ScriptTable {
  return "rows" in x;
}

describe("parseNmapXml — structured NSE extraction (UI-11)", () => {
  it("populates structured field on ssl-cert (port 443) with elem + nested table", () => {
    const scan = parseNmapXml(xml);
    const port443 = scan.ports.find((p) => p.port === 443);
    expect(port443).toBeDefined();
    const sslCert = port443!.scripts.find((s) => s.id === "ssl-cert");
    expect(sslCert).toBeDefined();
    expect(sslCert!.structured).toBeDefined();
    expect(sslCert!.structured!.length).toBeGreaterThanOrEqual(3);
  });

  it('nested <table key="extensions"> appears as a ScriptTable with at least 2 rows', () => {
    const scan = parseNmapXml(xml);
    const sslCert = scan.ports
      .find((p) => p.port === 443)!
      .scripts.find((s) => s.id === "ssl-cert")!;
    const extensions = sslCert.structured!.find(
      (n) => isTable(n) && n.key === "extensions",
    ) as ScriptTable | undefined;
    expect(extensions).toBeDefined();
    expect(extensions!.rows.length).toBeGreaterThanOrEqual(2);
  });

  it("scripts without elem/table children have structured === undefined (backward compat)", () => {
    const scan = parseNmapXml(xml);
    const httpTitle = scan.ports
      .find((p) => p.port === 80)!
      .scripts.find((s) => s.id === "http-title")!;
    expect(httpTitle.structured).toBeUndefined();
  });

  it("hostScripts smb-os-discovery has at least 3 ScriptElem entries", () => {
    const scan = parseNmapXml(xml);
    const smbOs = scan.hostScripts.find((s) => s.id === "smb-os-discovery");
    expect(smbOs).toBeDefined();
    expect(smbOs!.structured).toBeDefined();
    expect(smbOs!.structured!.length).toBeGreaterThanOrEqual(3);
  });

  it("OS elem under smb-os-discovery has value 'Windows 10 Pro'", () => {
    const scan = parseNmapXml(xml);
    const smbOs = scan.hostScripts.find((s) => s.id === "smb-os-discovery")!;
    const osElem = smbOs.structured!.find(
      (n) => !isTable(n) && n.key === "OS",
    ) as ScriptElem | undefined;
    expect(osElem).toBeDefined();
    expect(osElem!.value).toContain("Windows 10 Pro");
  });

  it("elem without key attribute returns key === ''", () => {
    const xml = `<?xml version="1.0"?><nmaprun start="1700000000"><host><address addr="1.1.1.1" addrtype="ipv4"/><ports><port portid="80" protocol="tcp"><state state="open"/><service name="http"/><script id="x" output="ignored"><elem>orphan</elem></script></port></ports></host></nmaprun>`;
    const scan = parseNmapXml(xml);
    const script = scan.ports[0].scripts[0];
    expect(script.structured).toBeDefined();
    expect(script.structured![0]).toEqual({ key: "", value: "orphan" });
  });

  it("empty <elem key='x'/> returns value === ''", () => {
    const xml = `<?xml version="1.0"?><nmaprun start="1700000000"><host><address addr="1.1.1.1" addrtype="ipv4"/><ports><port portid="80" protocol="tcp"><state state="open"/><service name="http"/><script id="x" output="ignored"><elem key="empty"/></script></port></ports></host></nmaprun>`;
    const scan = parseNmapXml(xml);
    const script = scan.ports[0].scripts[0];
    expect(script.structured![0]).toEqual({ key: "empty", value: "" });
  });

  it("walks doubly-nested <table> correctly", () => {
    const xml = `<?xml version="1.0"?><nmaprun start="1700000000"><host><address addr="1.1.1.1" addrtype="ipv4"/><ports><port portid="80" protocol="tcp"><state state="open"/><service name="http"/><script id="x" output="ignored"><table key="outer"><table key="inner"><elem key="leaf">v</elem></table></table></script></port></ports></host></nmaprun>`;
    const scan = parseNmapXml(xml);
    const outer = scan.ports[0].scripts[0].structured![0] as ScriptTable;
    expect(outer.key).toBe("outer");
    const inner = outer.rows[0] as ScriptTable;
    expect(inner.key).toBe("inner");
    const leaf = inner.rows[0] as ScriptElem;
    expect(leaf).toEqual({ key: "leaf", value: "v" });
  });
});
