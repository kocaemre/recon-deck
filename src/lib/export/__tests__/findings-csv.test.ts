import { describe, it, expect } from "vitest";
import { generateFindingsCsv } from "../findings-csv";
import {
  buildFixtureViewModel,
  buildMultiHostFixtureViewModel,
} from "./fixture-vm";

describe("generateFindingsCsv (P1-H)", () => {
  it("emits a header row with locked columns", () => {
    const out = generateFindingsCsv(buildFixtureViewModel());
    expect(out.split("\r\n")[0]).toBe(
      "severity,title,host,port,protocol,service,cve,description,created_at",
    );
  });

  it("ends each line with CRLF (RFC 4180)", () => {
    const out = generateFindingsCsv(buildFixtureViewModel());
    expect(out.endsWith("\r\n")).toBe(true);
    // No bare LF before each CRLF (i.e. no \n that isn't part of \r\n).
    expect(/(?<!\r)\n/.test(out)).toBe(false);
  });

  it("escapes embedded commas + quotes per RFC 4180 §2.6", () => {
    // Build a fixture with a finding that has commas + quotes in the
    // description, then check the field is wrapped + quotes doubled.
    const vm = buildFixtureViewModel();
    vm.engagement.findings = [
      {
        id: 1,
        engagement_id: vm.engagement.id,
        port_id: null,
        severity: "high",
        title: 'Has "quotes", commas',
        description: "line one,\nstill\twith embedded \"text\"",
        cve: null,
        evidence_refs: "[]",
        created_at: "2026-04-25T00:00:00.000Z",
        updated_at: "2026-04-25T00:00:00.000Z",
      },
    ];
    const out = generateFindingsCsv(vm);
    // Header + 1 data row + trailing CRLF.
    const lines = out.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Has ""quotes"", commas"');
  });

  it("multi-host: host column carries hostname (ip)", () => {
    const vm = buildMultiHostFixtureViewModel();
    // Anchor a finding to the secondary host's RDP port so we can spot it.
    const secondaryPortId = vm.hosts[1].ports[0].port.id;
    vm.engagement.findings = [
      {
        id: 1,
        engagement_id: vm.engagement.id,
        port_id: secondaryPortId,
        severity: "medium",
        title: "RDP exposed",
        description: "",
        cve: null,
        evidence_refs: "[]",
        created_at: "2026-04-25T00:00:00.000Z",
        updated_at: "2026-04-25T00:00:00.000Z",
      },
    ];
    const out = generateFindingsCsv(vm);
    // Should reference the secondary host (ws01.htb at 10.10.10.6).
    expect(out).toContain("ws01.htb (10.10.10.6)");
    expect(out).toContain("3389");
  });
});
