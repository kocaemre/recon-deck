import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseNmapText } from "../nmap-text.js";

const FIXTURES = path.resolve(__dirname, "../../../../tests/fixtures/parser/text");

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

describe("parseNmapText (Plan 03)", () => {
  describe("hostname-with-ip.nmap", () => {
    it("INPUT-01: target.hostname='box.htb' and target.ip='10.10.10.5'", () => {
      const result = parseNmapText(loadFixture("hostname-with-ip.nmap"));
      expect(result.target.hostname).toBe("box.htb");
      expect(result.target.ip).toBe("10.10.10.5");
      expect(result.source).toBe("nmap-text");
    });
  });

  describe("simple-tcp.nmap", () => {
    it("PARSE-01: ports[] has correct port/protocol/service/version", () => {
      const result = parseNmapText(loadFixture("simple-tcp.nmap"));
      expect(result.ports.map((p) => p.port).sort()).toEqual([22, 443, 80].sort());
      expect(result.ports.every((p) => p.protocol === "tcp")).toBe(true);
      expect(result.ports.every((p) => p.state === "open")).toBe(true);
      expect(result.ports.find((p) => p.port === 22)?.service).toBe("ssh");
      expect(result.ports.find((p) => p.port === 22)?.product).toBe("OpenSSH");
    });
  });

  describe("udp-scan.nmap", () => {
    it("D-02: open|filtered normalizes to state='filtered' + warning (Pitfall 5)", () => {
      const result = parseNmapText(loadFixture("udp-scan.nmap"));
      const p53 = result.ports.find((p) => p.port === 53);
      expect(p53?.protocol).toBe("udp");
      expect(p53?.state).toBe("filtered");
      expect(result.warnings.some((w) => /open\|filtered/.test(w))).toBe(true);
    });
  });

  describe("nse-output.nmap", () => {
    it("PARSE-02: per-port scripts[] populated from | lines", () => {
      const result = parseNmapText(loadFixture("nse-output.nmap"));
      const p80 = result.ports.find((p) => p.port === 80);
      expect(p80?.scripts.some((s) => s.id === "http-title")).toBe(true);
    });
    it("PARSE-03: hostScripts[] populated from 'Host script results:' section", () => {
      const result = parseNmapText(loadFixture("nse-output.nmap"));
      expect(result.hostScripts.some((s) => s.id === "smb-os-discovery")).toBe(true);
    });
  });

  describe("INPUT-04 / D-07: empty input", () => {
    it("throws with actionable message", () => {
      expect(() => parseNmapText("")).toThrow(/empty|paste/i);
    });
    it("TEST-02: error message has no stack frame syntax", () => {
      try {
        parseNmapText("");
      } catch (e) {
        expect((e as Error).message).not.toMatch(/at Object\.|at new |\s+at /);
      }
    });
  });

  describe("D-09 mirrored via CD-03: multi-host text parser warns", () => {
    it("(behavior contract) if multiple 'Nmap scan report for' headers are present, first is parsed and warnings[] mentions others", () => {
      // This is a contract-level assertion. The nse-output.nmap fixture has ONE host,
      // so this test ensures parser doesn't falsely warn. Future multi-host text fixture
      // can exercise the positive path; for now assert no spurious warning.
      const result = parseNmapText(loadFixture("nse-output.nmap"));
      expect(result.warnings.every((w) => !/additional host/.test(w))).toBe(true);
    });
  });
});
