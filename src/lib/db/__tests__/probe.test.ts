import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkWritability } from "../probe.js";

describe("checkWritability (Plan 02)", () => {
  const dirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up temp directories created during tests
    for (const d of dirs.splice(0)) {
      try {
        // Ensure permissions are restored before removal
        if (fs.existsSync(d)) {
          fs.chmodSync(d, 0o755);
          fs.rmSync(d, { recursive: true, force: true });
        }
      } catch {
        // best-effort cleanup
      }
    }
  });

  it("PERSIST-06: succeeds silently on writable directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-ok-"));
    dirs.push(dir);

    // Should not throw
    expect(() => checkWritability(dir)).not.toThrow();

    // Probe file must be cleaned up after successful run
    const probe = path.join(dir, ".recon-deck-writable-probe");
    expect(fs.existsSync(probe)).toBe(false);
  });

  it("PERSIST-06: creates directory if it does not exist", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "probe-mkdir-"));
    dirs.push(base);
    const subdir = path.join(base, "nested", "subdir");

    expect(() => checkWritability(subdir)).not.toThrow();

    // The subdir should have been created
    expect(fs.existsSync(subdir)).toBe(true);
  });

  it("PERSIST-06: calls process.exit(1) on read-only directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-ro-"));
    dirs.push(dir);

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: number | string | null | undefined) => {
        throw new Error("EXIT");
      });
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    // Make directory read-only
    fs.chmodSync(dir, 0o444);

    expect(() => checkWritability(dir)).toThrow("EXIT");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("FATAL: Data directory not writable"),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("chown 1000:1000"),
    );

    // Restore permissions so afterEach cleanup works
    fs.chmodSync(dir, 0o755);
  });

  it("PERSIST-06: includes the directory path in error message", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-path-"));
    dirs.push(dir);

    vi.spyOn(process, "exit").mockImplementation(
      (_code?: number | string | null | undefined) => {
        throw new Error("EXIT");
      },
    );
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    fs.chmodSync(dir, 0o444);

    expect(() => checkWritability(dir)).toThrow("EXIT");

    // The actual path must appear in the error message
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining(dir));

    fs.chmodSync(dir, 0o755);
  });
});
