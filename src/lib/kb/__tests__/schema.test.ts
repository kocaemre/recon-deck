import { describe, it, expect } from "vitest";
import {
  KbEntrySchema,
  ResourceSchema,
  RiskSchema,
} from "../schema.js";

// Helper: minimal valid entry — required fields only
const minimalEntry = () => ({
  schema_version: 1 as const,
  port: 22,
  service: "ssh",
});

describe("KbEntrySchema (Plan 02)", () => {
  it("KB-02: validates required port, protocol, service, aliases, checks, commands, resources, risk (defaults applied)", () => {
    const result = KbEntrySchema.safeParse(minimalEntry());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.port).toBe(22);
      expect(result.data.service).toBe("ssh");
      expect(result.data.protocol).toBe("tcp");
      expect(result.data.aliases).toEqual([]);
      expect(result.data.checks).toEqual([]);
      expect(result.data.commands).toEqual([]);
      expect(result.data.resources).toEqual([]);
      expect(result.data.risk).toBe("info");
    }
  });

  it("KB-03: rejects entry missing schema_version literal 1", () => {
    const { schema_version: _omit, ...rest } = minimalEntry();
    const result = KbEntrySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("KB-03: rejects entry with schema_version: 2 (must be literal 1)", () => {
    const result = KbEntrySchema.safeParse({ ...minimalEntry(), schema_version: 2 });
    expect(result.success).toBe(false);
  });

  it("KB-04: accepts optional default_creds[] with {username,password,notes?}", () => {
    const result = KbEntrySchema.safeParse({
      ...minimalEntry(),
      default_creds: [
        { username: "admin", password: "admin" },
        { username: "root", password: "toor", notes: "common default" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.default_creds?.length).toBe(2);
    }
  });

  it("KB-05: accepts optional quick_facts[] as string array", () => {
    const result = KbEntrySchema.safeParse({
      ...minimalEntry(),
      quick_facts: ["uses TCP", "default port"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quick_facts).toEqual(["uses TCP", "default port"]);
    }
  });

  it("KB-06: accepts optional known_vulns[] with {match,note,link}", () => {
    const result = KbEntrySchema.safeParse({
      ...minimalEntry(),
      known_vulns: [
        {
          match: "Samba 3.0",
          note: "CVE-2007-2447",
          link: "https://nvd.nist.gov/vuln/detail/CVE-2007-2447",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("KB-08/T-03: rejects resource entry with a `description` prose field (strict)", () => {
    const result = KbEntrySchema.safeParse({
      ...minimalEntry(),
      resources: [
        {
          title: "HackTricks SSH",
          url: "https://book.hacktricks.xyz/network-services-pentesting/pentesting-ssh",
          description: "PROSE that should not be allowed per KB-08",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("KB-08/T-03: rejects resource entry with a `content` prose field (strict)", () => {
    const result = KbEntrySchema.safeParse({
      ...minimalEntry(),
      resources: [
        {
          title: "x",
          url: "https://example.com",
          content: "BODY PROSE",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("KB-11/T-02: rejects resource URL with `javascript:` scheme", () => {
    const result = KbEntrySchema.safeParse({
      ...minimalEntry(),
      resources: [{ title: "x", url: "javascript:alert(1)" }],
    });
    expect(result.success).toBe(false);
  });

  it("KB-11/T-02: rejects resource URL with `data:` scheme", () => {
    const result = KbEntrySchema.safeParse({
      ...minimalEntry(),
      resources: [{ title: "x", url: "data:text/html,<script>alert(1)</script>" }],
    });
    expect(result.success).toBe(false);
  });

  it("KB-11: accepts https:// resource URLs", () => {
    const result = KbEntrySchema.safeParse({
      ...minimalEntry(),
      resources: [{ title: "x", url: "https://ok.com" }],
    });
    expect(result.success).toBe(true);
  });

  it("KB-11: accepts http:// resource URLs (per D-15)", () => {
    const result = KbEntrySchema.safeParse({
      ...minimalEntry(),
      resources: [{ title: "x", url: "http://ok.com" }],
    });
    expect(result.success).toBe(true);
  });

  it("D-13: accepts risk: 'critical'", () => {
    const result = KbEntrySchema.safeParse({ ...minimalEntry(), risk: "critical" });
    expect(result.success).toBe(true);
  });

  it("D-13: rejects risk: 'catastrophic' (not in enum)", () => {
    const result = KbEntrySchema.safeParse({ ...minimalEntry(), risk: "catastrophic" });
    expect(result.success).toBe(false);
  });

  it("T-04: rejects unknown top-level fields (strict)", () => {
    const result = KbEntrySchema.safeParse({ ...minimalEntry(), rogue_field: "evil" });
    expect(result.success).toBe(false);
  });

  it("ResourceSchema: accepts optional author field", () => {
    const result = ResourceSchema.safeParse({
      title: "HackTricks SSH",
      url: "https://book.hacktricks.xyz/ssh",
      author: "HackTricks",
    });
    expect(result.success).toBe(true);
  });

  it("RiskSchema: accepts all 5 levels", () => {
    for (const r of ["info", "low", "medium", "high", "critical"] as const) {
      expect(RiskSchema.safeParse(r).success).toBe(true);
    }
  });
});
