import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/helpers/db.js";
import { createFromScan, getById } from "../engagement-repo.js";
import { upsertNote, getNotesByEngagement } from "../notes-repo.js";
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
      port: 22,
      protocol: "tcp",
      state: "open",
      service: "ssh",
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

describe("upsertNote (Plan 03)", () => {
  let db: ReturnType<typeof createTestDb>;
  let engagementId: number;
  let portId: number;

  beforeEach(() => {
    db = createTestDb();
    const result = createFromScan(db, makeScan(), "<raw>");
    engagementId = result.id;
    const full = getById(db, engagementId);
    portId = full!.ports[0].id;
  });

  it("creates a note for a port", () => {
    upsertNote(db, engagementId, portId, "Try hydra with rockyou.txt");
    const notes = getNotesByEngagement(db, engagementId);
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe("Try hydra with rockyou.txt");
    expect(notes[0].port_id).toBe(portId);
    expect(notes[0].engagement_id).toBe(engagementId);
  });

  it("upsert updates existing note body (no duplicate rows)", () => {
    upsertNote(db, engagementId, portId, "First note");
    upsertNote(db, engagementId, portId, "Updated note");
    const notes = getNotesByEngagement(db, engagementId);
    // Must be 1 row (upsert), not 2 (insert×2)
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe("Updated note");
  });

  it("empty string body is valid — user can clear the notes field", () => {
    upsertNote(db, engagementId, portId, "something");
    upsertNote(db, engagementId, portId, "");
    const notes = getNotesByEngagement(db, engagementId);
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe("");
  });

  it("notes appear in getById FullEngagement.ports[].notes", () => {
    upsertNote(db, engagementId, portId, "My note");
    const full = getById(db, engagementId);
    expect(full).not.toBeNull();
    const port = full!.ports.find((p) => p.id === portId);
    expect(port).toBeDefined();
    expect(port!.notes).not.toBeNull();
    expect(port!.notes!.body).toBe("My note");
  });

  it("cascade: deleting engagement removes all port notes", () => {
    upsertNote(db, engagementId, portId, "Some notes");

    // Verify note exists before delete
    expect(getNotesByEngagement(db, engagementId)).toHaveLength(1);

    // Delete engagement — cascade should remove port_notes rows
    db.delete(engagements).where(eq(engagements.id, engagementId)).run();

    // After cascade delete, no notes should remain
    const notesAfter = getNotesByEngagement(db, engagementId);
    expect(notesAfter).toHaveLength(0);
  });
});
