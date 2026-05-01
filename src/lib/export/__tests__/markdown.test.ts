/**
 * Plan 06-03 — generateMarkdown() unit tests.
 *
 * Covers EXPORT-01 (Markdown body structure) and EXPORT-02 (Obsidian
 * frontmatter schema).
 *
 * Structure:
 *   describe("Frontmatter")         — EXPORT-02 schema + array block-list +
 *                                     null/empty key omission + coverage
 *                                     integer + deterministic exported_at.
 *   describe("Body")                — EXPORT-01 body structure: H1, summary
 *                                     table, per-port H2, PortCard section
 *                                     order, skip-empty sections, GFM task
 *                                     lists, NSE fenced blocks, host scripts.
 *   describe("Golden Fixture")      — byte-for-byte snapshot of the fixture
 *                                     EngagementViewModel against
 *                                     tests/golden/engagement.md.
 */

import { describe, it, expect } from "vitest";
import { generateMarkdown } from "../markdown";
import {
  buildFixtureViewModel,
  buildMultiHostFixtureViewModel,
  FIXTURE_EXPORTED_AT,
  type EngagementViewModel,
} from "./fixture-vm";

/**
 * Convenience: build the fixture view model and render it with the pinned
 * exported_at so assertions can inspect the deterministic output.
 */
function renderFixture(): string {
  return generateMarkdown(buildFixtureViewModel(), {
    exportedAt: FIXTURE_EXPORTED_AT,
  });
}

/** Slice the frontmatter block (between the first two `---` lines). */
function extractFrontmatter(md: string): string {
  const lines = md.split("\n");
  const firstFence = lines.indexOf("---");
  expect(firstFence).toBe(0);
  const secondFence = lines.indexOf("---", firstFence + 1);
  expect(secondFence).toBeGreaterThan(firstFence);
  return lines.slice(firstFence + 1, secondFence).join("\n");
}

