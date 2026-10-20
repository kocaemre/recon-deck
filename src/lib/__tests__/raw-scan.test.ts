import { describe, expect, it } from "vitest";
import { getCopyableRawScanText } from "../raw-scan";
import { createTestDb } from "../../../tests/helpers/db";
import { createFromScan, getById } from "../db/engagement-repo";
import { listScanHistory, rescanEngagement } from "../db/scan-history-repo";
import { parseAny } from "../parser";

describe("getCopyableRawScanText", () => {
  it("returns the exact nmap text scan input", () => {
    const raw = "  nmap -sV 10.10.10.10\nHost is up\n";
    expect(getCopyableRawScanText({ source: "nmap-text", raw_input: raw })).toBe(raw);
  });

  it("returns the exact nmap xml scan input", () => {
    const raw = "<nmaprun><host></host></nmaprun>";
    expect(getCopyableRawScanText({ source: "nmap-xml", raw_input: raw })).toBe(raw);
  });

  it("returns null for autorecon engagements", () => {
    expect(getCopyableRawScanText({ source: "autorecon", raw_input: "example.zip" })).toBeNull();
  });

  it("returns null when raw input is missing", () => {
    for (const raw_input of ["", null, undefined]) {
      expect(getCopyableRawScanText({ source: "nmap-text", raw_input })).toBeNull();
    }
  });

  it("copies the latest persisted scan verbatim without changing the original", () => {
    const db = createTestDb();
    const first = '<?xml version="1.0"?><nmaprun><host><address addr="192.0.2.10" addrtype="ipv4"/><ports><port protocol="tcp" portid="80"><state state="open"/></port></ports></host></nmaprun>';
    const latest = "# Nmap 7.94 scan initiated\nHost: 192.0.2.10 () Ports: 443/open/tcp//https///\n";
    const { id } = createFromScan(db, parseAny(first), first);
    const original = getById(db, id)!;
    expect(getCopyableRawScanText(original, listScanHistory(db, id)[0])).toBe(first);

    rescanEngagement(db, id, parseAny(latest), latest);
    const engagement = getById(db, id)!;
    expect(engagement.raw_input).toBe(first);
    expect(getCopyableRawScanText(engagement, listScanHistory(db, id)[0])).toBe(latest);
  });

  it("uses the latest source when an AutoRecon engagement receives an nmap rescan", () => {
    expect(getCopyableRawScanText(
      { source: "autorecon", raw_input: "example.zip" },
      { source: "nmap-text", raw_input: "latest scan\n" },
    )).toBe("latest scan\n");
  });

  it("does not copy stale input when the latest scan is empty or unsupported", () => {
    const original = { source: "nmap-text", raw_input: "old scan" };
    expect(getCopyableRawScanText(original, { source: "nmap-text", raw_input: "" })).toBeNull();
    expect(getCopyableRawScanText(original, { source: "autorecon", raw_input: "latest.zip" })).toBeNull();
  });
});
