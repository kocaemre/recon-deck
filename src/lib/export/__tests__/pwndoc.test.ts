import { describe, it, expect } from "vitest";
import { generatePwndoc } from "../pwndoc";
import {
  buildFixtureViewModel,
  buildMultiHostFixtureViewModel,
} from "./fixture-vm";

describe("generatePwndoc (P1-H)", () => {
  it("emits a YAML doc with the engagement name + scope block", () => {
    const out = generatePwndoc(buildFixtureViewModel());
    expect(out).toContain('name: "box.htb (10.10.10.5)"');
    expect(out).toContain("scope:");
    expect(out).toContain('  - "box.htb (10.10.10.5)"');
  });

  it("multi-host scope lists every host primary-first", () => {
    const out = generatePwndoc(buildMultiHostFixtureViewModel());
    const lines = out.split("\n");
    const scopeIdx = lines.findIndex((l) => l === "scope:");
    expect(scopeIdx).toBeGreaterThan(-1);
    expect(lines[scopeIdx + 1]).toContain("box.htb (10.10.10.5)");
    expect(lines[scopeIdx + 2]).toContain("ws01.htb (10.10.10.6)");
  });

  it("severity is rendered with PwnDoc's title-cased label", () => {
    const vm = buildFixtureViewModel();
    vm.engagement.findings = [
      {
        id: 1,
        engagement_id: vm.engagement.id,
        port_id: null,
        severity: "high",
        title: "Sample",
        description: "body line",
        cve: null,
        evidence_refs: "[]",
        created_at: "2026-04-25T00:00:00.000Z",
        updated_at: "2026-04-25T00:00:00.000Z",
      },
    ];
    const out = generatePwndoc(vm);
    expect(out).toContain('severity: "High"');
  });

  it("affected list anchors port-bound findings to host:port", () => {
    const vm = buildMultiHostFixtureViewModel();
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
    const out = generatePwndoc(vm);
    expect(out).toContain('"ws01.htb (10.10.10.6):3389/tcp"');
  });
});
