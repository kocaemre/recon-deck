import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  __resetKbCacheForTests,
  getKb,
  invalidateKb,
} from "../cached.js";
import { matchPort } from "../matcher.js";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const SHIPPED_PORTS = path.join(REPO_ROOT, "knowledge", "ports");
const SHIPPED_DEFAULT = path.join(REPO_ROOT, "knowledge", "default.yaml");

const ENTRY_TEMPLATE = (port: number, service: string, label: string) => `schema_version: 1
port: ${port}
service: ${service}
protocol: tcp
aliases: []
risk: medium
checks:
  - key: ${service}-${port}-check
    label: ${label}
commands: []
resources: []
known_vulns: []
`;

let userDir: string;

beforeEach(() => {
  __resetKbCacheForTests();
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-cached-"));
});

afterEach(() => {
  fs.rmSync(userDir, { recursive: true, force: true });
  __resetKbCacheForTests();
});

describe("getKb (cached)", () => {
  it("returns a KnowledgeBase that resolves shipped entries", () => {
    const kb = getKb({
      shippedPortsDir: SHIPPED_PORTS,
      shippedDefaultFile: SHIPPED_DEFAULT,
      userDir,
    });
    // matcher always returns *something* (default entry on miss); the
    // shipped 22 (ssh) entry is part of the canonical fixtures, so the
    // round-trip exercises the loader without coupling to a brittle
    // count.
    const ssh = matchPort(kb, 22, "ssh");
    expect(ssh).toBeDefined();
    expect(ssh.port).toBe(22);
  });

  it("invalidateKb forces the next call to rebuild and pick up a new user file", () => {
    // Seed call so the cache has a baseline KB without the user file.
    fs.writeFileSync(
      path.join(userDir, "before.yaml"),
      ENTRY_TEMPLATE(8080, "http", "before"),
    );
    const before = getKb({
      shippedPortsDir: SHIPPED_PORTS,
      shippedDefaultFile: SHIPPED_DEFAULT,
      userDir,
    });
    expect(matchPort(before, 8080, "http").checks[0]?.label).toBe("before");

    // Add a new file under user dir; without invalidation the override
    // branch returns a fresh load each time (no cache touched), so the
    // test exercises the cached path next.
    __resetKbCacheForTests();
    fs.writeFileSync(
      path.join(userDir, "before.yaml"),
      ENTRY_TEMPLATE(8080, "http", "after"),
    );
    // Hydrate cache by calling without override — cached.ts uses
    // process.cwd() shipped paths and the env-var user dir. Set them
    // for this assertion only.
    const prevEnv = process.env.RECON_KB_USER_DIR;
    process.env.RECON_KB_USER_DIR = userDir;
    try {
      const cwdShippedPorts = path.join(process.cwd(), "knowledge", "ports");
      // Skip the cached-path assertion when the test is run from a
      // working directory that doesn't have the shipped KB on disk
      // (CI sandboxes that copy only `src` into the test root).
      if (!fs.existsSync(cwdShippedPorts)) return;

      const cached1 = getKb();
      expect(matchPort(cached1, 8080, "http").checks[0]?.label).toBe("after");

      // Update the file again and confirm `invalidateKb` makes the
      // next read see it.
      fs.writeFileSync(
        path.join(userDir, "before.yaml"),
        ENTRY_TEMPLATE(8080, "http", "after-bump"),
      );
      const cachedSame = getKb();
      // No invalidation yet → still serves the stale cached entry.
      expect(matchPort(cachedSame, 8080, "http").checks[0]?.label).toBe(
        "after",
      );

      invalidateKb();
      const cachedFresh = getKb();
      expect(matchPort(cachedFresh, 8080, "http").checks[0]?.label).toBe(
        "after-bump",
      );
    } finally {
      if (prevEnv === undefined) delete process.env.RECON_KB_USER_DIR;
      else process.env.RECON_KB_USER_DIR = prevEnv;
    }
  });

  it("override path always returns a fresh load (bypasses cache)", () => {
    const k1 = getKb({
      shippedPortsDir: SHIPPED_PORTS,
      shippedDefaultFile: SHIPPED_DEFAULT,
      userDir,
    });
    fs.writeFileSync(
      path.join(userDir, "extra.yaml"),
      ENTRY_TEMPLATE(9999, "custom", "first"),
    );
    const k2 = getKb({
      shippedPortsDir: SHIPPED_PORTS,
      shippedDefaultFile: SHIPPED_DEFAULT,
      userDir,
    });
    // First load saw no user file; second sees it. Override path
    // never caches between calls — that's the contract the validate
    // route relies on for dry-runs.
    expect(
      matchPort(k1, 9999, "custom").checks.some((c) => c.label === "first"),
    ).toBe(false);
    expect(matchPort(k2, 9999, "custom").checks[0]?.label).toBe("first");
  });
});
