import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../../../tests/helpers/db.js";
import { parseNmapXml } from "../../parser/nmap-xml.js";
import {
  cloneEngagement,
  createFromScan,
  deleteEngagement,
  getById,
  setEngagementTags,
  setEngagementWriteup,
} from "../engagement-repo.js";
import { createEvidence, listEvidenceForEngagement } from "../evidence-repo.js";
import { createFinding } from "../findings-repo.js";
import { listForPort, replaceForPort } from "../fingerprints-repo.js";
import { setPortStar } from "../ports-repo.js";
import { port_evidence } from "../schema.js";

const raw = `<nmaprun>
  <host><status state="up"/><address addr="192.0.2.10" addrtype="ipv4"/>
    <ports><port protocol="tcp" portid="80"><state state="open"/>
      <service name="http" product="Apache httpd" version="2.4.49"/>
    </port></ports>
  </host>
  <host><status state="up"/><address addr="192.0.2.20" addrtype="ipv4"/>
    <ports><port protocol="tcp" portid="80"><state state="open"/>
      <service name="http" product="nginx"/>
    </port></ports>
  </host>
</nmaprun>`;

describe("cloneEngagement content preservation", () => {
  let db: ReturnType<typeof createTestDb>;
  let sourceId: number;

  beforeEach(() => {
    db = createTestDb();
    sourceId = createFromScan(db, parseNmapXml(raw), raw).id;
  });

  afterEach(() => db.$client.close());

  it("preserves the operator's writeup and tags", () => {
    setEngagementWriteup(db, sourceId, "## Findings\n\nReview the web hosts.");
    setEngagementTags(db, sourceId, ["lab", "web"]);

    const copy = getById(db, cloneEngagement(db, sourceId)!)!;
    expect(copy.writeup).toBe("## Findings\n\nReview the web hosts.");
    expect(JSON.parse(copy.tags)).toEqual(["lab", "web"]);

    setEngagementWriteup(db, sourceId, "Changed source");
    setEngagementTags(db, sourceId, ["changed"]);
    expect(getById(db, copy.id)!.writeup).toBe(copy.writeup);
    expect(getById(db, copy.id)!.tags).toBe(copy.tags);
  });

  it("preserves starred ports without starring other hosts' ports", () => {
    const source = getById(db, sourceId)!;
    setPortStar(db, sourceId, source.ports[0].id, true);

    const copy = getById(db, cloneEngagement(db, sourceId)!)!;
    expect(copy.ports.map((p) => p.starred)).toEqual([true, false]);
  });

  it("copies both fingerprint sources onto each corresponding new port", () => {
    const source = getById(db, sourceId)!;
    db.transaction((tx) => {
      replaceForPort(tx, source.ports[0].id, "autorecon", [
        { type: "tech", value: "php" },
        { type: "cves", value: "CVE-2021-41773" },
      ]);
    });
    const copy = getById(db, cloneEngagement(db, sourceId)!)!;
    const signals = (portId: number) => listForPort(db, portId)
      .map((f) => `${f.source}:${f.type}:${f.value}`).sort();

    for (const host of source.hosts) {
      const oldPort = source.ports.find((p) => p.host_id === host.id)!;
      const newHost = copy.hosts.find((h) => h.ip === host.ip)!;
      const newPort = copy.ports.find((p) => p.host_id === newHost.id)!;
      expect(signals(oldPort.id).length).toBeGreaterThan(0);
      expect(signals(newPort.id)).toEqual(signals(oldPort.id));
    }

    deleteEngagement(db, sourceId);
    expect(signals(copy.ports[0].id)).toContain("autorecon:tech:php");
  });

  it("remaps annotation chains and finding evidence refs within the copy", () => {
    const portId = getById(db, sourceId)!.ports[0].id;
    const capture = (filename: string, parentEvidenceId?: number) => createEvidence(db, {
      engagementId: sourceId,
      portId,
      filename,
      mime: "image/png",
      bytes: Buffer.from(filename),
      parentEvidenceId,
    });
    const earlyChild = capture("early-child.png");
    const original = capture("original.png");
    const annotated = capture("annotated.png", original.id);
    const revised = capture("revised.png", annotated.id);
    createFinding(db, {
      engagementId: sourceId,
      portId,
      title: "Web finding",
      severity: "medium",
      evidenceRefs: [original.id, revised.id],
    });
    // Parent ids need not sort before their children in an imported DB.
    db.update(port_evidence).set({ parent_evidence_id: revised.id })
      .where(eq(port_evidence.id, earlyChild.id)).run();

    const copy = getById(db, cloneEngagement(db, sourceId)!)!;
    const evidence = listEvidenceForEngagement(db, copy.id);
    const byName = new Map(evidence.map((e) => [e.filename, e]));
    const newOriginal = byName.get("original.png")!;
    const newAnnotated = byName.get("annotated.png")!;
    const newRevised = byName.get("revised.png")!;
    expect(newAnnotated.parent_evidence_id).toBe(newOriginal.id);
    expect(newRevised.parent_evidence_id).toBe(newAnnotated.id);
    expect(newOriginal.parent_evidence_id).toBeNull();
    expect(byName.get("early-child.png")!.parent_evidence_id).toBe(newRevised.id);
    expect(JSON.parse(copy.findings[0].evidence_refs)).toEqual([
      newOriginal.id, newRevised.id,
    ]);

    deleteEngagement(db, sourceId);
    expect(listEvidenceForEngagement(db, copy.id)).toEqual(evidence);
    expect(newRevised.data_b64).toBe(Buffer.from("revised.png").toString("base64"));
    expect(newRevised.port_id).toBe(copy.ports[0].id);
  });
});
