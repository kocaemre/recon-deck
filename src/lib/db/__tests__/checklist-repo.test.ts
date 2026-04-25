import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/helpers/db.js";
import { createFromScan, getById } from "../engagement-repo.js";
import { upsertCheck, getChecksByEngagement } from "../checklist-repo.js";
import { engagements } from "../schema.js";
import { eq } from "drizzle-orm";
import type { ParsedScan } from "../../parser/types.js";

// ---------------------------------------------------------------------------
// Test fixture factory
// ---------------------------------------------------------------------------

function makeScan(overrides: Partial<ParsedScan> = {}): ParsedScan {
  const target = overrides.target ?? { ip: "10.10.10.5" };
  const ports: ParsedScan["ports"] = overrides.ports ?? [
    {
      port: 445,
      protocol: "tcp",
      state: "open",
      service: "microsoft-ds",
      scripts: [],
    },
  ];
  const hostScripts = overrides.hostScripts ?? [];
  return {
    hosts: overrides.hosts ?? [{ target, ports, hostScripts }],
    target,
    source: overrides.source ?? "nmap-text",
    ports,
    hostScripts,
    warnings: overrides.warnings ?? [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("upsertCheck (Plan 03)", () => {
  let db: ReturnType<typeof createTestDb>;
  let engagementId: number;
  let portId: number;

  beforeEach(() => {
    db = createTestDb();
    // Create a fresh engagement + port for each test
    const result = createFromScan(db, makeScan(), "<raw>");
    engagementId = result.id;
    const full = getById(db, engagementId);
    portId = full!.ports[0].id;
  });

  it("D-12: creates check state with stable string check_key", () => {
    upsertCheck(db, engagementId, portId, "smb-null-session", true);
    const checks = getChecksByEngagement(db, engagementId);
    expect(checks).toHaveLength(1);
    expect(checks[0].check_key).toBe("smb-null-session");
    expect(checks[0].checked).toBe(true);
  });

  it("D-12: upsert toggles existing check (same composite key — no duplicate rows)", () => {
    upsertCheck(db, engagementId, portId, "smb-null-session", true);
    upsertCheck(db, engagementId, portId, "smb-null-session", false);
    const checks = getChecksByEngagement(db, engagementId);
    // Must be 1 row (upsert), not 2 (insert×2)
    expect(checks).toHaveLength(1);
    expect(checks[0].checked).toBe(false);
  });

  it("multiple check_keys on same port are independent rows", () => {
    upsertCheck(db, engagementId, portId, "smb-null-session", true);
    upsertCheck(db, engagementId, portId, "smb-guest-login", false);
    const checks = getChecksByEngagement(db, engagementId);
    expect(checks).toHaveLength(2);
    const keys = checks.map((c) => c.check_key).sort();
    expect(keys).toEqual(["smb-guest-login", "smb-null-session"]);
  });

  it("D-12: check_key is the stable string identifier, not a positional integer", () => {
    upsertCheck(db, engagementId, portId, "smb-null-session", true);
    const checks = getChecksByEngagement(db, engagementId);
    expect(typeof checks[0].check_key).toBe("string");
    expect(checks[0].check_key).toBe("smb-null-session");
    // Explicitly assert it is NOT stored as a number
    expect(typeof checks[0].check_key).not.toBe("number");
  });

  it("cascade: deleting engagement removes all check states", () => {
    upsertCheck(db, engagementId, portId, "smb-null-session", true);
    upsertCheck(db, engagementId, portId, "smb-guest-login", false);

    // Verify checks exist before delete
    expect(getChecksByEngagement(db, engagementId)).toHaveLength(2);

    // Delete engagement — cascade should remove check_states rows
    db.delete(engagements).where(eq(engagements.id, engagementId)).run();

    // After cascade delete, no checks should remain
    const checksAfter = getChecksByEngagement(db, engagementId);
    expect(checksAfter).toHaveLength(0);
  });
});
