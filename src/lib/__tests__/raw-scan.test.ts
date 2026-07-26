import { describe, expect, it } from "vitest";
import { getCopyableRawScanText } from "../raw-scan";

describe("getCopyableRawScanText", () => {
  it("returns the exact nmap text scan input", () => {
    const raw = "  nmap -sV 10.10.10.10\nHost is up\n";
    expect(getCopyableRawScanText("nmap-text", raw)).toBe(raw);
  });

  it("returns the exact nmap xml scan input", () => {
    const raw = "<nmaprun><host></host></nmaprun>";
    expect(getCopyableRawScanText("nmap-xml", raw)).toBe(raw);
  });

  it("returns null for autorecon engagements", () => {
    expect(getCopyableRawScanText("autorecon", "example.zip")).toBeNull();
  });

  it("returns null when raw input is missing", () => {
    expect(getCopyableRawScanText("nmap-text", "")).toBeNull();
    expect(getCopyableRawScanText("nmap-text", null)).toBeNull();
    expect(getCopyableRawScanText("nmap-text", undefined)).toBeNull();
  });
});
