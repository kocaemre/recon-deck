import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { KbEntrySchema, type KbEntry } from "../schema.js";
import { applyConditionals, type ResolveContext } from "../resolve.js";

/**
 * Stack-aware web conditionals shipped on ports 80 / 443 / 8080 (issue #14
 * follow-up, supersedes PR #42). Loads the real KB YAML so a regression in the
 * shipped overlay — a renamed command id, a dropped predicate — fails here,
 * not silently in production.
 */

const PORTS_DIR = path.resolve(__dirname, "../../../../knowledge/ports");

function loadEntry(file: string): KbEntry {
  const doc = yaml.load(fs.readFileSync(path.join(PORTS_DIR, file), "utf8"));
  return KbEntrySchema.parse(doc);
}

function ctx(over: Partial<ResolveContext> = {}): ResolveContext {
  return {
    port: { service: "http", product: null, version: null },
    scripts: [],
    fingerprints: [],
    ...over,
  };
}

describe("web KB conditionals — port 80 (http)", () => {
  const entry = loadEntry("80-http.yaml");

  it("php-detected: header → PHP checks + gobuster extensions", () => {
    const r = applyConditionals(
      entry,
      ctx({
        scripts: [
          { id: "http-server-header", output: "Server: Apache\nX-Powered-By: PHP/7.4.33" },
        ],
      }),
    );
    expect(r.active).toEqual([{ id: "php-detected" }]);
    const check = r.checks.find((c) => c.key === "http-php-info-pages");
    expect(check?.source).toBe("conditional");
    expect(check?.conditionalId).toBe("php-detected");
    const gobuster = r.commands.find((c) => c.id === "gobuster-dir");
    expect(gobuster?.template).toContain(" -x php,html,txt");
    expect(gobuster?.appendedBy).toEqual(["php-detected"]);
  });

  it("wordpress-detected: autorecon tech → wpscan enumerate", () => {
    const r = applyConditionals(
      entry,
      ctx({
        fingerprints: [{ source: "autorecon", type: "tech", value: "wordpress" }],
      }),
    );
    expect(r.active).toEqual([{ id: "wordpress-detected" }]);
    const wpscan = r.commands.find((c) => c.id === "wpscan");
    expect(wpscan?.template).toContain("--enumerate u,ap,at");
  });

  it("java-detected: Apache-Coyote header → JSP extensions", () => {
    const r = applyConditionals(
      entry,
      ctx({
        scripts: [{ id: "http-server-header", output: "Server: Apache-Coyote/1.1" }],
      }),
    );
    expect(r.active).toEqual([{ id: "java-detected" }]);
    const ffuf = r.commands.find((c) => c.id === "ffuf-ext");
    expect(ffuf?.template).toContain(",.jsp,.jspx,.do");
    expect(r.checks.some((c) => c.key === "http-java-manager")).toBe(true);
  });

  it("no fingerprints → baseline only, nothing fires", () => {
    const r = applyConditionals(entry, ctx());
    expect(r.active).toEqual([]);
    expect(r.checks.every((c) => c.source !== "conditional")).toBe(true);
    const ffuf = r.commands.find((c) => c.id === "ffuf-ext");
    expect(ffuf?.appendedBy).toEqual([]);
  });
});

describe("web KB conditionals — port 443 (https)", () => {
  const entry = loadEntry("443-https.yaml");

  it("php-detected: autorecon tech → https PHP checks + gobuster extensions", () => {
    const r = applyConditionals(
      entry,
      ctx({
        port: { service: "https", product: null, version: null },
        fingerprints: [{ source: "autorecon", type: "tech", value: "php" }],
      }),
    );
    expect(r.active).toEqual([{ id: "php-detected" }]);
    expect(r.checks.some((c) => c.key === "https-php-info-pages")).toBe(true);
    const gobuster = r.commands.find((c) => c.id === "gobuster-dir");
    expect(gobuster?.template).toContain(" -x php,html,txt");
  });

  it("aspnet-detected: IIS header → ASP.NET checks + ffuf extensions", () => {
    const r = applyConditionals(
      entry,
      ctx({
        port: { service: "https", product: null, version: null },
        scripts: [{ id: "http-server-header", output: "Server: Microsoft-IIS/10.0" }],
      }),
    );
    expect(r.active).toEqual([{ id: "aspnet-detected" }]);
    const ffuf = r.commands.find((c) => c.id === "ffuf-ext");
    expect(ffuf?.template).toContain(",.aspx,.asp,.ashx");
  });
});

describe("web KB conditionals — port 8080 (http-proxy)", () => {
  const entry = loadEntry("8080-http-proxy.yaml");

  it("java-detected: Jenkins title → Groovy console check + JSP extensions", () => {
    const r = applyConditionals(
      entry,
      ctx({
        port: { service: "http-proxy", product: null, version: null },
        scripts: [{ id: "http-title", output: "Dashboard [Jenkins]" }],
      }),
    );
    expect(r.active).toEqual([{ id: "java-detected" }]);
    expect(r.checks.some((c) => c.key === "proxy-java-jenkins-console")).toBe(true);
    const ffuf = r.commands.find((c) => c.id === "ffuf-ext");
    expect(ffuf?.template).toContain(",.jsp,.jspx,.do");
  });
});
