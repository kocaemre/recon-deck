import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/helpers/db.js";
import {
  getAppState,
  setAppState,
  markOnboarded,
  replayOnboarding,
  effectiveAppState,
} from "../app-state-repo.js";

describe("app-state-repo (v1.9.0 #onboarding)", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    delete process.env.RECON_LOCAL_EXPORT_DIR;
    delete process.env.NEXT_PUBLIC_RECON_LOCAL_EXPORT_DIR;
    delete process.env.RECON_KB_USER_DIR;
  });

  it("seeded singleton row exists with onboarded_at = null", () => {
    const row = getAppState(db);
    expect(row.id).toBe(1);
    expect(row.onboarded_at).toBeNull();
    expect(row.update_check).toBe(false);
  });

  it("setAppState updates only the supplied fields", () => {
    const before = getAppState(db).updated_at;
    const row = setAppState(db, { local_export_dir: "/tmp/exports" });
    expect(row.local_export_dir).toBe("/tmp/exports");
    expect(row.kb_user_dir).toBeNull();
    // updated_at bumps regardless of which fields were touched.
    expect(row.updated_at).not.toBe(before);
  });

  it("markOnboarded stamps now() + payload", () => {
    const row = markOnboarded(db, {
      local_export_dir: "/tmp/exports",
      kb_user_dir: null,
      wordlist_base: null,
      update_check: true,
    });
    expect(row.onboarded_at).not.toBeNull();
    expect(row.update_check).toBe(true);
    expect(row.local_export_dir).toBe("/tmp/exports");
  });

  it("replayOnboarding clears onboarded_at without touching paths", () => {
    markOnboarded(db, {
      local_export_dir: "/tmp/exports",
      kb_user_dir: null,
      wordlist_base: null,
      update_check: false,
    });
    const after = replayOnboarding(db);
    expect(after.onboarded_at).toBeNull();
    // Paths survive — replay is a re-walk-the-flow, not a wipe.
    expect(after.local_export_dir).toBe("/tmp/exports");
  });

  it("effectiveAppState prefers DB over env", () => {
    process.env.RECON_LOCAL_EXPORT_DIR = "/from/env";
    setAppState(db, { local_export_dir: "/from/db" });
    expect(effectiveAppState(db).localExportDir).toBe("/from/db");
  });

  it("effectiveAppState falls back to env when DB is null", () => {
    process.env.RECON_LOCAL_EXPORT_DIR = "/from/env";
    expect(effectiveAppState(db).localExportDir).toBe("/from/env");
  });

  it("effectiveAppState returns null when neither DB nor env is set", () => {
    expect(effectiveAppState(db).localExportDir).toBeNull();
    expect(effectiveAppState(db).kbUserDir).toBeNull();
    expect(effectiveAppState(db).wordlistBase).toBeNull();
  });
});
