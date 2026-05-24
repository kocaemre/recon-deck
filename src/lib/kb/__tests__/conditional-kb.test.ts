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

describe("HTTP KB conditionals (PHP/WordPress/ASP.NET)", () => {
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

  it("adds WordPress checks + updates wpscan when autorecon tags WordPress", () => {
    const entry = loadHttpEntry();
    const resolved = applyConditionals(entry, {
      port: { service: "http", product: null, version: null },
      scripts: [],
      fingerprints: [{ source: "autorecon", type: "tech", value: "wordpress" }],
    });

    const wpCheck = resolved.checks.find((c) => c.key === "http-wordpress-wpscan");
    expect(wpCheck?.source).toBe("conditional");
    expect(wpCheck?.conditionalId).toBe("wordpress-detected");
    expect(resolved.active).toEqual([{ id: "wordpress-detected" }]);

    const wpscan = resolved.commands.find((c) => c.id === "wpscan");
    expect(wpscan?.template).toContain("--enumerate u,ap,at");
    expect(wpscan?.appendedBy).toEqual(["wordpress-detected"]);
  });

  it("adds ASP.NET checks + extends ffuf extensions when headers show ASP.NET", () => {
    const entry = loadHttpEntry();
    const resolved = applyConditionals(entry, {
      port: { service: "http", product: null, version: null },
      scripts: [
        {
          id: "http-headers",
          output: "X-Powered-By: ASP.NET\nServer: Microsoft-IIS/10.0",
        },
      ],
      fingerprints: [],
    });

    const aspCheck = resolved.checks.find((c) => c.key === "http-aspnet-trace-axd");
    expect(aspCheck?.source).toBe("conditional");
    expect(aspCheck?.conditionalId).toBe("aspnet-detected");
    expect(resolved.active).toEqual([{ id: "aspnet-detected" }]);

    const ffuf = resolved.commands.find((c) => c.id === "ffuf-ext");
    expect(ffuf?.template).toContain(",.aspx,.asp,.ashx");
    expect(ffuf?.appendedBy).toEqual(["aspnet-detected"]);
  });

  it("adds Java checks + extends ffuf extensions when Tomcat headers detected", () => {
    const entry = loadHttpEntry();
    const resolved = applyConditionals(entry, {
      port: { service: "http", product: null, version: null },
      scripts: [
        {
          id: "http-server-header",
          output: "Server: Apache-Coyote/1.1",
        },
      ],
      fingerprints: [],
    });

    const javaCheck = resolved.checks.find((c) => c.key === "http-java-manager");
    expect(javaCheck?.source).toBe("conditional");
    expect(javaCheck?.conditionalId).toBe("java-detected");
    expect(resolved.active).toEqual([{ id: "java-detected" }]);

    const ffuf = resolved.commands.find((c) => c.id === "ffuf-ext");
    expect(ffuf?.template).toContain(",.jsp,.jspx,.do");
    expect(ffuf?.appendedBy).toEqual(["java-detected"]);
  });

  it("adds Python checks + extends ffuf extensions when Werkzeug header detected", () => {
    const entry = loadHttpEntry();
    const resolved = applyConditionals(entry, {
      port: { service: "http", product: null, version: null },
      scripts: [
        {
          id: "http-server-header",
          output: "Server: Werkzeug/2.3.8 Python/3.11.5",
        },
      ],
      fingerprints: [],
    });

    const pyCheck = resolved.checks.find(
      (c) => c.key === "http-python-admin-debug",
    );
    expect(pyCheck?.source).toBe("conditional");
    expect(pyCheck?.conditionalId).toBe("python-detected");
    expect(resolved.active).toEqual([{ id: "python-detected" }]);

    const ffuf = resolved.commands.find((c) => c.id === "ffuf-ext");
    expect(ffuf?.template).toContain(",.py");
    expect(ffuf?.appendedBy).toEqual(["python-detected"]);
  });
});
