import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadKnowledgeBase, type KnowledgeBase } from "../loader.js";
import { matchPort } from "../matcher.js";

const FIXTURES = path.resolve(__dirname, "../../../../tests/fixtures/kb");
const SHIPPED_DIR = path.join(FIXTURES, "shipped");
const SHIPPED_DEFAULT = path.join(SHIPPED_DIR, "default.yaml");

// Build an isolated shipped dir excluding default.yaml so the default entry
// (port: 0, service: "unknown") is not also indexed as a port entry. Mirrors
// the pattern used in loader.test.ts.
let isolatedShippedDir: string;
let kb: KnowledgeBase;

beforeAll(() => {
  isolatedShippedDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-matcher-"));
  for (const f of fs.readdirSync(SHIPPED_DIR)) {
    if (f === "default.yaml") continue;
    fs.copyFileSync(path.join(SHIPPED_DIR, f), path.join(isolatedShippedDir, f));
  }
  kb = loadKnowledgeBase({
    shippedPortsDir: isolatedShippedDir,
    shippedDefaultFile: SHIPPED_DEFAULT,
  });
});

afterAll(() => {
  fs.rmSync(isolatedShippedDir, { recursive: true, force: true });
});

describe("matchPort (Plan 04)", () => {
  it("KB-12/D-04: returns exact entry for {port}-{service}", () => {
    const entry = matchPort(kb, 445, "smb");
    expect(entry.port).toBe(445);
    expect(entry.service).toBe("smb");
  });

  it("KB-12/D-09: resolves alias `microsoft-ds` → smb entry", () => {
    const entry = matchPort(kb, 445, "microsoft-ds");
    expect(entry.port).toBe(445);
    // Canonical service unchanged — alias resolves to same KbEntry
    expect(entry.service).toBe("smb");
  });

  it("D-07: match is case-insensitive (SMB resolves)", () => {
    const entry = matchPort(kb, 445, "SMB");
    expect(entry.port).toBe(445);
    expect(entry.service).toBe("smb");
  });

  it("T-07: match is unicode-normalized (NFC) on service name", () => {
    // \u0062 is plain ASCII 'b' — sanity check that normalize() at lookup is
    // idempotent. The deeper NFC behavior is exercised in loader tests.
    const entry = matchPort(kb, 445, "sm\u0062");
    expect(entry.port).toBe(445);
    expect(entry.service).toBe("smb");
  });

  it("Success Criterion 3: unknown port falls through to default.yaml entry", () => {
    const entry = matchPort(kb, 12345, "weird");
    expect(entry.service).toBe("unknown");
    expect(entry.port).toBe(0);
  });

  it("Success Criterion 3: never returns undefined for any input", () => {
    expect(matchPort(kb, 99999, undefined)).toBeTruthy();
    expect(matchPort(kb, 99999, "")).toBeTruthy();
    expect(matchPort(kb, 0, "anything")).toBeTruthy();
  });

  it("D-04: undefined service skips exact match and falls back to default (no port-only in v1.0)", () => {
    // matchPort(kb, 22, undefined) — D-04 step 1 needs service; undefined skips
    // to port-only (CD-04: none ship in v1.0) then default.
    const entry = matchPort(kb, 22, undefined);
    expect(entry.service).toBe("unknown");
  });

  it("D-04: matchPort(kb, 80, undefined) falls back to default when no port-only exists", () => {
    const entry = matchPort(kb, 80, undefined);
    expect(entry.service).toBe("unknown");
    expect(entry.port).toBe(0);
  });
});
