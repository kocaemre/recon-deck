import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { KbEntrySchema, type KbEntry } from "../schema.js";
import { matchKnownVulns } from "../resolve.js";

/**
 * known_vulns matching (beta-test B-5): range-aware advisories. A `version`
 * expression gates the (substring) `match` so a ranged CVE no longer needs one
 * brittle entry per build — and stays consistent with the version-gated
 * conditionals. Entries without `version` keep substring-only behaviour.
 */

const PORTS_DIR = path.resolve(__dirname, "../../../../knowledge/ports");
function load(file: string): KbEntry {
  return KbEntrySchema.parse(
    yaml.load(fs.readFileSync(path.join(PORTS_DIR, file), "utf8")),
  );
}
const notes = (file: string, product: string | null, version: string | null) =>
  matchKnownVulns(load(file).known_vulns ?? [], product, version).map(
    (v) => v.note,
  );

describe("known_vulns — 445 smb (real parser shape: product=Samba, version='smbd X-distro')", () => {
  it("Samba 3.0.20 → usermap only (not SambaCry)", () => {
    const n = notes("445-smb.yaml", "Samba", "smbd 3.0.20-Debian");
    expect(n.some((x) => x.includes("CVE-2007-2447"))).toBe(true);
    expect(n.some((x) => x.includes("CVE-2017-7494"))).toBe(false);
  });

  it("Samba 4.3.11 → SambaCry (was missed by the old substring entries)", () => {
    const n = notes("445-smb.yaml", "Samba", "smbd 4.3.11-Ubuntu");
    expect(n.some((x) => x.includes("CVE-2017-7494"))).toBe(true);
    expect(n.some((x) => x.includes("CVE-2007-2447"))).toBe(false);
  });

  it("Samba 4.16.0 → neither (patched range)", () => {
    const n = notes("445-smb.yaml", "Samba", "smbd 4.16.0-Ubuntu");
    expect(n).toEqual([]);
  });
});

describe("known_vulns — substring-only entries still work (no version field)", () => {
  it("vsFTPd 2.3.4 → backdoor advisory", () => {
    const n = notes("21-ftp.yaml", "vsftpd", "2.3.4");
    expect(n.some((x) => x.includes("CVE-2011-2523"))).toBe(true);
  });

  it("ProFTPD 1.3.5a → mod_copy advisory (substring of '1.3.5')", () => {
    const n = notes("21-ftp.yaml", "ProFTPD", "1.3.5a");
    expect(n.some((x) => x.includes("CVE-2015-3306"))).toBe(true);
  });

  it("non-matching product → nothing", () => {
    expect(notes("21-ftp.yaml", "Pure-FTPd", "1.0.47")).toEqual([]);
  });
});
