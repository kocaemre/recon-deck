/**
 * SEC-04 — URL scheme validation tests.
 *
 * Covers `isAllowedUrl` in src/lib/security/validate-url.ts which gates
 * every external href rendered from KB / user data. `javascript:` and
 * `data:` schemes are the XSS vectors — the CSP is defense in depth
 * alongside this check.
 */

import { describe, it, expect } from "vitest";
import { isAllowedUrl } from "../../src/lib/security/validate-url.js";

describe("URL scheme validation (SEC-04)", () => {
  it("allows https:// URLs", () => {
    expect(isAllowedUrl("https://book.hacktricks.xyz/smb")).toBe(true);
  });

  it("allows http:// URLs", () => {
    expect(isAllowedUrl("http://example.com/page")).toBe(true);
  });

  it("rejects javascript: scheme (XSS vector)", () => {
    expect(isAllowedUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects data: scheme", () => {
    expect(isAllowedUrl("data:text/html,<script>alert(1)</script>")).toBe(
      false,
    );
  });

  it("rejects ftp: scheme", () => {
    expect(isAllowedUrl("ftp://files.example.com/payload")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isAllowedUrl("")).toBe(false);
  });

  it("rejects malformed URL", () => {
    expect(isAllowedUrl("not-a-url")).toBe(false);
  });

  it("rejects relative path (no scheme)", () => {
    expect(isAllowedUrl("/engagements/1")).toBe(false);
  });
});
