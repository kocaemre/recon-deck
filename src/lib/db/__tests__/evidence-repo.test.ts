import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/helpers/db.js";
import { createEvidence, listEvidenceForEngagement } from "../evidence-repo.js";
import { createFromScan } from "../engagement-repo.js";
import type { ParsedScan } from "../../parser/types.js";

function makeScan(): ParsedScan {
  const target = { ip: "10.10.10.5" };
  const ports: ParsedScan["ports"] = [
    { port: 80, protocol: "tcp", state: "open", service: "http", scripts: [] },
  ];
  return {
    hosts: [{ target, ports, hostScripts: [] }],
    target,
    source: "nmap-text",
    ports,
    hostScripts: [],
    warnings: [],
  };
}

describe("evidence-repo (v2.0.0 #7)", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("createEvidence with parentEvidenceId persists the parent linkage", () => {
    const eng = createFromScan(db, makeScan(), "<raw>");

    const original = createEvidence(db, {
      engagementId: eng.id,
      portId: null,
      filename: "shot.png",
      mime: "image/png",
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });
    expect(original.parent_evidence_id).toBeNull();

    const annotated = createEvidence(db, {
      engagementId: eng.id,
      portId: null,
      filename: "shot.annotated.png",
      mime: "image/png",
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      parentEvidenceId: original.id,
    });
    expect(annotated.parent_evidence_id).toBe(original.id);

    // Original survives — annotation never overwrites the source row.
    const all = listEvidenceForEngagement(db, eng.id);
    expect(all.map((e) => e.id).sort()).toEqual(
      [original.id, annotated.id].sort(),
    );
  });

  it("parent_evidence_id defaults to null on legacy uploads", () => {
    const eng = createFromScan(db, makeScan(), "<raw>");
    const row = createEvidence(db, {
      engagementId: eng.id,
      portId: null,
      filename: "plain.png",
      mime: "image/png",
      bytes: Buffer.from([0x89]),
    });
    expect(row.parent_evidence_id).toBeNull();
  });
});
