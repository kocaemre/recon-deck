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

  describe("multi-host text parser (P1-F follow-up)", () => {
    it("single-host fixtures produce one host entry mirroring legacy fields", () => {
      const result = parseNmapText(loadFixture("simple-tcp.nmap"));
      expect(result.hosts).toHaveLength(1);
      expect(result.hosts[0].target.ip).toBe(result.target.ip);
      expect(result.hosts[0].ports).toBe(result.ports);
      expect(result.warnings.every((w) => !/additional host/.test(w))).toBe(true);
    });

    it("multi-host scan: each host appears in scan.hosts[] with its own ports", () => {
      const result = parseNmapText(loadFixture("multi-host.nmap"));
      expect(result.hosts).toHaveLength(3);

      const ips = result.hosts.map((h) => h.target.ip);
      expect(ips).toEqual(["10.10.10.5", "10.10.10.6", "10.10.10.7"]);

      const host1 = result.hosts[0];
      expect(host1.target.hostname).toBe("box1.htb");
      expect(host1.ports.map((p) => p.port).sort((a, b) => a - b)).toEqual([22, 80, 443]);
      expect(host1.hostScripts.some((s) => s.id === "smb-os-discovery")).toBe(true);
      expect(host1.extraPorts?.[0]).toMatchObject({ state: "closed", count: 997 });

      const host2 = result.hosts[1];
      expect(host2.target.hostname).toBeUndefined();
      expect(host2.ports.map((p) => p.port)).toEqual([3306]);
      expect(host2.ports[0].product).toBe("MariaDB");

      const host3 = result.hosts[2];
      expect(host3.target.hostname).toBe("box3.htb");
      expect(host3.ports.map((p) => p.port).sort((a, b) => a - b)).toEqual([21, 22]);
      expect(host3.ports.find((p) => p.port === 21)?.product).toBe("vsFTPd");
      expect(host3.extraPorts?.[0]).toMatchObject({ state: "filtered", count: 998 });
    });

    it("multi-host scan: top-level fields mirror hosts[0] (back-compat)", () => {
      const result = parseNmapText(loadFixture("multi-host.nmap"));
      expect(result.target).toBe(result.hosts[0].target);
      expect(result.ports).toBe(result.hosts[0].ports);
      expect(result.hostScripts).toBe(result.hosts[0].hostScripts);
    });
  });
});