/** Slice the H2 block for a given `## Port <p>/<proto>` heading. */
function extractPortBlock(md: string, port: number, proto: string): string {
  const lines = md.split("\n");
  const heading = `## Port ${port}/${proto}`;
  const start = lines.findIndex((l) => l.startsWith(heading));
  expect(start).toBeGreaterThanOrEqual(0);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

// ---------------------------------------------------------------------------
// Frontmatter (EXPORT-02)
// ---------------------------------------------------------------------------

describe("generateMarkdown — Frontmatter (EXPORT-02)", () => {
  it("emits --- delimiters at top and bottom of frontmatter", () => {
    const md = renderFixture();
    expect(md).toMatch(/^---\n[\s\S]*?\n---\n/);
    const fenceCount = md.split("\n").filter((l) => l === "---").length;
    expect(fenceCount).toBe(2);
  });

  it("contains all 11 required keys in order + exported_at", () => {
    const md = renderFixture();
    const fm = extractFrontmatter(md);

    // Keys must appear in this exact order (EXPORT-02 + plan truths[1]).
    // aliases and os may be omitted when source data is null/empty (see
    // subsequent tests) — but in the fixture, os_name is set and aliases is
    // absent entirely. Verify the keys that ARE present appear in order.
    const indexOf = (key: string): number => fm.indexOf(`\n${key}:`);
    // Leading key (first line) has no preceding newline — match specially.
    const indexOfFirst = fm.startsWith("target:") ? 0 : -1;
    expect(indexOfFirst).toBe(0);

    const ip = indexOf("ip");
    const engagement = indexOf("engagement");
    const status = indexOf("status");
    const os = indexOf("os");
    const ports = indexOf("ports");
    const coverage = indexOf("coverage");
    const tags = indexOf("tags");
    const version = indexOf("recon-deck-version");
    const exportedAt = indexOf("exported_at");

    // All present (> 0) and strictly increasing.
    expect(ip).toBeGreaterThan(0);
    expect(engagement).toBeGreaterThan(ip);
    expect(status).toBeGreaterThan(engagement);
    expect(os).toBeGreaterThan(status);
    expect(ports).toBeGreaterThan(os);
    expect(coverage).toBeGreaterThan(ports);
    expect(tags).toBeGreaterThan(coverage);
    expect(version).toBeGreaterThan(tags);
    expect(exportedAt).toBeGreaterThan(version);
  });

  it("array fields use block-list (dash) form", () => {
    const md = renderFixture();
    // Ports listed as block form, indented two spaces with a dash.
    expect(md).toMatch(/\nports:\n  - 53\/udp\n  - 80\/tcp\n  - 443\/tcp\n/);
    // Tags in block form too.
    expect(md).toMatch(/\ntags:\n  - recon-deck\n  - pentest\n/);
  });

  it("omits optional keys when source data is null (hostname, os, aliases)", () => {
    const base = buildFixtureViewModel();
    // Clone engagement with nulled-out optional fields. The rest of the view
    // model is unchanged — the spread copies array refs (fine for this test).
    const nullified: EngagementViewModel = {
      ...base,
      engagement: {
        ...base.engagement,
        os_name: null,
        // Migration 0009: hostname now lives on the primary host row.
        hosts: base.engagement.hosts.map((h, i) =>
          i === 0 ? { ...h, hostname: null } : h,
        ),
      },
    };
    const md = generateMarkdown(nullified, { exportedAt: FIXTURE_EXPORTED_AT });
    const fm = extractFrontmatter(md);
    // None of these keys should appear when source data is null.
    expect(fm).not.toMatch(/^hostname:/m);
    expect(fm).not.toMatch(/^os:/m);
    expect(fm).not.toMatch(/^aliases:/m);
    // Must NEVER render as explicit null.
    expect(fm).not.toContain("hostname: null");
    expect(fm).not.toContain("os: null");
  });

  it("includes hostname and os when source data is present", () => {
    const md = renderFixture();
    const fm = extractFrontmatter(md);
    expect(fm).toMatch(/^hostname: "box\.htb"$/m);
    expect(fm).toMatch(/^os: "Linux 5\.x"$/m);
  });

  it("coverage is an unquoted integer (not a string with %)", () => {
    const md = renderFixture();
    // Unquoted integer form: `coverage: 67` on its own line.
    expect(md).toMatch(/^coverage: \d+$/m);
    // No occurrence of quoted form.
    expect(md).not.toMatch(/coverage: "/);
    // No percent sign suffix in the frontmatter value.
    expect(md).not.toMatch(/^coverage: \d+%$/m);
  });

  it("exported_at is injected deterministically via opts.exportedAt", () => {
    const md = generateMarkdown(buildFixtureViewModel(), {
      exportedAt: "2026-04-17T12:00:00.000Z",
    });
    expect(md).toContain('exported_at: "2026-04-17T12:00:00.000Z"');
  });

  it("recon-deck-version is quoted (string, not integer)", () => {
    const md = renderFixture();
    expect(md).toMatch(/^recon-deck-version: "0\.0\.0-test"$/m);
  });
});

// ---------------------------------------------------------------------------
// Body (EXPORT-01)
// ---------------------------------------------------------------------------

describe("generateMarkdown — Body (EXPORT-01)", () => {
  it("H1 is engagement name", () => {
    const md = renderFixture();
    expect(md).toMatch(/^# box\.htb \(10\.10\.10\.5\)$/m);
  });

  it("## Ports summary table uses GFM pipe format", () => {
    const md = renderFixture();
    expect(md).toMatch(/^## Ports$/m);
    expect(md).toContain("| Port | Proto | Service | Version | Done |");
    expect(md).toContain("|------|-------|---------|---------|------|");
    // Rows appear for each port.
    expect(md).toMatch(/\| 53 \| udp \| domain \|/);
    expect(md).toMatch(/\| 80 \| tcp \| http \| Apache 2\.4\.52 \|/);
    expect(md).toMatch(/\| 443 \| tcp \| https \| nginx 1\.18 \|/);
  });

  it("per-port H2 heading uses em-dash and parenthesized version", () => {
    const md = renderFixture();
    expect(md).toMatch(/^## Port 80\/tcp — http \(Apache 2\.4\.52\)$/m);
    expect(md).toMatch(/^## Port 443\/tcp — https \(nginx 1\.18\)$/m);
    // UDP port with no product/version still renders a clean heading.
    expect(md).toMatch(/^## Port 53\/udp — domain$/m);
  });

  it("port 80 section order is NSE → KB Commands → Checklist → Notes", () => {
    const md = renderFixture();
    const block = extractPortBlock(md, 80, "tcp");
    const iNse = block.indexOf("### NSE Output");
    const iCommands = block.indexOf("### Commands");
    const iChecklist = block.indexOf("### Checklist");
    const iNotes = block.indexOf("### Notes");
    expect(iNse).toBeGreaterThanOrEqual(0);
    expect(iCommands).toBeGreaterThan(iNse);
    expect(iChecklist).toBeGreaterThan(iCommands);
    expect(iNotes).toBeGreaterThan(iChecklist);
    // Port 80 has no AR data — those sections must NOT appear.
    expect(block).not.toContain("### AutoRecon Files");
    expect(block).not.toContain("### AutoRecon Commands");
  });

  it("port 443 section order is NSE → AR Files → KB Commands → AR Commands → Checklist", () => {
    const md = renderFixture();
    const block = extractPortBlock(md, 443, "tcp");
    const iNse = block.indexOf("### NSE Output");
    const iArFiles = block.indexOf("### AutoRecon Files");
    const iCommands = block.indexOf("### Commands");
    const iArCommands = block.indexOf("### AutoRecon Commands");
    const iChecklist = block.indexOf("### Checklist");
    // All sections present for port 443.
    expect(iNse).toBeGreaterThanOrEqual(0);
    expect(iArFiles).toBeGreaterThan(iNse);
    expect(iCommands).toBeGreaterThan(iArFiles);
    expect(iArCommands).toBeGreaterThan(iCommands);
    expect(iChecklist).toBeGreaterThan(iArCommands);
    // Port 443 notes is null — NO ### Notes section should appear in its block.
    expect(block).not.toContain("### Notes");
  });

  it("empty Notes section is omitted for port with empty-string notes (port 53)", () => {
    const md = renderFixture();
    const block = extractPortBlock(md, 53, "udp");
    // Port 53 notes body is "" — section must be fully omitted (D-06).
    expect(block).not.toContain("### Notes");
    // No '(none)' filler either.
    expect(block).not.toContain("(none)");
  });

  it("empty NSE / AR Files / AR Commands sections are omitted for port 53", () => {
    const md = renderFixture();
    const block = extractPortBlock(md, 53, "udp");
    expect(block).not.toContain("### NSE Output");
    expect(block).not.toContain("### AutoRecon Files");
    expect(block).not.toContain("### AutoRecon Commands");
    // Checklist and KB Commands DO appear for port 53.
    expect(block).toContain("### Commands");
    expect(block).toContain("### Checklist");
  });

  it("checklist uses lowercase - [x] / - [ ]", () => {
    const md = renderFixture();
    // Port 80 has one checked check (http-dir-listing).
    expect(md).toMatch(/^- \[x\] Check for directory listing$/m);
    // Port 443 has one unchecked check (ssl-cert-check).
    expect(md).toMatch(/^- \[ \] Inspect TLS certificate$/m);
    // NEVER uppercase X.
    expect(md).not.toMatch(/- \[X\]/);
  });

  it("NSE output is fenced with ```text and preserves raw payload verbatim", () => {
    const md = renderFixture();
    expect(md).toContain("```text\n");
    // D-07: Markdown preserves raw NSE output; escaping is ONLY for HTML.
    expect(md).toContain("<script>alert(1)</script> Site Title");
  });

  it("host scripts appear under ## Host Scripts", () => {
    const md = renderFixture();
    expect(md).toMatch(/^## Host Scripts$/m);
    expect(md).toContain("**smb-os-discovery**");
    expect(md).toContain("OS: Windows Server 2019");
  });

  it("does NOT include raw_input (D-07)", () => {
    const md = renderFixture();
    // The fixture's raw_input is "example.zip" — must not appear anywhere.
    expect(md).not.toContain("raw_input");
    expect(md).not.toContain("example.zip");
  });

  it("command bullets include label and interpolated command", () => {
    const md = renderFixture();
    // Port 443 KB command (interpolated with IP).
    expect(md).toContain("- **openssl s_client:** `openssl s_client -connect 10.10.10.5:443`");
    // Port 443 AR command (from fixture port_commands — interpolated).
    expect(md).toContain("- **nikto:** `nikto -h 10.10.10.5:443`");
  });
});

// ---------------------------------------------------------------------------
// v1.3.0 #9 — writeup section
// ---------------------------------------------------------------------------

describe("generateMarkdown — writeup", () => {
  it("emits ## Writeup section after the H1 when non-empty", () => {
    const vm = buildFixtureViewModel();
    vm.engagement = {
      ...vm.engagement,
      writeup: "Found a critical RCE on port 80.\nPivoted to DC.",
    };
    const md = generateMarkdown(vm, { exportedAt: FIXTURE_EXPORTED_AT });
    const h1 = md.indexOf("# box.htb (10.10.10.5)");
    const writeup = md.indexOf("## Writeup");
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(writeup).toBeGreaterThan(h1);
    expect(md).toContain("Found a critical RCE on port 80.");
    expect(md).toContain("Pivoted to DC.");
    // Trailing separator before the rest of the report.
    expect(md).toMatch(/## Writeup[\s\S]*?\n---/);
    // ## Writeup must precede the ports table / first per-host block.
    const ports = md.indexOf("## Ports");
    if (ports >= 0) expect(writeup).toBeLessThan(ports);
  });

  it("omits the ## Writeup section when the field is empty / whitespace", () => {
    const md = renderFixture();
    expect(md).not.toContain("## Writeup");
  });
});

// ---------------------------------------------------------------------------
// Golden Fixture (EXPORT-02 byte-diff)
// ---------------------------------------------------------------------------

describe("generateMarkdown — Golden Fixture (EXPORT-02)", () => {
  /**
   * Byte-for-byte golden fixture test. The reference file lives at
   * `tests/golden/engagement.md`.
   *
   * Refresh workflow when the fixture intentionally changes:
   *   1. `npm test -- --update src/lib/export/__tests__/markdown.test.ts`
   *   2. Review the diff of `tests/golden/engagement.md` carefully.
   *   3. Commit both the generator change and the refreshed golden fixture.
   */
  it("matches byte-for-byte snapshot", async () => {
    const output = generateMarkdown(buildFixtureViewModel(), {
      exportedAt: FIXTURE_EXPORTED_AT,
    });
    await expect(output).toMatchFileSnapshot(
      "../../../../tests/golden/engagement.md",
    );
  });
});

describe("generateMarkdown — multi-host (P1-F PR 3)", () => {
  it("emits a per-host H2 header for each host with primary suffix", () => {
    const out = generateMarkdown(buildMultiHostFixtureViewModel(), {
      exportedAt: FIXTURE_EXPORTED_AT,
    });
    // Primary host gets the · primary suffix; secondary host has no suffix.
    expect(out).toContain("## Host: box.htb (10.10.10.5) · primary");
    expect(out).toContain("## Host: ws01.htb (10.10.10.6)");
    expect(out).not.toContain("## Host: ws01.htb (10.10.10.6) · primary");
  });

  it("single-host fixture does NOT emit a host header (legacy layout intact)", () => {
    const out = generateMarkdown(buildFixtureViewModel(), {
      exportedAt: FIXTURE_EXPORTED_AT,
    });
    expect(out).not.toContain("## Host:");
  });

  it("multi-host body still contains every port section", () => {
    const out = generateMarkdown(buildMultiHostFixtureViewModel(), {
      exportedAt: FIXTURE_EXPORTED_AT,
    });
    // Primary host's three ports + secondary host's RDP port.
    expect(out).toContain("## Port 53/udp");
    expect(out).toContain("## Port 80/tcp");
    expect(out).toContain("## Port 443/tcp");
    expect(out).toContain("## Port 3389/tcp");
  });
});
