import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { KbEntrySchema, type KbEntry } from "../schema.js";
import { applyConditionals, type ResolveContext } from "../resolve.js";

/**
 * Version-gated KB conditionals (beta.7): nmap_version_matches overlays on
 * FTP / SMB / SSH / MySQL. These ride on the compareVersions fix that reduces
 * each segment to its leading integer, so an OpenSSH `pN` suffix no longer
 * collapses the minor version to 0 — without it the SSH ranges below would
 * mis-fire. Loading the real shipped YAML keeps the overlays honest.
 */

const PORTS_DIR = path.resolve(__dirname, "../../../../knowledge/ports");

function loadEntry(file: string): KbEntry {
  const doc = yaml.load(fs.readFileSync(path.join(PORTS_DIR, file), "utf8"));
  return KbEntrySchema.parse(doc);
}

function ctx(
  product: string | null,
  version: string | null,
  service = "x",
): ResolveContext {
  return {
    port: { service, product, version },
    scripts: [],
    fingerprints: [],
  };
}

describe("version conditionals — 21 ftp", () => {
  const entry = loadEntry("21-ftp.yaml");

  it("vsftpd 2.3.4 → backdoor check fires", () => {
    const r = applyConditionals(entry, ctx("vsftpd", "2.3.4", "ftp"));
    expect(r.active).toEqual([{ id: "vsftpd-234-backdoor" }]);
    expect(r.checks.some((c) => c.key === "ftp-vsftpd-234-backdoor")).toBe(true);
  });

  it("vsftpd 3.0.3 → nothing fires", () => {
    const r = applyConditionals(entry, ctx("vsftpd", "3.0.3", "ftp"));
    expect(r.active).toEqual([]);
  });

  it("ProFTPD 1.3.5 → mod_copy check fires", () => {
    const r = applyConditionals(entry, ctx("ProFTPD", "1.3.5", "ftp"));
    expect(r.active).toEqual([{ id: "proftpd-modcopy-rce" }]);
  });
});

describe("version conditionals — 445 smb", () => {
  const entry = loadEntry("445-smb.yaml");

  it("Samba smbd 3.0.20 → usermap RCE (not SambaCry)", () => {
    const r = applyConditionals(entry, ctx("Samba smbd", "3.0.20", "smb"));
    expect(r.active).toEqual([{ id: "samba-usermap-rce" }]);
  });

  it("Samba smbd 4.5.16 → SambaCry + nmap script appended", () => {
    const r = applyConditionals(entry, ctx("Samba smbd", "4.5.16", "smb"));
    expect(r.active).toEqual([{ id: "sambacry-rce" }]);
    const nmap = r.commands.find((c) => c.id === "smb-nmap");
    expect(nmap?.template).toContain(",smb-vuln-cve-2017-7494");
    expect(nmap?.appendedBy).toEqual(["sambacry-rce"]);
  });

  it("Samba smbd 4.16.0 → neither (patched range)", () => {
    const r = applyConditionals(entry, ctx("Samba smbd", "4.16.0", "smb"));
    expect(r.active).toEqual([]);
  });

  // Regression (beta-test B-4): the real nmap text parser splits
  // "445/tcp open netbios-ssn Samba smbd 3.0.20-Debian" into
  // product="Samba", version="smbd 3.0.20-Debian" — a leading non-numeric
  // token. Before the fix the ordered comparison parsed "smbd" as 0, so
  // ">= 3.0.0" failed and usermap-rce silently never fired on a real Samba box.
  it("real parser shape: product=Samba, version='smbd 3.0.20-Debian' → usermap RCE", () => {
    const r = applyConditionals(entry, ctx("Samba", "smbd 3.0.20-Debian", "netbios-ssn"));
    expect(r.active).toEqual([{ id: "samba-usermap-rce" }]);
  });

  it("real parser shape: product=Samba, version='smbd 4.3.11-Ubuntu' → SambaCry", () => {
    const r = applyConditionals(entry, ctx("Samba", "smbd 4.3.11-Ubuntu", "netbios-ssn"));
    expect(r.active).toEqual([{ id: "sambacry-rce" }]);
  });
});

describe("version conditionals — 22 ssh (pN suffix handling)", () => {
  const entry = loadEntry("22-ssh.yaml");

  it("OpenSSH 7.6p1 → username enum (< 7.7)", () => {
    const r = applyConditionals(entry, ctx("OpenSSH", "7.6p1", "ssh"));
    expect(r.active).toEqual([{ id: "openssh-username-enum" }]);
  });

  it("OpenSSH 7.7p1 → nothing (suffix must not collapse 7.7 to 7.0)", () => {
    const r = applyConditionals(entry, ctx("OpenSSH", "7.7p1", "ssh"));
    expect(r.active).toEqual([]);
  });

  it("OpenSSH 9.6p1 → regreSSHion (>= 8.5 < 9.8)", () => {
    const r = applyConditionals(entry, ctx("OpenSSH", "9.6p1", "ssh"));
    expect(r.active).toEqual([{ id: "openssh-regresshion" }]);
  });

  it("OpenSSH 9.8p1 → nothing (fixed in 9.8)", () => {
    const r = applyConditionals(entry, ctx("OpenSSH", "9.8p1", "ssh"));
    expect(r.active).toEqual([]);
  });

  it("real-world banner with distro suffix still brackets correctly", () => {
    const r = applyConditionals(
      entry,
      ctx("OpenSSH", "7.6p1 Ubuntu 4ubuntu0.3", "ssh"),
    );
    expect(r.active).toEqual([{ id: "openssh-username-enum" }]);
  });
});

describe("version conditionals — 3306 mysql", () => {
  const entry = loadEntry("3306-mysql.yaml");

  it("MySQL 5.5.23 → auth bypass check fires", () => {
    const r = applyConditionals(entry, ctx("MySQL", "5.5.23", "mysql"));
    expect(r.active).toEqual([{ id: "mysql-cve-2012-2122" }]);
  });

  it("MySQL 5.5.24 → nothing (patched boundary)", () => {
    const r = applyConditionals(entry, ctx("MySQL", "5.5.24", "mysql"));
    expect(r.active).toEqual([]);
  });

  it("MySQL 8.0.32 → nothing", () => {
    const r = applyConditionals(entry, ctx("MySQL", "8.0.32", "mysql"));
    expect(r.active).toEqual([]);
  });
});
