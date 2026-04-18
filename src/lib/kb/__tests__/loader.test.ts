import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadKnowledgeBase } from "../loader.js";

const FIXTURES = path.resolve(__dirname, "../../../../tests/fixtures/kb");
const SHIPPED_DIR = path.join(FIXTURES, "shipped");
const SHIPPED_DEFAULT = path.join(SHIPPED_DIR, "default.yaml");
const USER_DIR = path.join(FIXTURES, "user");
const INVALID_DIR = path.join(FIXTURES, "invalid");

// Helper: shipped dir minus default.yaml — loader treats default as separate file
// Fixtures put default.yaml inside shipped/. We pass shippedPortsDir = shipped dir
// and the loader will iterate every .yaml. Our 22-ssh + 445-smb + default.yaml
// all parse cleanly so iteration over default.yaml is harmless; but the loader
// also separately loads `shippedDefaultFile` for getDefault(). To avoid the
// default file being indexed as a port entry (port: 0, service: "unknown") we
// build a temp shipped dir that excludes default.yaml.
let isolatedShippedDir: string;

beforeAll(() => {
  isolatedShippedDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-shipped-"));
  for (const f of fs.readdirSync(SHIPPED_DIR)) {
    if (f === "default.yaml") continue;
    fs.copyFileSync(path.join(SHIPPED_DIR, f), path.join(isolatedShippedDir, f));
  }
});

afterAll(() => {
  fs.rmSync(isolatedShippedDir, { recursive: true, force: true });
});

describe("loadKnowledgeBase (Plan 03)", () => {
  it("KB-01: loads all YAMLs from shippedPortsDir and keys by {port}-{service}", () => {
    const kb = loadKnowledgeBase({
      shippedPortsDir: isolatedShippedDir,
      shippedDefaultFile: SHIPPED_DEFAULT,
    });
    expect(kb.get("22-ssh")?.port).toBe(22);
    expect(kb.get("22-ssh")?.service).toBe("ssh");
    expect(kb.get("445-smb")?.port).toBe(445);
    expect(kb.get("445-smb")?.service).toBe("smb");
  });

  it("KB-10/D-10: user YAML at matching {port}-{service} replaces shipped entry (full replacement)", () => {
    const kb = loadKnowledgeBase({
      shippedPortsDir: isolatedShippedDir,
      shippedDefaultFile: SHIPPED_DEFAULT,
      userDir: USER_DIR,
    });
    const smb = kb.get("445-smb");
    expect(smb?.risk).toBe("critical");
    // user fixture's only command is enum4linux-ng — full replacement, not merge
    expect(smb?.commands.length).toBe(1);
    expect(smb?.commands[0].label).toContain("User-override");
  });

  it("KB-10: user override does not leak into non-overridden keys (22-ssh stays shipped)", () => {
    const kb = loadKnowledgeBase({
      shippedPortsDir: isolatedShippedDir,
      shippedDefaultFile: SHIPPED_DEFAULT,
      userDir: USER_DIR,
    });
    expect(kb.get("22-ssh")?.risk).toBe("medium");
  });

  it("T-05: passing userDir for a nonexistent path does not throw (fs.existsSync guard)", () => {
    expect(() =>
      loadKnowledgeBase({
        shippedPortsDir: isolatedShippedDir,
        shippedDefaultFile: SHIPPED_DEFAULT,
        userDir: "/definitely/nonexistent/path/here",
      }),
    ).not.toThrow();
  });

  it("T-06: invalid user YAML emits console.warn and does not throw", () => {
    const tmpUserDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-user-bad-"));
    fs.writeFileSync(
      path.join(tmpUserDir, "garbage.yaml"),
      "this: is: not: valid: yaml: [unclosed",
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() =>
        loadKnowledgeBase({
          shippedPortsDir: isolatedShippedDir,
          shippedDefaultFile: SHIPPED_DEFAULT,
          userDir: tmpUserDir,
        }),
      ).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
      const callArg = String(warnSpy.mock.calls[0]?.[0] ?? "");
      expect(callArg).toContain("garbage.yaml");
    } finally {
      warnSpy.mockRestore();
      fs.rmSync(tmpUserDir, { recursive: true, force: true });
    }
  });

  it("D-18: invalid shipped YAML throws hard at boot", () => {
    const tmpShipped = fs.mkdtempSync(path.join(os.tmpdir(), "kb-shipped-bad-"));
    fs.copyFileSync(
      path.join(INVALID_DIR, "prose-in-resource.yaml"),
      path.join(tmpShipped, "80-http.yaml"),
    );
    try {
      expect(() =>
        loadKnowledgeBase({
          shippedPortsDir: tmpShipped,
          shippedDefaultFile: SHIPPED_DEFAULT,
        }),
      ).toThrow();
    } finally {
      fs.rmSync(tmpShipped, { recursive: true, force: true });
    }
  });

  it("D-05: aliases fan out — kb.get('445-microsoft-ds') returns same entry as 445-smb", () => {
    const kb = loadKnowledgeBase({
      shippedPortsDir: isolatedShippedDir,
      shippedDefaultFile: SHIPPED_DEFAULT,
    });
    const viaCanonical = kb.get("445-smb");
    const viaAlias = kb.get("445-microsoft-ds");
    expect(viaAlias).toBeDefined();
    expect(viaAlias).toBe(viaCanonical);
    // also second alias
    expect(kb.get("445-cifs")).toBe(viaCanonical);
  });

  it("D-07/T-07: service is NFC-normalized + lowercased — uppercase lookup resolves", () => {
    const kb = loadKnowledgeBase({
      shippedPortsDir: isolatedShippedDir,
      shippedDefaultFile: SHIPPED_DEFAULT,
    });
    // get() should normalize input to lowercase NFC
    expect(kb.get("445-SMB")).toBeDefined();
    expect(kb.get("22-SSH")?.service).toBe("ssh");
  });

  it("getDefault() returns the parsed default.yaml entry", () => {
    const kb = loadKnowledgeBase({
      shippedPortsDir: isolatedShippedDir,
      shippedDefaultFile: SHIPPED_DEFAULT,
    });
    const def = kb.getDefault();
    expect(def.port).toBe(0);
    expect(def.service).toBe("unknown");
  });
});
