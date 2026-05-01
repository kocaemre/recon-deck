import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  consumeToken,
  clientIp,
  __resetRateLimitForTests,
} from "../rate-limit.js";

describe("rate-limit token bucket", () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    // Force the limiter to apply to localhost too so tests are
    // independent of the operator's NODE_ENV / IP source.
    process.env.RECON_RATE_LIMIT = "force";
    delete process.env.RECON_RATE_LIMIT_BURST;
    delete process.env.RECON_RATE_LIMIT_PER_MIN;
  });

  afterEach(() => {
    delete process.env.RECON_RATE_LIMIT;
    delete process.env.RECON_RATE_LIMIT_BURST;
    delete process.env.RECON_RATE_LIMIT_PER_MIN;
  });

  it("allows up to the burst limit on a fresh bucket", () => {
    process.env.RECON_RATE_LIMIT_BURST = "5";
    process.env.RECON_RATE_LIMIT_PER_MIN = "60"; // 1/sec refill
    for (let i = 0; i < 5; i++) {
      const v = consumeToken("10.0.0.1");
      expect(v.allowed).toBe(true);
    }
    const blocked = consumeToken("10.0.0.1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("buckets are scoped per-IP", () => {
    process.env.RECON_RATE_LIMIT_BURST = "1";
    process.env.RECON_RATE_LIMIT_PER_MIN = "1";
    expect(consumeToken("10.0.0.1").allowed).toBe(true);
    expect(consumeToken("10.0.0.1").allowed).toBe(false);
    // Different IP still has a fresh bucket.
    expect(consumeToken("10.0.0.2").allowed).toBe(true);
  });

  it("RECON_RATE_LIMIT=off disables the limiter entirely", () => {
    process.env.RECON_RATE_LIMIT = "off";
    process.env.RECON_RATE_LIMIT_BURST = "1";
    for (let i = 0; i < 50; i++) {
      expect(consumeToken("10.0.0.1").allowed).toBe(true);
    }
  });

  it("localhost bypasses unless force-enabled", () => {
    process.env.RECON_RATE_LIMIT = "on"; // not "force"
    process.env.RECON_RATE_LIMIT_BURST = "1";
    for (let i = 0; i < 10; i++) {
      expect(consumeToken("127.0.0.1").allowed).toBe(true);
      expect(consumeToken("::1").allowed).toBe(true);
    }
  });

  it("clientIp prefers x-forwarded-for first hop", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(clientIp(h)).toBe("203.0.113.5");
  });

  it("clientIp falls back to x-real-ip then unknown", () => {
    expect(clientIp(new Headers({ "x-real-ip": "10.0.0.7" }))).toBe(
      "10.0.0.7",
    );
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
