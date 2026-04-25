import { describe, it, expect } from "vitest";
import { generateSysReptor } from "../sysreptor";
import {
  buildFixtureViewModel,
  buildMultiHostFixtureViewModel,
} from "./fixture-vm";

describe("generateSysReptor (P1-H)", () => {
  it("emits valid JSON with the locked top-level shape", () => {
    const out = generateSysReptor(buildFixtureViewModel());
    const parsed = JSON.parse(out);
    expect(parsed.format).toBe("projects/v1");
    expect(parsed.recon_deck_version).toBeDefined();
    expect(parsed.name).toBeDefined();
    expect(parsed.data).toBeDefined();
    expect(Array.isArray(parsed.data.scope)).toBe(true);
    expect(Array.isArray(parsed.findings)).toBe(true);
  });

  it("scope mirrors the engagement's hosts in primary-first order", () => {
    const vm = buildMultiHostFixtureViewModel();
    const parsed = JSON.parse(generateSysReptor(vm));
    expect(parsed.data.scope).toContain("box.htb (10.10.10.5)");
    expect(parsed.data.scope).toContain("ws01.htb (10.10.10.6)");
    expect(parsed.data.target_count).toBe(2);
  });

  it("each finding carries title + severity + recon_deck_finding_id", () => {
    const vm = buildFixtureViewModel();
    vm.engagement.findings = [
      {
        id: 7,
        engagement_id: vm.engagement.id,
        port_id: null,
        severity: "critical",
        title: "RCE via outdated component",
        description: "Apache Struts 2.5.10 — CVE-2017-5638",
        cve: "CVE-2017-5638",
        evidence_refs: "[]",
        created_at: "2026-04-25T00:00:00.000Z",
        updated_at: "2026-04-25T00:00:00.000Z",
      },
    ];
    const parsed = JSON.parse(generateSysReptor(vm));
    expect(parsed.findings).toHaveLength(1);
    const f = parsed.findings[0];
    expect(f.id).toBe("recon-deck-finding-7");
    expect(f.status).toBe("open");
    expect(f.data.title).toBe("RCE via outdated component");
    expect(f.data.severity).toBe("critical");
    expect(f.data.cve).toBe("CVE-2017-5638");
    expect(f.data.recon_deck_finding_id).toBe(7);
    // Engagement-level finding (port_id === null) → all scope items.
    expect(f.data.affected_components.length).toBeGreaterThan(0);
  });

  it("port-bound finding's affected_components reference its host:port", () => {
    const vm = buildMultiHostFixtureViewModel();
    const secondaryPortId = vm.hosts[1].ports[0].port.id;
    vm.engagement.findings = [
      {
        id: 1,
        engagement_id: vm.engagement.id,
        port_id: secondaryPortId,
        severity: "high",
        title: "RDP exposed",
        description: "",
        cve: null,
        evidence_refs: "[]",
        created_at: "2026-04-25T00:00:00.000Z",
        updated_at: "2026-04-25T00:00:00.000Z",
      },
    ];
    const parsed = JSON.parse(generateSysReptor(vm));
    expect(parsed.findings[0].data.affected_components).toEqual([
      "ws01.htb (10.10.10.6):3389/tcp",
    ]);
  });
});
