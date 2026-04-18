/**
 * Plan 06-05 Task 1 — escapeHtml unit tests (TDD RED → GREEN).
 *
 * escapeHtml is the security-critical boundary between untrusted dynamic
 * content (NSE output, notes, service names) and the HTML export template
 * string. Unlike React components (which auto-escape children), template
 * string concatenation does NOT auto-escape, so every dynamic value routed
 * into html.ts MUST pass through this function.
 *
 * Tests encode the 5-character coverage mandated by RESEARCH.md Security
 * Domain plus the ampersand-first ordering invariant (otherwise `&lt;` in
 * user input would survive unescaped).
 */

import { describe, it, expect } from "vitest";
import { escapeHtml } from "../escape";

describe("escapeHtml (Plan 06-05, RESEARCH.md Security Domain)", () => {
  it("escapes angle brackets (< and >)", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
  });

  it("escapes ampersand", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("escapes double-quote", () => {
    expect(escapeHtml('say "hi"')).toBe("say &quot;hi&quot;");
  });

  it("escapes single-quote (apostrophe)", () => {
    expect(escapeHtml("it's")).toBe("it&#x27;s");
  });

  it("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("escapes ampersand BEFORE angle brackets (order invariant)", () => {
    // If the order were wrong, `&lt;` in input would become `&lt;` (unchanged),
    // but with the correct order it becomes `&amp;lt;` (the literal text).
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("fully escapes the fixture XSS payload", () => {
    const payload = "<script>alert(1)</script>";
    expect(escapeHtml(payload)).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
