/**
 * Plan 06-04 — generateJson() unit tests.
 *
 * Covers EXPORT-03 contract locked in 06-CONTEXT.md D-09 / D-10 / D-11 / D-12 / D-13:
 *   - schema_version: "1.0" (D-10)
 *   - engagement sub-object exposes only id/name/created_at/updated_at/source/raw_input
 *   - scan sub-object mirrors ParsedScan shape — no DB column names leak
 *   - checklist / notes keyed by port/proto string (never integer port_id)
 *   - AR files/commands appear only for autorecon source ports with AR data
 *   - Deterministic: ports sorted ASC, check_keys sorted alphabetically, no Date / Math.random
 *   - Round-trip fidelity: raw_input and NSE output preserved byte-for-byte
 *
 * Golden fixture (tests/golden/engagement.json) is the canonical byte-stable output
 * of `generateJson(buildFixtureViewModel())`. Update via `npm test -- ... --update`
 * when the JSON shape intentionally changes (schema_version bump).
 */

import { describe, it, expect } from "vitest";
import { generateJson } from "../json";
import { buildFixtureViewModel } from "./fixture-vm";

describe("generateJson — Contract (EXPORT-03)", () => {
  it("output is valid JSON", () => {
    const vm = buildFixtureViewModel();
    const out = generateJson(vm);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it("root keys appear in locked order", () => {
    const vm = buildFixtureViewModel();
    const parsed = JSON.parse(generateJson(vm));
    expect(Object.keys(parsed)).toEqual([
      "schema_version",
      "recon_deck_version",
      "engagement",
      "scan",
      "checklist",
      "notes",
    ]);
  });

  it("schema_version is exactly '1.0'", () => {
    const vm = buildFixtureViewModel();
    const parsed = JSON.parse(generateJson(vm));
    expect(parsed.schema_version).toBe("1.0");
  });

  it("engagement sub-object exposes only 6 keys in order", () => {
    const vm = buildFixtureViewModel();
    const parsed = JSON.parse(generateJson(vm));
    expect(Object.keys(parsed.engagement)).toEqual([
      "id",
      "name",
      "created_at",
      "updated_at",
      "source",
      "raw_input",
    ]);
  });

  it("DB column names do not leak into engagement object", () => {
    const vm = buildFixtureViewModel();
    const parsed = JSON.parse(generateJson(vm));
    expect(parsed.engagement.target_ip).toBeUndefined();
    expect(parsed.engagement.target_hostname).toBeUndefined();
    expect(parsed.engagement.warnings_json).toBeUndefined();
    expect(parsed.engagement.os_accuracy).toBeUndefined();
    expect(parsed.engagement.os_name).toBeUndefined();
    expect(parsed.engagement.scanned_at).toBeUndefined();
  });

  it("scan sub-object mirrors ParsedScan shape", () => {
    const vm = buildFixtureViewModel();
    const parsed = JSON.parse(generateJson(vm));

    // target: { ip, hostname? }
    expect(parsed.scan.target.ip).toBe("10.10.10.5");
    expect(parsed.scan.target.hostname).toBe("box.htb");

    // source — from engagement.source
    expect(parsed.scan.source).toBe("autorecon");

    // scannedAt — ISO string from engagement.scanned_at
    expect(parsed.scan.scannedAt).toBe("2026-04-17T10:00:00.000Z");

    // os — { name, accuracy? }
    expect(parsed.scan.os).toEqual({ name: "Linux 5.x", accuracy: 95 });

    // warnings — parsed from engagement.warnings_json
    expect(Array.isArray(parsed.scan.warnings)).toBe(true);
    expect(parsed.scan.warnings).toEqual(["skipped sctp port 9999"]);

    // ports is an array of { port, protocol, state, scripts, ... }
    expect(Array.isArray(parsed.scan.ports)).toBe(true);
    expect(parsed.scan.ports[0]).toHaveProperty("port");
    expect(parsed.scan.ports[0]).toHaveProperty("protocol");
    expect(parsed.scan.ports[0]).toHaveProperty("state");
    expect(parsed.scan.ports[0]).toHaveProperty("scripts");

    // hostScripts — { id, output } shape
    expect(Array.isArray(parsed.scan.hostScripts)).toBe(true);
    expect(parsed.scan.hostScripts[0]).toEqual({
      id: "smb-os-discovery",
      output: "OS: Windows Server 2019",
    });
  });

  it("scan.ports entries use ParsedScan port shape (no DB column names)", () => {
    const vm = buildFixtureViewModel();
    const parsed = JSON.parse(generateJson(vm));
    const port443 = parsed.scan.ports.find(
      (p: { port: number }) => p.port === 443,
    );
    expect(port443).toBeDefined();
    // DB row has `id`, `engagement_id`, `port_id` — these MUST NOT leak.
    expect(port443.engagement_id).toBeUndefined();
    expect(port443.port_id).toBeUndefined();
    // The DB-side `id` (integer PK) should not appear at the port level either.
    // (`port` number is fine; `id` would be the DB row PK.)
    expect(port443).not.toHaveProperty("id");
    // Positive shape: ParsedScan keys
    expect(port443.protocol).toBe("tcp");
    expect(port443.state).toBe("open");
    expect(port443.service).toBe("https");
    expect(port443.tunnel).toBe("ssl");
  });

  it("checklist is keyed by port/proto, not integer port_id", () => {
    const vm = buildFixtureViewModel();
    const parsed = JSON.parse(generateJson(vm));
    const keys = Object.keys(parsed.checklist);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => /^\d+\/(tcp|udp)$/.test(k))).toBe(true);
    // Exact per-port shape: { checked: boolean, toggled_at: string }
    for (const portKey of keys) {
      for (const checkKey of Object.keys(parsed.checklist[portKey])) {
        const entry = parsed.checklist[portKey][checkKey];
        expect(typeof entry.checked).toBe("boolean");
        expect(typeof entry.toggled_at).toBe("string");
      }
    }
  });

  it("notes is keyed by port/proto string", () => {
    const vm = buildFixtureViewModel();
    const parsed = JSON.parse(generateJson(vm));
    const keys = Object.keys(parsed.notes);
    // Fixture: only port 80 has non-empty notes; 443 is null, 53 is "".
    expect(keys.every((k) => /^\d+\/(tcp|udp)$/.test(k))).toBe(true);
    expect(keys).toContain("80/tcp");
    expect(keys).not.toContain("443/tcp");
    expect(keys).not.toContain("53/udp");
    expect(parsed.notes["80/tcp"]).toBe(
      "Looked at main page, see screenshot-01.png in HackTricks folder",
    );
  });

  it("AR files/commands appear only for autorecon-source ports with AR data", () => {
    const vm = buildFixtureViewModel();
    const parsed = JSON.parse(generateJson(vm));

    const port443 = parsed.scan.ports.find(
      (p: { port: number }) => p.port === 443,
    );
    const port80 = parsed.scan.ports.find(
      (p: { port: number }) => p.port === 80,
    );
    const port53 = parsed.scan.ports.find(
      (p: { port: number }) => p.port === 53,
    );

    // Port 443 has AR files + commands
    expect(Array.isArray(port443.arFiles)).toBe(true);
    expect(port443.arFiles).toEqual([
      { filename: "tcp_443_https_curl.txt", content: "HTTP/1.1 200 OK" },
    ]);
    expect(Array.isArray(port443.arCommands)).toBe(true);
    expect(port443.arCommands).toEqual([
      { label: "nikto", template: "nikto -h {IP}:{PORT}" },
    ]);

    // Port 80 has no AR data — keys should be omitted
    expect(port80.arFiles).toBeUndefined();
    expect(port80.arCommands).toBeUndefined();

    // Port 53 has no AR data either — keys omitted
    expect(port53.arFiles).toBeUndefined();
    expect(port53.arCommands).toBeUndefined();
  });
});

