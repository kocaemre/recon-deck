import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseNmapXml } from "../nmap-xml.js";
import type { ParsedScan } from "../types.js";

const FIXTURES = path.resolve(__dirname, "../../../../tests/fixtures/parser/xml");

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

describe("parseNmapXml (Plan 02)", () => {
  describe("INPUT-02 / PARSE-01: happy path", () => {
    it("simple-tcp.xml: returns source='nmap-xml' with three open ports", () => {
      const result: ParsedScan = parseNmapXml(loadFixture("simple-tcp.xml"));
      expect(result.source).toBe("nmap-xml");
      expect(result.ports).toHaveLength(3);
      expect(result.ports.every((p) => p.state === "open")).toBe(true);
      expect(result.ports.map((p) => p.port).sort()).toEqual([22, 443, 80].sort());
    });

    it("simple-tcp.xml: preserves tunnel='ssl' on port 443", () => {
      const result = parseNmapXml(loadFixture("simple-tcp.xml"));
      const p443 = result.ports.find((p) => p.port === 443);
      expect(p443?.tunnel).toBe("ssl");
    });

    it("simple-tcp.xml: target.ip='10.10.10.5', target.hostname='box.htb'", () => {
      const result = parseNmapXml(loadFixture("simple-tcp.xml"));
      expect(result.target.ip).toBe("10.10.10.5");
      expect(result.target.hostname).toBe("box.htb");
    });

    it("D-05: service names are lowercased and trimmed", () => {
      const result = parseNmapXml(loadFixture("simple-tcp.xml"));
      expect(result.ports.find((p) => p.port === 22)?.service).toBe("ssh");
    });

    it("D-06: product and version preserved verbatim", () => {
      const result = parseNmapXml(loadFixture("simple-tcp.xml"));
      const p22 = result.ports.find((p) => p.port === 22);
      expect(p22?.product).toBe("OpenSSH");
      expect(p22?.version).toBe("8.9p1");
    });

    it("D-04: hostScripts is always an array (empty for simple scan)", () => {
      const result = parseNmapXml(loadFixture("simple-tcp.xml"));
      expect(Array.isArray(result.hostScripts)).toBe(true);
    });
  });

  describe("P1-F PR 2: multi-host XML fully parsed", () => {
    it("multi-host.xml: every <host> element surfaces in scan.hosts", () => {
      const result = parseNmapXml(loadFixture("multi-host.xml"));
      // Legacy mirror still points at the first host (back-compat).
      expect(result.target.ip).toBe("10.10.10.5");
      // New: all 3 hosts are exposed; the multi-host warning is gone.
      expect(result.hosts).toHaveLength(3);
      expect(result.warnings.some((w) => /additional host/.test(w))).toBe(
        false,
      );
      // Each ParsedHost carries its own target.
      const ips = result.hosts.map((h) => h.target.ip);
      expect(ips).toContain("10.10.10.5");
    });
  });

  describe("IPv6 target", () => {
    it("ipv6.xml: target.ip carries IPv6 address", () => {
      const result = parseNmapXml(loadFixture("ipv6.xml"));
      expect(result.target.ip).toBe("dead:beef::1");
    });
  });

  describe("SSL tunnel preservation", () => {
    it("ssl-http.xml: port 8443 has service='http' + tunnel='ssl'", () => {
      const result = parseNmapXml(loadFixture("ssl-http.xml"));
      const p = result.ports.find((x) => x.port === 8443);
      expect(p?.service).toBe("http");
      expect(p?.tunnel).toBe("ssl");
    });
  });

  describe("D-02: state normalization", () => {
    it("open-filtered.xml: open|filtered normalized to 'filtered' + warning", () => {
      const result = parseNmapXml(loadFixture("open-filtered.xml"));
      const p53 = result.ports.find((p) => p.port === 53);
      expect(p53?.state).toBe("filtered");
      expect(result.warnings.some((w) => /open\|filtered/.test(w))).toBe(true);
    });
  });

  describe("Unicode preservation in NSE output", () => {
    it("unicode.xml: scripts[0].output preserves UTF-8 characters", () => {
      const result = parseNmapXml(loadFixture("unicode.xml"));
      const port80 = result.ports.find((p) => p.port === 80);
      expect(port80?.scripts[0]?.output).toMatch(/ようこそ/);
    });
  });

  describe("PARSE-02: CDATA fallback", () => {
    it("cdata.xml: script body CDATA content reaches scripts[0].output", () => {
      const result = parseNmapXml(loadFixture("cdata.xml"));
      const p445 = result.ports.find((p) => p.port === 445);
      expect(p445?.scripts[0]?.id).toBe("smb-os-discovery");
      expect(p445?.scripts[0]?.output).toMatch(/Windows 10/);
    });
  });

  describe("PARSE-03: hostscript captured as host-level", () => {
    it("hostscript.xml: hostScripts contains smb-os-discovery + smb-security-mode", () => {
      const result = parseNmapXml(loadFixture("hostscript.xml"));
      expect(result.hostScripts.length).toBeGreaterThanOrEqual(2);
      const ids = result.hostScripts.map((s) => s.id);
      expect(ids).toContain("smb-os-discovery");
      expect(ids).toContain("smb-security-mode");
    });
  });

  describe("PARSE-04: missing <service> element", () => {
    it("missing-service.xml: port.service is undefined + warning emitted", () => {
      const result = parseNmapXml(loadFixture("missing-service.xml"));
      const p = result.ports.find((x) => x.port === 31337);
      expect(p?.service).toBeUndefined();
      expect(result.warnings.some((w) => /31337/.test(w) && /service/i.test(w))).toBe(true);
    });
  });

  describe("SEC-05: XXE rejection (D-15)", () => {
    it("xxe.xml: throws with DOCTYPE+ENTITY message", () => {
      expect(() => parseNmapXml(loadFixture("xxe.xml"))).toThrow(/DOCTYPE/i);
    });
  });

  describe("D-07: append-output rejection", () => {
    it("append-output.xml: throws on multiple XML prologues", () => {
      expect(() => parseNmapXml(loadFixture("append-output.xml"))).toThrow(/multiple.*prologue/i);
    });
  });

  describe("CD-02 / D-07: partial Ctrl-C XML", () => {
    it("partial-ctrlc.xml: throws with interruption message", () => {
      expect(() => parseNmapXml(loadFixture("partial-ctrlc.xml"))).toThrow(/incomplete|interrupted/i);
    });
  });

  describe("INPUT-04 / D-07: empty input", () => {
    it("throws on empty string with actionable message", () => {
      expect(() => parseNmapXml("")).toThrow(/empty|paste/i);
    });
    it("throws on whitespace-only input", () => {
      expect(() => parseNmapXml("   \n\t  ")).toThrow(/empty|paste/i);
    });
    it("TEST-02: error message never contains stack frame syntax", () => {
      try {
        parseNmapXml("");
      } catch (e) {
        expect((e as Error).message).not.toMatch(/at Object\.|at new |\s+at /);
      }
    });
  });
});
