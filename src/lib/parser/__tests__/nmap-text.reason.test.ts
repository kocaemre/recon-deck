import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { parseAny } from "../index.js";
import { KbEntrySchema } from "../../kb/schema.js";
import { applyConditionals } from "../../kb/resolve.js";

const ROOT = path.resolve(__dirname, "../../../..");
const raw = fs.readFileSync(
  path.join(ROOT, "tests/fixtures/parser/text/reason-columns.nmap"),
  "utf8",
);

describe("nmap text REASON column", () => {
  it("separates a reason and TTL from the service banner without losing NSE output", () => {
    const scan = parseAny(raw);
    expect(scan.source).toBe("nmap-text");
    expect(scan.ports[0]).toMatchObject({
      port: 22,
      product: "OpenSSH",
      version: "7.6p1 Ubuntu 4ubuntu0.3",
      reason: "syn-ack",
      reasonTtl: 64,
      scripts: [{ id: "ssh-hostkey", output: "256 00:11:22:33:44:55:66:77 (ED25519)" }],
    });
    expect(scan.hostScripts).toEqual([{ id: "clock-skew", output: "0s" }]);
  });

  it("keeps the version and TLS service when the reason has no TTL", () => {
    const port = parseAny(raw).ports.find((p) => p.port === 443)!;
    expect(port).toMatchObject({
      service: "http",
      tunnel: "ssl",
      product: "Apache",
      version: "httpd 2.4.52",
      reason: "syn-ack",
    });
    expect(port.reasonTtl).toBeUndefined();
  });

  it("consumes a reason's source IPv4 address before TTL and VERSION", () => {
    const port = parseAny(raw).ports.find((p) => p.port === 53)!;
    expect(port).toMatchObject({
      protocol: "udp",
      product: "ISC",
      version: "BIND 9.18",
      extrainfo: "Debian",
      reason: "udp-response",
      reasonTtl: 55,
    });
  });

  it("does not invent a product or version from IPv6 source and TTL metadata", () => {
    const port = parseAny(raw).ports.find((p) => p.port === 80)!;
    expect(port).toMatchObject({
      state: "filtered",
      reason: "admin-prohibited",
      reasonTtl: 63,
    });
    expect(port.product).toBeUndefined();
    expect(port.version).toBeUndefined();
  });

  it.each(["192.0.2.53", "2001:db8::53"])(
    "separates a source address without a TTL: %s",
    (address) => {
      const scan = parseAny(`Nmap scan report for 192.0.2.10
PORT STATE SERVICE REASON VERSION
53/udp open domain udp-response from ${address} ISC BIND 9.18
`);
      expect(scan.ports[0]).toMatchObject({
        product: "ISC",
        version: "BIND 9.18",
        reason: "udp-response",
      });
      expect(scan.ports[0].reasonTtl).toBeUndefined();
    },
  );

  it("supports REASON-only tables and empty VERSION cells", () => {
    const scan = parseAny(raw);
    const reasonOnly = scan.hosts[2].ports;
    expect(reasonOnly[0]).toMatchObject({ reason: "syn-ack", reasonTtl: 64 });
    for (const port of [...reasonOnly, scan.ports.find((p) => p.port === 161)!]) {
      expect(port.product).toBeUndefined();
      expect(port.version).toBeUndefined();
    }
    expect(reasonOnly[1]).toMatchObject({
      state: "filtered",
      reason: "no-response",
    });
    expect(scan.warnings.some((warning) => warning.includes("open|filtered"))).toBe(true);
  });

  it("resets table columns for subsequent headerless and ordinary hosts", () => {
    const scan = parseAny(raw);
    expect(scan.hosts).toHaveLength(4);
    for (const [index, version] of [[1, "7.7p1"], [3, "9.8p1"]] as const) {
      const port = scan.hosts[index].ports[0];
      expect(port).toMatchObject({ product: "OpenSSH", version });
      expect(port.reason).toBeUndefined();
      expect(port.reasonTtl).toBeUndefined();
    }
  });

  it("retains the version-gated check from the shipped SSH knowledge base", () => {
    const entry = KbEntrySchema.parse(yaml.load(fs.readFileSync(
      path.join(ROOT, "knowledge/ports/22-ssh.yaml"),
      "utf8",
    )));
    const port = parseAny(raw).ports[0];
    const resolved = applyConditionals(entry, {
      port: {
        service: port.service ?? null,
        product: port.product ?? null,
        version: port.version ?? null,
      },
      scripts: port.scripts,
      fingerprints: [],
    });
    expect(resolved.active).toEqual([{ id: "openssh-username-enum" }]);
  });
});
