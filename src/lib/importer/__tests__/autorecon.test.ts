import { describe, expect, it, beforeAll } from "vitest";
import JSZip from "jszip";
import { importAutoRecon } from "../autorecon.js";
import type { AutoReconResult } from "../autorecon.js";

/**
 * TEST-03 fixture corpus for the AutoRecon importer.
 *
 * Design decision: zip fixtures are built in-memory in `beforeAll` blocks
 * using jszip itself rather than committed as binary files. This keeps the
 * fixture set version-controlled as TypeScript and avoids binary blobs in
 * the repo (per 05-RESEARCH.md §Validation Architecture, Wave 0 Gaps note).
 *
 * The XML fixtures use the same minimal-but-valid nmap shape as
 * `tests/fixtures/parser/xml/simple-tcp.xml` so they round-trip cleanly
 * through `parseNmapXml` (the importer reuses Phase 2 D-13).
 */

// ---------------------------- helpers --------------------------------------

function makeNmapXml(
  ports: Array<{ port: number; proto: "tcp" | "udp"; service: string }>,
): string {
  const portEntries = ports
    .map(
      (p) => `
      <port protocol="${p.proto}" portid="${p.port}">
        <state state="open" reason="syn-ack" reason_ttl="64"/>
        <service name="${p.service}" method="probed" conf="10"/>
      </port>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<nmaprun scanner="nmap" args="nmap" start="1712000000" version="7.94" xmloutputversion="1.05">
  <host starttime="1712000001" endtime="1712000050">
    <status state="up" reason="echo-reply" reason_ttl="64"/>
    <address addr="10.10.10.5" addrtype="ipv4"/>
    <hostnames><hostname name="box.htb" type="PTR"/></hostnames>
    <ports>${portEntries}
    </ports>
  </host>
  <runstats><finished time="1712000050" timestr="Wed Apr  1 00:00:50 2026" elapsed="49" summary="" exit="success"/><hosts up="1" down="0" total="1"/></runstats>
</nmaprun>`;
}

function makeManualCommands(
  entries: Array<{
    service: string;
    proto: "tcp" | "udp";
    port: number;
    tools: Array<{ name: string; cmd: string }>;
  }>,
): string {
  return entries
    .map((e) => {
      const toolLines = e.tools
        .map((t) => `\n    [-] ${t.name}\n\n        ${t.cmd}\n`)
        .join("");
      return `[*] ${e.service} on ${e.proto}/${e.port}\n${toolLines}`;
    })
    .join("\n");
}

async function makeZipBuffer(
  files: Record<string, string>,
): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: "arraybuffer" });
}

// ---------------------------- fixture buffers ------------------------------

let normalZip: ArrayBuffer;
let noManualCommandsZip: ArrayBuffer;
let nestedZip: ArrayBuffer;
let missingXmlZip: ArrayBuffer;
let emptyZip: ArrayBuffer;
let unmatchedPortZip: ArrayBuffer;

