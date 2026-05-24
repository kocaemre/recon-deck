import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { KbEntrySchema } from "../schema.js";
import { applyConditionals } from "../resolve.js";

const HTTP_FILE = path.resolve(
  __dirname,
  "../../../../knowledge/ports/80-http.yaml",
);

function loadHttpEntry() {
  const doc = yaml.load(fs.readFileSync(HTTP_FILE, "utf8"));
  return KbEntrySchema.parse(doc);
}

describe("HTTP KB conditional (PHP)", () => {
  it("adds PHP checks + appends gobuster extensions when header shows PHP", () => {
    const entry = loadHttpEntry();
    const resolved = applyConditionals(entry, {
      port: { service: "http", product: null, version: null },
      scripts: [
        {
          id: "http-server-header",
          output: "Server: Apache\nX-Powered-By: PHP/7.4.33",
        },
      ],
      fingerprints: [],
    });

    const phpCheck = resolved.checks.find(
      (c) => c.key === "http-php-info-pages",
    );
    expect(phpCheck?.source).toBe("conditional");
    expect(phpCheck?.conditionalId).toBe("php-detected");
    expect(resolved.active).toEqual([{ id: "php-detected" }]);

    const gobuster = resolved.commands.find((c) => c.id === "gobuster-dir");
    expect(gobuster?.template).toContain(" -x php,html,txt");
    expect(gobuster?.appendedBy).toEqual(["php-detected"]);
  });
});
