import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkWritability } from "../probe.js";

// The read-only-directory tests rely on a 0o444 chmod actually denying writes.
// Root bypasses permission bits, so under root (common in CI containers / the
// QA Docker box) the probe succeeds and the expected process.exit never fires.
// Skip those two cases when running as root rather than report a false failure.
const isRoot =
  typeof process.getuid === "function" && process.getuid() === 0;

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
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("PERSIST-06: creates directory if it does not exist", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "probe-mkdir-"));
    dirs.push(base);
    const subdir = path.join(base, "nested", "subdir");

    expect(() => checkWritability(subdir)).not.toThrow();

    // The subdir should have been created
    expect(fs.existsSync(subdir)).toBe(true);
  });

  it("keeps overlapping probes from deleting each other's sentinel", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-overlap-"));
    dirs.push(dir);
    const write = fs.writeFileSync;
    let secondCompleted = false;
    let overlapping = false;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });
    const stderrSpy = vi.spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      write(file, data, options);
      if (!overlapping) {
        // Deterministically interleave two real probes: the second completes
        // after the first writes its sentinel but before it reads it back.
        overlapping = true;
        checkWritability(dir);
        secondCompleted = true;
      }
    });

    expect(() => checkWritability(dir)).not.toThrow();
    expect(secondCompleted).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it.each(["write", "read", "delete"] as const)(
    "cleans up after a %s failure while preserving the fatal diagnostic",
    (stage) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-failure-"));
      dirs.push(dir);
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("EXIT");
      });
      const stderrSpy = vi.spyOn(process.stderr, "write")
        .mockImplementation(() => true);
      let message: string;

      if (stage === "write") {
        message = "Write failed after creating the sentinel";
        const write = fs.writeFileSync;
        vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
          write(file, data, options);
          throw new Error(message);
        });
      } else if (stage === "read") {
        message = "Read-back mismatch";
        vi.spyOn(fs, "readFileSync").mockReturnValue("unexpected content");
      } else {
        message = "Cannot delete sentinel";
        vi.spyOn(fs, "unlinkSync").mockImplementationOnce(() => {
          throw new Error(message);
        });
      }

      expect(() => checkWritability(dir)).toThrow("EXIT");
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining(`FATAL: Data directory not writable: ${message}`),
      );
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining(dir));
      expect(fs.readdirSync(dir)).toEqual([]);
    },
  );

  it.skipIf(isRoot)("PERSIST-06: calls process.exit(1) on read-only directory", () => {
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

  it.skipIf(isRoot)("PERSIST-06: includes the directory path in error message", () => {
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