beforeAll(async () => {
  const xml = makeNmapXml([
    { port: 80, proto: "tcp", service: "http" },
    { port: 22, proto: "tcp", service: "ssh" },
  ]);

  const manual = makeManualCommands([
    {
      service: "http",
      proto: "tcp",
      port: 80,
      tools: [
        { name: "nikto", cmd: "nikto -h http://10.10.10.5:80/" },
        { name: "gobuster", cmd: "gobuster dir -u http://10.10.10.5:80/" },
      ],
    },
    {
      service: "ssh",
      proto: "tcp",
      port: 22,
      tools: [{ name: "hydra", cmd: "hydra -L users.txt ssh://10.10.10.5:22" }],
    },
  ]);

  // 1. normalZip — full layout: <ip>/scans/xml/_full_tcp_nmap.xml + per-port
  //    files in tcp{port}/ subdirectories + _manual_commands.txt directly in
  //    scans/.
  normalZip = await makeZipBuffer({
    "10.10.10.5/scans/xml/_full_tcp_nmap.xml": xml,
    "10.10.10.5/scans/_manual_commands.txt": manual,
    "10.10.10.5/scans/tcp80/tcp_80_http_nmap.txt":
      "Nmap scan report for port 80 — HTTP service detected.\nServer: Apache/2.4.52",
    "10.10.10.5/scans/tcp22/tcp_22_ssh_nmap.txt":
      "Nmap scan report for port 22 — OpenSSH 8.9p1.",
  });

  // 2. noManualCommandsZip — same as normal but without _manual_commands.txt.
  noManualCommandsZip = await makeZipBuffer({
    "10.10.10.5/scans/xml/_full_tcp_nmap.xml": xml,
    "10.10.10.5/scans/tcp80/tcp_80_http_nmap.txt": "Port 80 HTTP scan.",
    "10.10.10.5/scans/tcp22/tcp_22_ssh_nmap.txt": "Port 22 SSH scan.",
  });

  // 3. nestedZip — user zipped from inside the IP folder; paths start with
  //    `scans/`, no IP prefix.
  nestedZip = await makeZipBuffer({
    "scans/xml/_full_tcp_nmap.xml": xml,
    "scans/_manual_commands.txt": manual,
    "scans/tcp80/tcp_80_http_nmap.txt": "Port 80 nested.",
  });

  // 4. missingXmlZip — has manual commands but no XML.
  missingXmlZip = await makeZipBuffer({
    "10.10.10.5/scans/_manual_commands.txt": manual,
    "10.10.10.5/scans/tcp80/tcp_80_http_nmap.txt": "Orphan service file.",
  });

  // 5. emptyZip — zero files.
  emptyZip = await makeZipBuffer({});

  // 6. unmatchedPortZip — manual commands references port 21 (ftp) but the
  //    XML only has 80 and 22.
  const manualWithUnmatched = makeManualCommands([
    {
      service: "ftp",
      proto: "tcp",
      port: 21,
      tools: [{ name: "ftp-anon", cmd: "ftp 10.10.10.5" }],
    },
    {
      service: "http",
      proto: "tcp",
      port: 80,
      tools: [{ name: "nikto", cmd: "nikto -h http://10.10.10.5:80/" }],
    },
  ]);
  unmatchedPortZip = await makeZipBuffer({
    "10.10.10.5/scans/xml/_full_tcp_nmap.xml": xml,
    "10.10.10.5/scans/_manual_commands.txt": manualWithUnmatched,
  });
});

// ---------------------------- tests ----------------------------------------

