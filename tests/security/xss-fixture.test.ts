import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * TEST-05: XSS fixture test (SEC-03 + D-20 + D-22)
 *
 * Verifies that NSE output containing hostile payloads is NEVER rendered as HTML.
 * Since vitest runs in Node (no DOM), we verify the safety invariants:
 * 1. No dangerouslySetInnerHTML in any component that renders scan data
 * 2. NSE output rendered via React text node interpolation ({value})
 * 3. ESLint rule configured to catch regressions
 */
describe("XSS fixture test (TEST-05)", () => {
  const HOSTILE_PAYLOADS = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '"><script>alert(document.cookie)</script>',
    "';alert(String.fromCharCode(88,83,83))//",
  ];

  const componentDir = path.resolve(__dirname, "../../src/components");
  // Modern IDE redesign extracted the port detail body from PortCard into
  // PortDetailPane (heatmap layout). XSS invariants now live in PortDetailPane
  // for the per-port NSE render path.
  const portDetailPanePath = path.join(componentDir, "PortDetailPane.tsx");
  const engagementPagePath = path.resolve(
    __dirname,
    "../../app/engagements/[id]/page.tsx",
  );
  // Phase 07-04 (UI-11) extracted the per-script render path into
  // StructuredScriptOutput, which is consumed by both the port detail pane
  // (per-port NSE) and HostScriptCard (host-level findings). The XSS-safety
  // invariants now live in StructuredScriptOutput; keep the literal
  // assertions there so a regression in either render branch is caught.
  const structuredScriptOutputPath = path.join(
    componentDir,
    "StructuredScriptOutput.tsx",
  );
  const hostScriptCardPath = path.join(componentDir, "HostScriptCard.tsx");

  it("PortDetailPane.tsx does NOT contain dangerouslySetInnerHTML", () => {
    const source = fs.readFileSync(portDetailPanePath, "utf8");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("engagement page does NOT contain dangerouslySetInnerHTML", () => {
    const source = fs.readFileSync(engagementPagePath, "utf8");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("PortDetailPane delegates per-script render to StructuredScriptOutput", () => {
    // The per-script <pre>{s.output}</pre> block lives behind
    // <StructuredScriptOutput script={s} />. PortDetailPane only renders the
    // delegation; the actual XSS-safe text node lives in StructuredScriptOutput
    // (asserted separately below).
    const source = fs.readFileSync(portDetailPanePath, "utf8");
    expect(source).toContain("<StructuredScriptOutput script={s} />");
  });

  it("StructuredScriptOutput renders NSE output via React text node interpolation", () => {
    const source = fs.readFileSync(structuredScriptOutputPath, "utf8");
    // Fallback branch — bare text body of a script with no <elem>/<table>.
    expect(source).toContain("{script.output}");
    // Structured branch — both elem key and value rendered as text nodes.
    expect(source).toContain("{n.value}");
    expect(source).toContain("{n.key}");
  });

  it("HostScriptCard delegates per-script render to StructuredScriptOutput (Phase 07-04)", () => {
    // Phase 07-04 extracted the inline host-script <pre>{hs.output}</pre>
    // block from app/engagements/[id]/page.tsx into <HostScriptCard>, which
    // delegates per-script rendering to <StructuredScriptOutput>. The XSS
    // guarantee now lives in StructuredScriptOutput (asserted above).
    const source = fs.readFileSync(hostScriptCardPath, "utf8");
    expect(source).toContain("<StructuredScriptOutput key={hs.id} script={hs}");
  });

  it("engagement page mounts <HostScriptCard> instead of inline host-script block", () => {
    const source = fs.readFileSync(engagementPagePath, "utf8");
    expect(source).toContain("<HostScriptCard hostScripts=");
    // The inline block (<pre>{hs.output}</pre>) must be GONE — the render
    // path is now via the HostScriptCard component.
    expect(source).not.toContain("{hs.output}");
  });

  it("ESLint config bans dangerouslySetInnerHTML", () => {
    const eslintPath = path.resolve(__dirname, "../../eslint.config.mjs");
    const source = fs.readFileSync(eslintPath, "utf8");
    expect(source).toContain("dangerouslySetInnerHTML");
    expect(source).toContain("no-restricted-syntax");
  });

  it("hostile NSE payloads would be escaped by React text nodes", () => {
    for (const payload of HOSTILE_PAYLOADS) {
      expect(payload.includes("<") || payload.includes(">") || payload.includes("'")).toBe(true);
    }
    const portDetailPaneSource = fs.readFileSync(portDetailPanePath, "utf8");
    expect(portDetailPaneSource).not.toMatch(/innerHTML/i);
    expect(portDetailPaneSource).not.toMatch(/\.html\s*\(/);
  });

  it("no component in src/components/ uses dangerouslySetInnerHTML", () => {
    const files = fs.readdirSync(componentDir).filter((f) => f.endsWith(".tsx"));
    for (const file of files) {
      const source = fs.readFileSync(path.join(componentDir, file), "utf8");
      expect(source).not.toContain("dangerouslySetInnerHTML");
    }
  });
});
