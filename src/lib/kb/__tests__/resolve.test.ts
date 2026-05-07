import { describe, expect, it } from "vitest";
import {
  applyConditionals,
  evaluateWhen,
  type ResolveContext,
} from "../resolve.js";
import type { KbEntry, WhenExpr } from "../schema.js";

function makeCtx(over: Partial<ResolveContext> = {}): ResolveContext {
  return {
    port: { service: null, product: null, version: null },
    scripts: [],
    fingerprints: [],
    ...over,
  };
}

function makeEntry(over: Partial<KbEntry> = {}): KbEntry {
  return {
    schema_version: 1,
    port: 80,
    service: "http",
    protocol: "tcp",
    aliases: [],
    checks: [{ key: "baseline-check", label: "Baseline" }],
    commands: [
      { id: "gobuster-dir", label: "gobuster", template: "gobuster dir -u http://{IP}" },
    ],
    resources: [],
    risk: "info",
    ...over,
  } as KbEntry;
}

describe("evaluateWhen (v2.4.0 P4 #29)", () => {
  describe("port_field_equals", () => {
    it("matches case-insensitively on service", () => {
      const when: WhenExpr = {
        port_field_equals: { field: "service", value: "HTTP" },
      };
      expect(evaluateWhen(when, makeCtx({ port: { service: "http", product: null, version: null } }))).toBe(true);
    });
    it("returns false on mismatch", () => {
      const when: WhenExpr = {
        port_field_equals: { field: "service", value: "ssh" },
      };
      expect(evaluateWhen(when, makeCtx({ port: { service: "http", product: null, version: null } }))).toBe(false);
    });
  });

  describe("nmap_script_contains", () => {
    it("matches when script id and pattern both hit", () => {
      const when: WhenExpr = {
        nmap_script_contains: { script: "http-server-header", pattern: "PHP" },
      };
      expect(
        evaluateWhen(
          when,
          makeCtx({
            scripts: [
              { id: "http-server-header", output: "Server: Apache\nX-Powered-By: PHP/7.4" },
            ],
          }),
        ),
      ).toBe(true);
    });
    it("returns false when script id matches but pattern misses", () => {
      const when: WhenExpr = {
        nmap_script_contains: { script: "http-server-header", pattern: "PHP" },
      };
      expect(
        evaluateWhen(
          when,
          makeCtx({
            scripts: [{ id: "http-server-header", output: "Server: Apache" }],
          }),
        ),
      ).toBe(false);
    });
  });

  describe("nmap_version_matches", () => {
    it("matches product substring + exact version startsWith", () => {
      const when: WhenExpr = {
        nmap_version_matches: { product: "vsftpd", version: "2.3.4" },
      };
      expect(
        evaluateWhen(
          when,
          makeCtx({
            port: { service: "ftp", product: "vsftpd", version: "2.3.4" },
          }),
        ),
      ).toBe(true);
    });
    it("supports <= operator", () => {
      const when: WhenExpr = {
        nmap_version_matches: { product: "vsftpd", version: "<= 2.3.5" },
      };
      expect(
        evaluateWhen(
          when,
          makeCtx({ port: { service: "ftp", product: "vsftpd", version: "2.3.4" } }),
        ),
      ).toBe(true);
      expect(
        evaluateWhen(
          when,
          makeCtx({ port: { service: "ftp", product: "vsftpd", version: "2.3.6" } }),
        ),
      ).toBe(false);
    });
    it("supports range '>= 1.0.0 < 2.0.0'", () => {
      const when: WhenExpr = {
        nmap_version_matches: { version: ">= 1.0.0 < 2.0.0" },
      };
      expect(evaluateWhen(when, makeCtx({ port: { service: null, product: null, version: "1.5.3" } }))).toBe(true);
      expect(evaluateWhen(when, makeCtx({ port: { service: null, product: null, version: "2.0.0" } }))).toBe(false);
      expect(evaluateWhen(when, makeCtx({ port: { service: null, product: null, version: "0.9.9" } }))).toBe(false);
    });
    it("product without version still matches when product is present", () => {
      const when: WhenExpr = { nmap_version_matches: { product: "openssh" } };
      expect(
        evaluateWhen(
          when,
          makeCtx({ port: { service: null, product: "OpenSSH", version: null } }),
        ),
      ).toBe(true);
    });
  });

  describe("autorecon_finding", () => {
    it("matches case-insensitively against autorecon-source rows", () => {
      const when: WhenExpr = {
        autorecon_finding: { type: "tech", value: "PHP" },
      };
      expect(
        evaluateWhen(
          when,
          makeCtx({
            fingerprints: [
              { source: "autorecon", type: "tech", value: "php" },
            ],
          }),
        ),
      ).toBe(true);
    });
    it("does NOT match nmap-source rows even with same type/value", () => {
      const when: WhenExpr = {
        autorecon_finding: { type: "tech", value: "php" },
      };
      expect(
        evaluateWhen(
          when,
          makeCtx({
            fingerprints: [{ source: "nmap", type: "tech", value: "php" }],
          }),
        ),
      ).toBe(false);
    });
  });

  describe("logical combinators", () => {
    const phpScript: WhenExpr = {
      nmap_script_contains: { script: "http-server-header", pattern: "PHP" },
    };
    const wpFinding: WhenExpr = {
      autorecon_finding: { type: "tech", value: "wordpress" },
    };

    it("anyOf matches when at least one branch matches", () => {
      const when: WhenExpr = { anyOf: [phpScript, wpFinding] };
      const ctx = makeCtx({
        fingerprints: [
          { source: "autorecon", type: "tech", value: "wordpress" },
        ],
      });
      expect(evaluateWhen(when, ctx)).toBe(true);
    });

    it("allOf requires every branch", () => {
      const when: WhenExpr = { allOf: [phpScript, wpFinding] };
      const onlyPhp = makeCtx({
        scripts: [
          { id: "http-server-header", output: "X-Powered-By: PHP/7.4" },
        ],
      });
      expect(evaluateWhen(when, onlyPhp)).toBe(false);
      const both = makeCtx({
        scripts: [
          { id: "http-server-header", output: "X-Powered-By: PHP/7.4" },
        ],
        fingerprints: [
          { source: "autorecon", type: "tech", value: "wordpress" },
        ],
      });
      expect(evaluateWhen(when, both)).toBe(true);
    });

    it("not inverts a sub-predicate", () => {
      const when: WhenExpr = { not: phpScript };
      expect(evaluateWhen(when, makeCtx())).toBe(true);
    });
  });
});

