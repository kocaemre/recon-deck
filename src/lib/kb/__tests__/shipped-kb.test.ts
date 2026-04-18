import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { KbEntrySchema } from "../schema.js";
import { loadKnowledgeBase, matchPort } from "../index.js";

/**
 * TEST-04: shipped KB validation.
 *
 * Iterates every YAML under knowledge/ports/ + knowledge/default.yaml,
 * validates against KbEntrySchema, asserts REQ KB-07 port coverage and
 * REQ D-09 alias seeding, and smoke-tests the loader+matcher integration
 * over the real shipped corpus.
 */

const PORTS_DIR = path.resolve(__dirname, "../../../../knowledge/ports");
const DEFAULT_FILE = path.resolve(__dirname, "../../../../knowledge/default.yaml");

const REQUIRED_PORTS = [
  21, 22, 23, 25, 53, 80, 88, 110, 111, 135, 139, 143, 389, 443, 445, 465,
  587, 636, 993, 995, 1433, 1521, 2049, 3306, 3389, 5432, 5900, 5985, 6379,
  8080, 27017,
];

const portFiles = fs
  .readdirSync(PORTS_DIR)
  .filter((f) => f.endsWith(".yaml"));

function loadYaml(filePath: string): unknown {
  return yaml.load(fs.readFileSync(filePath, "utf8"));
}

describe("shipped KB (Plan 05, TEST-04)", () => {
  it("KB-07: ships at least 30 YAMLs under knowledge/ports/", () => {
    expect(portFiles.length).toBeGreaterThanOrEqual(30);
  });

  it("KB-07: knowledge/default.yaml exists and validates", () => {
    expect(fs.existsSync(DEFAULT_FILE)).toBe(true);
    const parsed = loadYaml(DEFAULT_FILE);
    const result = KbEntrySchema.safeParse(parsed);
    expect(result.success, JSON.stringify((result as any).error?.issues)).toBe(
      true,
    );
  });

  it.each(portFiles)(
    "TEST-04: %s validates against KbEntrySchema",
    (file) => {
      const parsed = loadYaml(path.join(PORTS_DIR, file));
      const result = KbEntrySchema.safeParse(parsed);
      expect(
        result.success,
        `${file} failed schema: ${JSON.stringify((result as any).error?.issues)}`,
      ).toBe(true);
    },
  );

  it.each(REQUIRED_PORTS)(
    "KB-07: ships a KB entry for port %i",
    (port) => {
      const match = portFiles.find((f) => f.startsWith(`${port}-`));
      expect(match, `No KB file found for port ${port}`).toBeTruthy();
    },
  );

  describe("D-09: alias seeding on canonical entries", () => {
    const aliasCases: Array<[string, string]> = [
      ["445-smb.yaml", "microsoft-ds"],
      ["443-https.yaml", "ssl/http"],
      ["3389-rdp.yaml", "ms-wbt-server"],
      ["1433-mssql.yaml", "ms-sql-s"],
      ["1521-oracle.yaml", "oracle-tns"],
    ];

    it.each(aliasCases)(
      "%s declares alias %s",
      (file, alias) => {
        const entry: any = loadYaml(path.join(PORTS_DIR, file));
        expect(entry.aliases).toContain(alias);
      },
    );
  });

  describe("integration smoke (loadKnowledgeBase + matchPort over shipped KB)", () => {
    const kb = loadKnowledgeBase({
      shippedPortsDir: PORTS_DIR,
      shippedDefaultFile: DEFAULT_FILE,
    });

    it("matches port 445 by canonical service name", () => {
      const entry = matchPort(kb, 445, "smb");
      expect(entry.service).toBe("smb");
    });

    it("matches port 445 via microsoft-ds alias (D-09)", () => {
      const entry = matchPort(kb, 445, "microsoft-ds");
      expect(entry.service).toBe("smb");
    });

    it("matches port 1433 via ms-sql-s alias (D-09)", () => {
      const entry = matchPort(kb, 1433, "ms-sql-s");
      expect(entry.service).toBe("mssql");
    });

    it("returns default for unknown port (Success Criterion 3)", () => {
      const entry = matchPort(kb, 65000, "definitely-not-real");
      expect(entry.service).toBe("unknown");
    });
  });
});
