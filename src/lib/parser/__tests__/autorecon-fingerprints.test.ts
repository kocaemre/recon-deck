import { describe, expect, it } from "vitest";
import {
  extractAutoReconFingerprints,
  type AutoReconFile,
} from "../autorecon-fingerprints.js";

function file(filename: string, content: string): AutoReconFile {
  return { filename, content, encoding: "utf8" };
}

describe("extractAutoReconFingerprints (v2.4.0 P3 #28)", () => {
  it("returns empty for no files", () => {
    expect(extractAutoReconFingerprints([])).toEqual([]);
  });

  describe("shared keyword tagging (whatweb / nikto)", () => {
    it("tags wordpress + apache from a whatweb plaintext line", () => {
      const fps = extractAutoReconFingerprints([
        file(
          "tcp_80_http_whatweb.txt",
          "http://10.0.0.1 [200 OK] Apache[2.4.49], WordPress[5.8.1], PHP[7.4.3]",
        ),
      ]);
      const tech = fps.filter((f) => f.type === "tech").map((f) => f.value);
      expect(tech).toContain("wordpress");
      expect(tech).toContain("apache");
      expect(tech).toContain("php");
    });

    it("dedupes when the same tag is hinted by multiple files", () => {
      const fps = extractAutoReconFingerprints([
        file("tcp_80_http_whatweb.txt", "WordPress[5.8]"),
        file(
          "tcp_80_http_nikto.txt",
          "+ Server: Apache\n+ /wp-login.php detected — WordPress",
        ),
      ]);
      const wpCount = fps.filter(
        (f) => f.type === "tech" && f.value === "wordpress",
      ).length;
      expect(wpCount).toBe(1);
    });

    it("skips base64 files (binary screenshots)", () => {
      const fps = extractAutoReconFingerprints([
        {
          filename: "screenshot-php.png",
          content: "<<base64-blob-mentioning-php>>",
          encoding: "base64",
        },
      ]);
      expect(fps).toEqual([]);
    });
  });

  describe("CVE extraction", () => {
    it("pulls CVEs out of nikto output", () => {
      const fps = extractAutoReconFingerprints([
        file(
          "tcp_80_nikto.txt",
          "+ OSVDB-3268: /icons/: Directory indexing found.\n+ CVE-2021-41773 path traversal",
        ),
      ]);
      const cves = fps.filter((f) => f.type === "cves").map((f) => f.value);
      expect(cves).toContain("CVE-2021-41773");
    });
  });

  describe("feroxbuster extension heuristic", () => {
    it("tags php when 3+ .php paths appear in feroxbuster output", () => {
      const lines = [
        "200      GET    http://10.0.0.1/index.php",
        "200      GET    http://10.0.0.1/login.php",
        "200      GET    http://10.0.0.1/admin/dashboard.php",
        "200      GET    http://10.0.0.1/static/css/site.css",
      ];
      const fps = extractAutoReconFingerprints([
        file("tcp_80_http_feroxbuster.txt", lines.join("\n")),
      ]);
      const tech = fps.filter((f) => f.type === "tech").map((f) => f.value);
      expect(tech).toContain("php");
    });

    it("skips below-threshold extension counts", () => {
      const fps = extractAutoReconFingerprints([
        file(
          "tcp_80_http_feroxbuster.txt",
          [
            "200      GET    http://10.0.0.1/index.php",
            "200      GET    http://10.0.0.1/static/site.css",
            "200      GET    http://10.0.0.1/static/site.js",
          ].join("\n"),
        ),
      ]);
      const tech = fps.filter((f) => f.type === "tech").map((f) => f.value);
      expect(tech).not.toContain("php");
    });

    it("only counts URL/path-shaped extensions, not bare words", () => {
      // The string `php` appears, but no path with `.php` extension —
      // shouldn't trip the feroxbuster heuristic. Keyword matcher will
      // still see "php" and tag it via the X-Powered-By needle if
      // present, but a bare line shouldn't tag from extensions alone.
      const fps = extractAutoReconFingerprints([
        file(
          "tcp_80_feroxbuster.txt",
          ["[ERROR] could not connect", "Scanning for php files"].join("\n"),
        ),
      ]);
      const techFromFerox = fps.filter(
        (f) => f.type === "tech" && f.value === "php",
      );
      // The keyword matcher *can* tag "php" if 'php' substring matches;
      // we only want to confirm the extension heuristic isn't the source.
      // Since the haystack has "php" without a path, the keyword needle
      // `php/` and `x-powered-by: php` both fail — no tag expected.
      expect(techFromFerox.length).toBe(0);
    });

    it("dedupes asp + aspx into a single asp.net tag", () => {
      const lines = [
        "200      GET    http://10.0.0.1/login.asp",
        "200      GET    http://10.0.0.1/admin.asp",
        "200      GET    http://10.0.0.1/api.aspx",
        "200      GET    http://10.0.0.1/sso.aspx",
        "200      GET    http://10.0.0.1/handler.ashx",
      ];
      const fps = extractAutoReconFingerprints([
        file("tcp_443_https_feroxbuster.txt", lines.join("\n")),
      ]);
      const aspCount = fps.filter(
        (f) => f.type === "tech" && f.value === "asp.net",
      ).length;
      expect(aspCount).toBe(1);
    });

    it("filename without a discovery-tool hint does NOT trigger ext tally", () => {
      // Same content, but filename doesn't match feroxbuster|gobuster|... —
      // ext tally should not fire. Output may still match keyword needles
      // (e.g. `php/`); we assert the extension-only signal is absent.
      const lines = [
        "/index.php",
        "/login.php",
        "/admin.php",
      ];
      const fps = extractAutoReconFingerprints([
        file("tcp_80_curl_output.txt", lines.join("\n")),
      ]);
      // `php/` keyword matches (`/index.php` etc. don't satisfy the
      // exact `php/` needle, only `.php`), so php may or may not appear
      // — the check here is that the file isn't a discovery tool, so
      // the heuristic is skipped. We assert no `php` tag to make sure.
      const tech = fps.filter((f) => f.type === "tech").map((f) => f.value);
      expect(tech).not.toContain("php");
    });
  });

  it("ordering is deterministic: keyword tech, ext-derived tech, cves", () => {
    const fps = extractAutoReconFingerprints([
      file("tcp_80_http_whatweb.txt", "Apache[2.4.49]"),
      file(
        "tcp_80_http_feroxbuster.txt",
        ["/a.php", "/b.php", "/c.php"].map((p) => `200 GET http://x${p}`).join("\n"),
      ),
      file("tcp_80_http_nikto.txt", "CVE-2021-41773"),
    ]);
    // tech first, cves last
    const tech = fps.filter((f) => f.type === "tech").map((f) => f.value);
    const cves = fps.filter((f) => f.type === "cves").map((f) => f.value);
    expect(tech).toContain("apache");
    expect(tech).toContain("php");
    expect(cves).toContain("CVE-2021-41773");
    // Last entry should be a cves entry given our test data.
    expect(fps[fps.length - 1].type).toBe("cves");
  });
});
