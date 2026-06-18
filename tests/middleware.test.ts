/**
 * SEC-01 — Host-header validation tests.
 *
 * These tests target the pure `getAllowedHosts()` export in
 * `src/lib/security/host-validation.ts`. The Next.js middleware
 * (middleware.ts at project root) imports from this module, so the
 * allowlist logic is exercised through the same code path used in
 * production — we just avoid having to mock NextRequest/NextResponse.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  getAllowedHosts,
  isHostAllowed,
} from "../src/lib/security/host-validation.js";

describe("Host-header validation (SEC-01)", () => {
  const originalTrustedHosts = process.env.RECON_DECK_TRUSTED_HOSTS;
  const originalPort = process.env.PORT;

  afterEach(() => {
    if (originalTrustedHosts === undefined) {
      delete process.env.RECON_DECK_TRUSTED_HOSTS;
    } else {
      process.env.RECON_DECK_TRUSTED_HOSTS = originalTrustedHosts;
    }
    if (originalPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalPort;
    }
  });

  it("allows localhost:13337 by default", () => {
    delete process.env.RECON_DECK_TRUSTED_HOSTS;
    const hosts = getAllowedHosts();
    expect(hosts.has("localhost:13337")).toBe(true);
  });

  it("allows 127.0.0.1:13337 by default", () => {
    delete process.env.RECON_DECK_TRUSTED_HOSTS;
    const hosts = getAllowedHosts();
    expect(hosts.has("127.0.0.1:13337")).toBe(true);
  });

  it("allows [::1]:13337 by default", () => {
    delete process.env.RECON_DECK_TRUSTED_HOSTS;
    const hosts = getAllowedHosts();
    expect(hosts.has("[::1]:13337")).toBe(true);
  });

  it("rejects evil.com:13337 (DNS rebinding vector)", () => {
    delete process.env.RECON_DECK_TRUSTED_HOSTS;
    const hosts = getAllowedHosts();
    expect(hosts.has("evil.com:13337")).toBe(false);
  });

  it("rejects empty host header", () => {
    delete process.env.RECON_DECK_TRUSTED_HOSTS;
    const hosts = getAllowedHosts();
    expect(hosts.has("")).toBe(false);
  });

  it("extends allowlist from RECON_DECK_TRUSTED_HOSTS env var", () => {
    process.env.RECON_DECK_TRUSTED_HOSTS = "mybox.local:13337,10.0.0.5:13337";
    const hosts = getAllowedHosts();
    expect(hosts.has("mybox.local:13337")).toBe(true);
    expect(hosts.has("10.0.0.5:13337")).toBe(true);
    // defaults still present
    expect(hosts.has("localhost:13337")).toBe(true);
  });

  it("trims whitespace in RECON_DECK_TRUSTED_HOSTS entries", () => {
    process.env.RECON_DECK_TRUSTED_HOSTS = " mybox.local:13337 , 10.0.0.5:13337 ";
    const hosts = getAllowedHosts();
    expect(hosts.has("mybox.local:13337")).toBe(true);
    expect(hosts.has("10.0.0.5:13337")).toBe(true);
  });

  it("ignores empty entries in RECON_DECK_TRUSTED_HOSTS", () => {
    process.env.RECON_DECK_TRUSTED_HOSTS = "mybox.local:13337,,";
    const hosts = getAllowedHosts();
    expect(hosts.has("mybox.local:13337")).toBe(true);
    expect(hosts.has("")).toBe(false);
  });

  it("uses PORT env var for default allowlist entries", () => {
    delete process.env.RECON_DECK_TRUSTED_HOSTS;
    process.env.PORT = "8080";
    const hosts = getAllowedHosts();
    expect(hosts.has("localhost:8080")).toBe(true);
    expect(hosts.has("127.0.0.1:8080")).toBe(true);
    expect(hosts.has("[::1]:8080")).toBe(true);
    // Old port 13337 entries should NOT be present
    expect(hosts.has("localhost:13337")).toBe(false);
  });

  it("defaults to port 13337 when PORT env is not set", () => {
    delete process.env.RECON_DECK_TRUSTED_HOSTS;
    delete process.env.PORT;
    const hosts = getAllowedHosts();
    expect(hosts.has("localhost:13337")).toBe(true);
    expect(hosts.has("127.0.0.1:13337")).toBe(true);
    expect(hosts.has("[::1]:13337")).toBe(true);
  });
});

describe("isHostAllowed — loopback on any port (custom host-port mapping)", () => {
  const originalTrustedHosts = process.env.RECON_DECK_TRUSTED_HOSTS;
  const originalPort = process.env.PORT;

  afterEach(() => {
    if (originalTrustedHosts === undefined) {
      delete process.env.RECON_DECK_TRUSTED_HOSTS;
    } else {
      process.env.RECON_DECK_TRUSTED_HOSTS = originalTrustedHosts;
    }
    if (originalPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalPort;
    }
  });

  it("allows loopback hosts on a non-default port (RECON_DECK_PORT=13339 → 421 fix)", () => {
    delete process.env.RECON_DECK_TRUSTED_HOSTS;
    delete process.env.PORT; // container's internal PORT stays 13337
    expect(isHostAllowed("localhost:13339")).toBe(true);
    expect(isHostAllowed("127.0.0.1:13339")).toBe(true);
    expect(isHostAllowed("[::1]:13339")).toBe(true);
  });

  it("allows a bare loopback host with no port", () => {
    expect(isHostAllowed("localhost")).toBe(true);
    expect(isHostAllowed("127.0.0.1")).toBe(true);
  });

  it("still rejects non-loopback hosts on any port (rebinding stays blocked)", () => {
    delete process.env.RECON_DECK_TRUSTED_HOSTS;
    expect(isHostAllowed("evil.com:13339")).toBe(false);
    expect(isHostAllowed("evil.com")).toBe(false);
    // no prefix/suffix bypass of the loopback names
    expect(isHostAllowed("localhost.evil.com:13339")).toBe(false);
    expect(isHostAllowed("notlocalhost:13339")).toBe(false);
  });

  it("still honours an exact RECON_DECK_TRUSTED_HOSTS match", () => {
    process.env.RECON_DECK_TRUSTED_HOSTS = "mybox.local:13337";
    expect(isHostAllowed("mybox.local:13337")).toBe(true);
    // but not that LAN host on a different port (exact match only for non-loopback)
    expect(isHostAllowed("mybox.local:9999")).toBe(false);
  });
});
