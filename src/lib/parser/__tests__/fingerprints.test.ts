import { describe, expect, it } from "vitest";
import { extractNmapFingerprints } from "../fingerprints.js";
import type { ParsedPort } from "../types.js";

function makePort(overrides: Partial<ParsedPort> = {}): ParsedPort {
  return {
    port: 80,
    protocol: "tcp",
    state: "open",
    scripts: [],
    ...overrides,
  };
}

describe("extractNmapFingerprints (v2.4.0 P2 #27)", () => {
  describe("tech tags", () => {
    it("flags apache from product banner", () => {
      const fps = extractNmapFingerprints(
        makePort({ service: "http", product: "Apache httpd", version: "2.4.49" }),
      );
      expect(fps.some((f) => f.type === "tech" && f.value === "apache")).toBe(true);
    });

    it("flags wordpress before apache when both present (specific wins)", () => {
      const fps = extractNmapFingerprints(
        makePort({
          service: "http",
          product: "Apache httpd",
          version: "2.4.49",
          scripts: [
            { id: "http-generator", output: "WordPress 5.8" },
          ],
        }),
      );
      const tech = fps.filter((f) => f.type === "tech").map((f) => f.value);
      expect(tech).toContain("wordpress");
      expect(tech).toContain("apache");
      expect(tech.indexOf("wordpress")).toBeLessThan(tech.indexOf("apache"));
    });

    it("flags php from X-Powered-By header in script output", () => {
      const fps = extractNmapFingerprints(
        makePort({
          service: "http",
          scripts: [
            {
              id: "http-server-header",
              output: "Server: Apache/2.4.49\nX-Powered-By: PHP/7.4.3",
            },
          ],
        }),
      );
      const tech = fps.filter((f) => f.type === "tech").map((f) => f.value);
      expect(tech).toContain("php");
      expect(tech).toContain("apache");
    });

    it("dedupes tech tags across multiple sources", () => {
      const fps = extractNmapFingerprints(
        makePort({
          product: "OpenSSH",
          version: "7.2p2",
          extrainfo: "OpenSSH protocol 2",
          scripts: [{ id: "ssh2-enum-algos", output: "OpenSSH banner" }],
        }),
      );
      const opensshCount = fps.filter(
        (f) => f.type === "tech" && f.value === "openssh",
      ).length;
      expect(opensshCount).toBe(1);
    });

    it("emits no tech tag for an unknown service", () => {
      const fps = extractNmapFingerprints(
        makePort({ service: "thisis-not-a-known-tag" }),
      );
      expect(fps.some((f) => f.type === "tech")).toBe(false);
    });
  });

  describe("CVE extraction", () => {
    it("pulls CVEs out of NSE script output", () => {
      const fps = extractNmapFingerprints(
        makePort({
          scripts: [
            {
              id: "vulners",
              output:
                "CVE-2011-2523 vsFTPd backdoor\nCVE-2015-3306 mod_copy RCE",
            },
          ],
        }),
      );
      const cves = fps.filter((f) => f.type === "cves").map((f) => f.value);
      expect(cves).toContain("CVE-2011-2523");
      expect(cves).toContain("CVE-2015-3306");
    });

    it("uppercases lowercase CVE references", () => {
      const fps = extractNmapFingerprints(
        makePort({
          scripts: [{ id: "x", output: "cve-2021-44228 log4shell" }],
        }),
      );
      const cves = fps.filter((f) => f.type === "cves").map((f) => f.value);
      expect(cves).toContain("CVE-2021-44228");
    });

    it("dedupes the same CVE referenced multiple times", () => {
      const fps = extractNmapFingerprints(
        makePort({
          product: "Bad/CVE-2020-1234",
          scripts: [
            { id: "a", output: "see CVE-2020-1234 advisory" },
            { id: "b", output: "patch for cve-2020-1234" },
          ],
        }),
      );
      const cves = fps.filter(
        (f) => f.type === "cves" && f.value === "CVE-2020-1234",
      );
      expect(cves.length).toBe(1);
    });
  });

  describe("banners", () => {
    it("joins product + version + extrainfo into a single banner", () => {
      const fps = extractNmapFingerprints(
        makePort({
          product: "Apache httpd",
          version: "2.4.49",
          extrainfo: "(Ubuntu)",
        }),
      );
      const banners = fps
        .filter((f) => f.type === "banners")
        .map((f) => f.value);
      expect(banners).toEqual(["Apache httpd 2.4.49 (Ubuntu)"]);
    });

    it("emits no banner when product/version/extrainfo are all absent", () => {
      const fps = extractNmapFingerprints(makePort({ service: "http" }));
      expect(fps.some((f) => f.type === "banners")).toBe(false);
    });

    it("trims whitespace and skips empty segments", () => {
      const fps = extractNmapFingerprints(
        makePort({
          product: "  Nginx  ",
          version: "",
          extrainfo: "1.18.0",
        }),
      );
      const banners = fps
        .filter((f) => f.type === "banners")
        .map((f) => f.value);
      expect(banners).toEqual(["Nginx 1.18.0"]);
    });
  });

  it("returns empty array for a port with no signals", () => {
    expect(extractNmapFingerprints(makePort({ service: "unknown" }))).toEqual(
      [],
    );
  });

  it("ordering is deterministic: tech, then cves, then banners", () => {
    const fps = extractNmapFingerprints(
      makePort({
        product: "Apache httpd",
        version: "2.4.49",
        scripts: [{ id: "vulners", output: "CVE-2021-41773" }],
      }),
    );
    const types = fps.map((f) => f.type);
    expect(types.indexOf("tech")).toBeLessThan(types.indexOf("cves"));
    expect(types.indexOf("cves")).toBeLessThan(types.indexOf("banners"));
  });
});
