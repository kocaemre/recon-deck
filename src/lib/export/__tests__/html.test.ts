/**
 * Plan 06-05 Task 2 — generateHtml() tests (TDD RED → GREEN).
 *
 * Covers the 12 behaviors mandated by PLAN.md:
 *   1. Output starts with `<!DOCTYPE html>`
 *   2. Exactly one `<style>` block
 *   3. Zero `<script>` tags (D-15 hard constraint)
 *   4. Zero `<link>` tags (D-15)
 *   5. XSS payload is HTML-escaped (Security Domain — T-06-11 mitigation)
 *   6. Engagement name appears in H1 (escaped)
 *   7. Ports summary table has Port/Proto/Service/Version/Done headers
 *   8. Each port wrapped in `<section class="port-section">` with break-inside CSS
 *   9. Checkmark glyphs are the box characters (▣/□), NOT checkmark/cross (✓/✗)
 *   10. CSS palette contains #111, #fff (or #ffffff), #f5f5f5, #0a0, break-inside:avoid-page
 *   11. Per-port section order matches PortCard.tsx order
 *   12. Golden fixture byte-for-byte match via toMatchFileSnapshot
 */

import { describe, it, expect } from "vitest";
import { generateHtml } from "../html";
import { buildFixtureViewModel } from "./fixture-vm";

describe("generateHtml (Plan 06-05, EXPORT-04)", () => {
  describe("Document shape (D-15)", () => {
    it("starts with <!DOCTYPE html>", () => {
      const out = generateHtml(buildFixtureViewModel());
      expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
    });

    it("contains exactly one <style> block", () => {
      const out = generateHtml(buildFixtureViewModel());
      const matches = out.match(/<style>/g) ?? [];
      expect(matches).toHaveLength(1);
    });

    it("contains zero <script> tags (D-15 hard constraint)", () => {
      const out = generateHtml(buildFixtureViewModel());
      expect(out).not.toMatch(/<script[\s>]/);
      expect(out).not.toContain("</script>");
    });

    it("contains zero <link> tags (D-15 self-contained)", () => {
      const out = generateHtml(buildFixtureViewModel());
      expect(out).not.toMatch(/<link[\s>]/);
    });
  });

  describe("XSS escape (Security Domain — T-06-11 mitigation)", () => {
    it("the fixture XSS payload is HTML-escaped", () => {
      const out = generateHtml(buildFixtureViewModel());
      expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(out).not.toContain("<script>alert(1)</script>");
    });
  });

  describe("Content rendering", () => {
    it("renders engagement name in <h1> (escaped)", () => {
      const out = generateHtml(buildFixtureViewModel());
      // Fixture engagement name is "box.htb (10.10.10.5)" — no chars needing
      // escape, but the test proves the h1 appears.
      expect(out).toMatch(/<h1>box\.htb \(10\.10\.10\.5\)<\/h1>/);
    });

    it("has ports summary table with Port/Proto/Service/Version/Done headers", () => {
      const out = generateHtml(buildFixtureViewModel());
      expect(out).toContain("<th>Port</th>");
      expect(out).toContain("<th>Proto</th>");
      expect(out).toContain("<th>Service</th>");
      expect(out).toContain("<th>Version</th>");
      expect(out).toContain("<th>Done</th>");
    });

    it("wraps each port in <section class=\"port-section\">", () => {
      const out = generateHtml(buildFixtureViewModel());
      const sections = out.match(/<section class="port-section">/g) ?? [];
      // Fixture has 3 ports: 53, 80, 443
      expect(sections).toHaveLength(3);
    });

    it("uses box-character glyphs (▣/□), not checkmark/cross (✓/✗)", () => {
      const out = generateHtml(buildFixtureViewModel());
      expect(out).toContain("▣"); // fixture has 2 checked items
      expect(out).toContain("□"); // fixture has 1 unchecked
      expect(out).not.toContain("✓");
      expect(out).not.toContain("✗");
    });
  });

  describe("Inline CSS palette (D-14)", () => {
    it("contains required palette colors and break-inside rule", () => {
      const out = generateHtml(buildFixtureViewModel());
      expect(out).toContain("#111");
      // Accept either short (#fff) or long (#ffffff) form
      expect(out).toMatch(/#fff(?:fff)?/);
      expect(out).toContain("#f5f5f5");
      expect(out).toContain("#0a0");
      expect(out).toContain("break-inside: avoid-page");
    });
  });

  describe("Per-port section order (PortCard.tsx order)", () => {
    it("Port 80 sections appear in NSE → AR Files → KB Commands → AR Commands → Checklist → Notes order", () => {
      const out = generateHtml(buildFixtureViewModel());
      // Narrow to Port 80's section block (between its header and Port 443's header).
      const port80Start = out.indexOf("Port 80/tcp");
      const port443Start = out.indexOf("Port 443/tcp");
      expect(port80Start).toBeGreaterThan(-1);
      expect(port443Start).toBeGreaterThan(port80Start);
      const block = out.slice(port80Start, port443Start);

      // Port 80 fixture: has NSE (http-title), no AR Files, has KB Commands (gobuster),
      // no AR Commands, has Checklist (http-dir-listing checked), has non-empty Notes.
      const nseIdx = block.indexOf("NSE Output");
      const kbIdx = block.indexOf("Commands"); // first occurrence — KB Commands header
      const checklistIdx = block.indexOf("Checklist");
      const notesIdx = block.indexOf("Notes");
      expect(nseIdx).toBeGreaterThan(-1);
      expect(kbIdx).toBeGreaterThan(nseIdx);
      expect(checklistIdx).toBeGreaterThan(kbIdx);
      expect(notesIdx).toBeGreaterThan(checklistIdx);
    });
  });

  describe("Golden fixture (EXPORT-04)", () => {
    it("matches tests/golden/engagement.html byte-for-byte", async () => {
      const out = generateHtml(buildFixtureViewModel());
      await expect(out).toMatchFileSnapshot(
        "../../../../tests/golden/engagement.html",
      );
    });
  });
});
