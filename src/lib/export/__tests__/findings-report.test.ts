import { describe, it, expect } from "vitest";
import { buildFixtureViewModel } from "./fixture-vm";
import { generateMarkdown } from "../markdown";
import { generateJson } from "../json";
import { generateHtml } from "../html";

/**
 * Regression for the reporting-correctness bug: findings were rendered in the
 * CSV / SysReptor / PwnDoc exports but silently dropped from the Markdown /
 * JSON / HTML reports — the formats operators actually share. These assert all
 * three now carry findings (severity-sorted, with affected host/port resolved).
 */

type Finding = ReturnType<
  typeof buildFixtureViewModel
>["engagement"]["findings"][number];

function vmWithFindings() {
  const vm = buildFixtureViewModel();
  const base = {
    engagement_id: 1,
    evidenceRefs: [] as number[],
    created_at: "2026-06-18T00:00:00.000Z",
    updated_at: "2026-06-18T00:00:00.000Z",
  };
  const findings = [
    {
      ...base,
      id: 1,
      port_id: 3, // PORT_A_ID → 443/tcp https on the primary host
      severity: "medium",
      title: "SMB signing not required",
      description: "Signing disabled; relay candidate.",
      cve: null,
    },
    {
      ...base,
      id: 2,
      port_id: null, // engagement-level
      severity: "high",
      title: "Reused local admin <creds>",
      description: "",
      cve: "CVE-2024-1234",
    },
  ] as unknown as Finding[];
  // buildFixtureViewModel() returns a shared object graph — clone the top level
  // + engagement so injecting findings doesn't leak into other tests.
  return { ...vm, engagement: { ...vm.engagement, findings } };
}

describe("findings in report exports (markdown / json / html)", () => {
  it("markdown: severity-sorted Findings section with affected + cve", () => {
    const md = generateMarkdown(vmWithFindings(), {
      exportedAt: "2026-06-18T00:00:00.000Z",
    });
    expect(md).toContain("## Findings");
    // high before medium
    const high = md.indexOf("[High] Reused local admin");
    const medium = md.indexOf("[Medium] SMB signing not required");
    expect(high).toBeGreaterThan(-1);
    expect(medium).toBeGreaterThan(high);
    expect(md).toContain("Signing disabled; relay candidate.");
    expect(md).toContain("CVE-2024-1234");
    expect(md).toContain("Affected:"); // the port-linked finding
    expect(md).toContain("443/tcp");
  });

  it("json: findings array carries every finding with resolved affected", () => {
    const parsed = JSON.parse(generateJson(vmWithFindings()));
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.findings[0].severity).toBe("high"); // sorted
    expect(parsed.findings[0].cve).toBe("CVE-2024-1234");
    expect(parsed.findings[0].affected).toBeNull();
    const portLinked = parsed.findings.find(
      (f: { title: string }) => f.title === "SMB signing not required",
    );
    expect(portLinked.affected.port).toBe(443);
  });

  it("json: findings is an empty array when there are none", () => {
    const parsed = JSON.parse(generateJson(buildFixtureViewModel()));
    expect(parsed.findings).toEqual([]);
  });

  it("html: Findings section escapes user content", () => {
    const html = generateHtml(vmWithFindings());
    expect(html).toContain("<h2>Findings</h2>");
    expect(html).toContain("Reused local admin &lt;creds&gt;");
    expect(html).not.toContain("admin <creds>");
  });
});