describe("generateJson — Determinism (EXPORT-03)", () => {
  it("produces byte-identical output across multiple calls", () => {
    const out1 = generateJson(buildFixtureViewModel());
    const out2 = generateJson(buildFixtureViewModel());
    expect(out1).toBe(out2);
  });

  it("sorts ports ascending by port number", () => {
    // Fixture returns ports 53, 80, 443 — the view model is already sorted,
    // but generateJson must not scramble the order.
    const parsed = JSON.parse(generateJson(buildFixtureViewModel()));
    const portNums = parsed.scan.ports.map((p: { port: number }) => p.port);
    expect(portNums).toEqual([53, 80, 443]);
  });

  it("sorts check_keys alphabetically within each port", () => {
    // Build a VM with multiple check states whose check_keys are inserted
    // in reverse alphabetical order — generateJson must emit them ASC.
    const baseVm = buildFixtureViewModel();
    const vm = {
      ...baseVm,
      ports: baseVm.ports.map((p) => {
        if (p.port.port === 80) {
          return {
            ...p,
            port: {
              ...p.port,
              checks: [
                {
                  engagement_id: 1,
                  port_id: 2,
                  check_key: "z-last",
                  checked: false,
                  updated_at: "2026-04-17T10:30:00.000Z",
                },
                {
                  engagement_id: 1,
                  port_id: 2,
                  check_key: "a-first",
                  checked: true,
                  updated_at: "2026-04-17T10:30:00.000Z",
                },
                {
                  engagement_id: 1,
                  port_id: 2,
                  check_key: "m-middle",
                  checked: false,
                  updated_at: "2026-04-17T10:30:00.000Z",
                },
              ],
            },
          };
        }
        return p;
      }),
    };
    const parsed = JSON.parse(generateJson(vm));
    const port80Keys = Object.keys(parsed.checklist["80/tcp"]);
    expect(port80Keys).toEqual(["a-first", "m-middle", "z-last"]);
  });
});

describe("generateJson — Round-trip fidelity (EXPORT-03)", () => {
  it("preserves raw_input byte-for-byte", () => {
    const vm = buildFixtureViewModel();
    const parsed = JSON.parse(generateJson(vm));
    expect(parsed.engagement.raw_input).toBe(vm.engagement.raw_input);
    // Fixture: "example.zip"
    expect(parsed.engagement.raw_input).toBe("example.zip");
  });

  it("preserves XSS-style NSE output (round-trip, JSON escapes but does not HTML-escape)", () => {
    const vm = buildFixtureViewModel();
    const parsed = JSON.parse(generateJson(vm));
    const port80 = parsed.scan.ports.find(
      (p: { port: number }) => p.port === 80,
    );
    // After JSON.parse, the original string is recovered byte-for-byte —
    // JSON escapes quotes/backslashes/newlines but NOT `<` or `>` or HTML
    // entities, so the adversarial payload survives the round-trip.
    expect(port80.scripts[0]).toEqual({
      id: "http-title",
      output: "<script>alert(1)</script> Site Title",
    });
  });
});

describe("generateJson — Golden Fixture (EXPORT-03)", () => {
  it("matches byte-for-byte snapshot", async () => {
    const output = generateJson(buildFixtureViewModel());
    await expect(output).toMatchFileSnapshot(
      "../../../../tests/golden/engagement.json",
    );
  });
});
