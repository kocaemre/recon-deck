import { describe, it, expect } from "vitest";
import { buildSampleScan } from "@/lib/sample-engagement";

/**
 * buildSampleScan() unit tests — UI-10 sample loader (Plan 07-03, Task 1).
 *
 * These tests lock the shape and content of the canned "Try with sample"
 * ParsedScan. Any change to the sample's port set, services, or host-script
 * id requires updating these assertions and the 07-03-SUMMARY.md.
 */
describe("buildSampleScan() (UI-10)", () => {
  const scan = buildSampleScan();

  it("targets 10.10.10.123 with hostname sample.htb", () => {
    expect(scan.target.ip).toBe("10.10.10.123");
    expect(scan.target.hostname).toBe("sample.htb");
  });

  it("returns exactly 10 ports", () => {
    expect(scan.ports.length).toBe(10);
  });

  it("port set matches HTB-easy canonical mix", () => {
    const ports = new Set(scan.ports.map((p) => p.port));
    expect(ports).toEqual(new Set([21, 22, 25, 53, 80, 110, 139, 443, 445, 3306]));
  });

  it("every port is open + tcp + has a service name", () => {
    for (const p of scan.ports) {
      expect(p.protocol).toBe("tcp");
      expect(p.state).toBe("open");
      expect(p.service).toBeTruthy();
    }
  });

  it("port 443 carries tunnel=ssl for KB matcher → https resolution", () => {
    const p443 = scan.ports.find((p) => p.port === 443)!;
    expect(p443.tunnel).toBe("ssl");
  });

  it("port 80 has http-title script", () => {
    const p80 = scan.ports.find((p) => p.port === 80)!;
    expect(p80.scripts.find((s) => s.id === "http-title")).toBeDefined();
  });

  it("hostScripts contains smb-os-discovery", () => {
    expect(scan.hostScripts.find((s) => s.id === "smb-os-discovery")).toBeDefined();
  });

  it("source is nmap-xml (no schema migration)", () => {
    expect(scan.source).toBe("nmap-xml");
  });

  it("warnings array is empty", () => {
    expect(scan.warnings).toEqual([]);
  });
});