describe("importAutoRecon (Phase 05, Plan 02)", () => {
  describe("INPUT-05: Normal zip layout", () => {
    let result: AutoReconResult;

    beforeAll(async () => {
      result = await importAutoRecon(normalZip, "normal.zip");
    });

    it("returns scan with source='autorecon'", () => {
      expect(result.scan.source).toBe("autorecon");
    });

    it("extracts target IP and hostname from XML", () => {
      expect(result.scan.target.ip).toBe("10.10.10.5");
      expect(result.scan.target.hostname).toBe("box.htb");
    });

    it("returns correct port count", () => {
      expect(result.scan.ports).toHaveLength(2);
      expect(result.scan.ports.map((p) => p.port).sort()).toEqual([22, 80]);
    });

    it("attaches per-port service files to arFiles map", () => {
      expect(result.arFiles.get(80)).toBeDefined();
      expect(result.arFiles.get(80)!.length).toBeGreaterThanOrEqual(1);
      expect(result.arFiles.get(22)).toBeDefined();
      expect(result.arFiles.get(22)!.length).toBeGreaterThanOrEqual(1);
    });

    it("service file content is the full file text", () => {
      const port80Files = result.arFiles.get(80)!;
      expect(port80Files[0].filename).toBe("tcp_80_http_nmap.txt");
      expect(port80Files[0].content).toContain("Apache/2.4.52");
    });
  });

  describe("INPUT-06: _manual_commands.txt parsing", () => {
    let result: AutoReconResult;

    beforeAll(async () => {
      result = await importAutoRecon(normalZip, "normal.zip");
    });

    it("parses commands by [*] service on proto/port headers", () => {
      // 2 commands for port 80 (nikto + gobuster), 1 for port 22 (hydra).
      expect(result.arCommands.size).toBe(2);
    });

    it("attaches commands to correct port number in arCommands map", () => {
      expect(result.arCommands.get(80)).toBeDefined();
      expect(result.arCommands.get(22)).toBeDefined();
    });

    it("extracts tool label from [-] sub-header", () => {
      const port80Cmds = result.arCommands.get(80)!;
      expect(port80Cmds[0].label).toBe("nikto");
      expect(port80Cmds[1].label).toBe("gobuster");
    });

    it("handles multiple commands per port", () => {
      expect(result.arCommands.get(80)).toHaveLength(2);
      expect(result.arCommands.get(80)![0].template).toContain("nikto");
      expect(result.arCommands.get(80)![1].template).toContain("gobuster");
    });

    it("attaches correct command template to single-command port", () => {
      const port22Cmds = result.arCommands.get(22)!;
      expect(port22Cmds).toHaveLength(1);
      expect(port22Cmds[0].label).toBe("hydra");
      expect(port22Cmds[0].template).toContain("hydra");
      expect(port22Cmds[0].template).toContain("ssh://10.10.10.5:22");
    });

    it("adds warning for commands targeting non-existent port", async () => {
      const result = await importAutoRecon(unmatchedPortZip, "unmatched.zip");
      expect(
        result.scan.warnings.some(
          (w) => /port 21/i.test(w) && /dropped/i.test(w),
        ),
      ).toBe(true);
      expect(result.arCommands.get(21)).toBeUndefined();
      // The matching port still gets its commands.
      expect(result.arCommands.get(80)).toBeDefined();
      expect(result.arCommands.get(80)![0].label).toBe("nikto");
    });
  });

  describe("INPUT-05: Missing _manual_commands.txt (D-10)", () => {
    let result: AutoReconResult;

    beforeAll(async () => {
      result = await importAutoRecon(noManualCommandsZip, "no-manual.zip");
    });

    it("returns empty arCommands map without error", () => {
      expect(result.arCommands.size).toBe(0);
    });

    it("still returns valid scan and arFiles", () => {
      expect(result.scan.source).toBe("autorecon");
      expect(result.scan.ports).toHaveLength(2);
      expect(result.arFiles.get(80)).toBeDefined();
    });
  });

  describe("INPUT-05: Nested zip layout (CD-05)", () => {
    let result: AutoReconResult;

    beforeAll(async () => {
      result = await importAutoRecon(nestedZip, "nested.zip");
    });

    it("finds XML when paths start with scans/ (no IP prefix)", () => {
      expect(result.scan.source).toBe("autorecon");
    });

    it("returns valid scan with correct ports", () => {
      expect(result.scan.ports).toHaveLength(2);
      expect(result.scan.ports.map((p) => p.port).sort()).toEqual([22, 80]);
    });

    it("attaches per-port files when scansBase has no IP prefix", () => {
      expect(result.arFiles.get(80)).toBeDefined();
      expect(result.arFiles.get(80)![0].filename).toBe("tcp_80_http_nmap.txt");
    });

    it("parses manual commands when scansBase has no IP prefix", () => {
      expect(result.arCommands.get(80)).toBeDefined();
      expect(result.arCommands.get(80)![0].label).toBe("nikto");
    });
  });

  describe("INPUT-05: Missing XML (D-09)", () => {
    it("throws with actionable error message containing 'results/<ip>/ folder'", async () => {
      await expect(
        importAutoRecon(missingXmlZip, "missing-xml.zip"),
      ).rejects.toThrow(/results\/<ip>\/ folder/);
    });
  });

  describe("INPUT-05: Empty zip (D-09)", () => {
    it("throws with 'no files' message", async () => {
      await expect(importAutoRecon(emptyZip, "empty.zip")).rejects.toThrow(
        /no files/i,
      );
    });
  });

  describe("TEST-03: Error messages are user-friendly", () => {
    it("missing XML error never contains stack frame syntax", async () => {
      try {
        await importAutoRecon(missingXmlZip, "missing-xml.zip");
        expect.fail("should have thrown");
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).not.toMatch(/at Object\.|at new |\s+at /);
      }
    });

    it("empty zip error never contains stack frame syntax", async () => {
      try {
        await importAutoRecon(emptyZip, "empty.zip");
        expect.fail("should have thrown");
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).not.toMatch(/at Object\.|at new |\s+at /);
      }
    });
  });

  describe("HI-01/HI-02: zip-bomb size guards", () => {
    /**
     * Regression for HI-01 (per-entry XML cap) and HI-02 (aggregate cap).
     * Builds zips programmatically with payloads that exceed the helper's
     * 16 MB per-required-entry / 1 MB per-AR-file / 200 MB aggregate budgets,
     * relying on jszip to actually decompress (so we measure the runtime
     * guard, not just header inspection).
     */

    async function buildBombedXmlZip(xmlPayloadMb: number): Promise<ArrayBuffer> {
      // Build a valid XML wrapper padded with whitespace inside <runstats> to
      // hit the requested size while remaining well-formed for the parser
      // (though we expect it to be rejected before parsing).
      const padding = " ".repeat(xmlPayloadMb * 1024 * 1024);
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nmaprun scanner="nmap" args="nmap" start="1712000000" version="7.94" xmloutputversion="1.05">
  <host starttime="1712000001" endtime="1712000050">
    <status state="up" reason="echo-reply" reason_ttl="64"/>
    <address addr="10.10.10.5" addrtype="ipv4"/>
    <hostnames><hostname name="box.htb" type="PTR"/></hostnames>
    <ports><port protocol="tcp" portid="80"><state state="open" reason="syn-ack" reason_ttl="64"/><service name="http" method="probed" conf="10"/></port></ports>
  </host>
  <runstats><finished time="1712000050" timestr="x" elapsed="49" summary="${padding}" exit="success"/><hosts up="1" down="0" total="1"/></runstats>
</nmaprun>`;
      return makeZipBuffer({
        "10.10.10.5/scans/xml/_full_tcp_nmap.xml": xml,
      });
    }

    it("rejects oversized XML entry (>16 MB) with zip-bomb error", async () => {
      const bombZip = await buildBombedXmlZip(17); // 17 MB > 16 MB cap
      await expect(importAutoRecon(bombZip, "bomb.zip")).rejects.toThrow(
        /zip bomb|decompresses to more/i,
      );
    }, 30_000);

    it("skips oversized AR service files but completes import", async () => {
      const xml = makeNmapXml([{ port: 80, proto: "tcp", service: "http" }]);
      // 1.5 MB AR file — exceeds the 1 MB per-file cap; per D-10 it should
      // be silently skipped (not abort the import).
      const bigAr = "x".repeat(Math.floor(1.5 * 1024 * 1024));
      const oversizedArZip = await makeZipBuffer({
        "10.10.10.5/scans/xml/_full_tcp_nmap.xml": xml,
        "10.10.10.5/scans/tcp80/tcp_80_http_nmap.txt": bigAr,
      });
      const result = await importAutoRecon(oversizedArZip, "oversized-ar.zip");
      // Import succeeded; the oversized service file was silently dropped.
      expect(result.scan.ports).toHaveLength(1);
      expect(result.arFiles.get(80)).toBeUndefined();
    }, 30_000);

    it("rejects when aggregate decompressed size exceeds 200 MB budget", async () => {
      // Generate many AR files each below the 1 MB per-entry cap but summing
      // past the 200 MB aggregate. Use ~990 KB each × 220 entries ≈ 213 MB
      // decompressed — well over the 200 MB cap. We use unique random-ish
      // content per file so deflate can't trivially de-dupe across entries.
      const xml = makeNmapXml([{ port: 80, proto: "tcp", service: "http" }]);
      const files: Record<string, string> = {
        "10.10.10.5/scans/xml/_full_tcp_nmap.xml": xml,
      };
      const chunkSize = 990 * 1024; // 990 KB — under 1 MB per-file cap
      const entryCount = 220; // 220 × 990 KB ≈ 213 MB > 200 MB aggregate
      for (let i = 0; i < entryCount; i++) {
        // Per-entry varied content to defeat deflate's cross-entry repetition.
        const seed = `entry-${i}-${Math.random()}-`;
        let content = "";
        while (content.length < chunkSize) content += seed;
        files[`10.10.10.5/scans/tcp80/file_${i}.txt`] = content.slice(0, chunkSize);
      }
      const aggregateBombZip = await makeZipBuffer(files);
      await expect(
        importAutoRecon(aggregateBombZip, "agg-bomb.zip"),
      ).rejects.toThrow(/200 MB|zip bomb/i);
    }, 60_000);
  });
});