describe("applyConditionals (v2.4.0 P4 #29)", () => {
  it("returns baseline checks + commands when no conditionals", () => {
    const out = applyConditionals(makeEntry(), makeCtx());
    expect(out.checks.map((c) => c.key)).toEqual(["baseline-check"]);
    expect(out.commands.map((c) => c.template)).toEqual([
      "gobuster dir -u http://{IP}",
    ]);
    expect(out.active).toEqual([]);
    expect(out.inactive).toEqual([]);
  });

  it("appends adds_checks from a matched conditional", () => {
    const entry = makeEntry({
      conditional: [
        {
          id: "php-detected",
          when: {
            autorecon_finding: { type: "tech", value: "php" },
          },
          adds_checks: [{ key: "php-info", label: "Tested phpinfo" }],
        },
      ],
    });
    const ctx = makeCtx({
      fingerprints: [{ source: "autorecon", type: "tech", value: "php" }],
    });
    const out = applyConditionals(entry, ctx);
    expect(out.checks.map((c) => c.key)).toEqual(["baseline-check", "php-info"]);
    const phpCheck = out.checks.find((c) => c.key === "php-info")!;
    expect(phpCheck.source).toBe("conditional");
    expect(phpCheck.conditionalId).toBe("php-detected");
    expect(out.active).toEqual([{ id: "php-detected" }]);
  });

  it("appends to a command in declaration order", () => {
    const entry = makeEntry({
      conditional: [
        {
          id: "php",
          when: { autorecon_finding: { type: "tech", value: "php" } },
          adds_checks: [],
          modifies_commands: { "gobuster-dir": { append: " -x php" } },
        },
        {
          id: "wp",
          when: { autorecon_finding: { type: "tech", value: "wordpress" } },
          adds_checks: [],
          modifies_commands: { "gobuster-dir": { append: ",html" } },
        },
      ],
    });
    const ctx = makeCtx({
      fingerprints: [
        { source: "autorecon", type: "tech", value: "php" },
        { source: "autorecon", type: "tech", value: "wordpress" },
      ],
    });
    const out = applyConditionals(entry, ctx);
    expect(out.commands[0].template).toBe(
      "gobuster dir -u http://{IP} -x php,html",
    );
    expect(out.commands[0].appendedBy).toEqual(["php", "wp"]);
  });

  it("replace is last-wins across multiple matched conditionals", () => {
    const entry = makeEntry({
      conditional: [
        {
          id: "first",
          when: { port_field_equals: { field: "service", value: "http" } },
          adds_checks: [],
          modifies_commands: { "gobuster-dir": { replace: "echo first" } },
        },
        {
          id: "second",
          when: { port_field_equals: { field: "service", value: "http" } },
          adds_checks: [],
          modifies_commands: { "gobuster-dir": { replace: "echo second" } },
        },
      ],
    });
    const ctx = makeCtx({ port: { service: "http", product: null, version: null } });
    const out = applyConditionals(entry, ctx);
    expect(out.commands[0].template).toBe("echo second");
    expect(out.commands[0].replacedBy).toBe("second");
  });

  it("non-matching conditionals land in inactive[]", () => {
    const entry = makeEntry({
      conditional: [
        {
          id: "php-detected",
          when: { autorecon_finding: { type: "tech", value: "php" } },
          adds_checks: [{ key: "php-info", label: "Tested phpinfo" }],
        },
        {
          id: "wp-detected",
          when: { autorecon_finding: { type: "tech", value: "wordpress" } },
          adds_checks: [{ key: "wp-xmlrpc", label: "Tested xmlrpc" }],
        },
      ],
    });
    const ctx = makeCtx({
      fingerprints: [{ source: "autorecon", type: "tech", value: "php" }],
    });
    const out = applyConditionals(entry, ctx);
    expect(out.active.map((a) => a.id)).toEqual(["php-detected"]);
    expect(out.inactive.map((i) => i.id)).toEqual(["wp-detected"]);
    expect(out.inactive[0].checkKeys).toEqual(["wp-xmlrpc"]);
  });

  it("baseline checks are not duplicated by a colliding conditional add", () => {
    // Lint catches this case at build time, but the resolver should
    // still be defensive — first occurrence wins.
    const entry = makeEntry({
      conditional: [
        {
          id: "x",
          when: { port_field_equals: { field: "service", value: "http" } },
          adds_checks: [{ key: "baseline-check", label: "shadow" }],
        },
      ],
    });
    const ctx = makeCtx({ port: { service: "http", product: null, version: null } });
    const out = applyConditionals(entry, ctx);
    expect(out.checks.filter((c) => c.key === "baseline-check").length).toBe(1);
    expect(out.checks.find((c) => c.key === "baseline-check")?.source).toBe(
      "baseline",
    );
  });

  it("modifies_commands targeting an unknown id is silently skipped", () => {
    const entry = makeEntry({
      conditional: [
        {
          id: "stale",
          when: { port_field_equals: { field: "service", value: "http" } },
          adds_checks: [],
          modifies_commands: { "no-such-id": { append: " --evil" } },
        },
      ],
    });
    const ctx = makeCtx({ port: { service: "http", product: null, version: null } });
    const out = applyConditionals(entry, ctx);
    expect(out.commands[0].template).toBe("gobuster dir -u http://{IP}");
    expect(out.commands[0].appendedBy).toEqual([]);
  });
});
