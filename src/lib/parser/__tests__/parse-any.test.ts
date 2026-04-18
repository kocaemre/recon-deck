import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseAny, parseNmapXml, parseNmapText } from "../index.js";
import type { ParsedScan } from "../index.js";

const FIX_XML = path.resolve(__dirname, "../../../../tests/fixtures/parser/xml");
const FIX_TXT = path.resolve(__dirname, "../../../../tests/fixtures/parser/text");

function loadXml(name: string): string {
  return fs.readFileSync(path.join(FIX_XML, name), "utf8");
}

function loadTxt(name: string): string {
  return fs.readFileSync(path.join(FIX_TXT, name), "utf8");
}

describe("parseAny (Plan 04) — D-11 format dispatcher", () => {
  describe("D-11: XML detection via `<?xml` prologue", () => {
    it("dispatches XML input to parseNmapXml (source='nmap-xml')", () => {
      const raw = loadXml("simple-tcp.xml");
      const result = parseAny(raw);
      expect(result.source).toBe("nmap-xml");
    });

    it("tolerates leading whitespace before the XML prologue", () => {
      const raw = "\n\n   " + loadXml("simple-tcp.xml");
      const result = parseAny(raw);
      expect(result.source).toBe("nmap-xml");
    });

    it("produces the same result as calling parseNmapXml directly", () => {
      const raw = loadXml("simple-tcp.xml");
      const viaAny = parseAny(raw);
      const viaDirect = parseNmapXml(raw);
      expect(viaAny).toEqual(viaDirect);
    });
  });

  describe("D-11: text detection (no `<?xml` prologue)", () => {
    it("dispatches text input to parseNmapText (source='nmap-text')", () => {
      const raw = loadTxt("simple-tcp.nmap");
      const result = parseAny(raw);
      expect(result.source).toBe("nmap-text");
    });

    it("produces the same result as calling parseNmapText directly", () => {
      const raw = loadTxt("simple-tcp.nmap");
      const viaAny = parseAny(raw);
      const viaDirect = parseNmapText(raw);
      expect(viaAny).toEqual(viaDirect);
    });

    it("tolerates leading whitespace on text input", () => {
      const raw = "   \n" + loadTxt("hostname-with-ip.nmap");
      const result = parseAny(raw);
      expect(result.source).toBe("nmap-text");
      expect(result.target.hostname).toBe("box.htb");
    });
  });

  describe("INPUT-04 / D-07: empty input", () => {
    it("throws with an actionable message on empty string", () => {
      expect(() => parseAny("")).toThrow(/empty|paste/i);
    });

    it("throws with an actionable message on whitespace-only input", () => {
      expect(() => parseAny("   \n\t  \n")).toThrow(/empty|paste/i);
    });

    it("TEST-02: empty-input error message contains no stack frame syntax", () => {
      try {
        parseAny("");
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).not.toMatch(/at Object\.|at new |\s+at /);
        return;
      }
      throw new Error("parseAny('') did not throw");
    });
  });

  describe("ParsedScan contract re-export", () => {
    it("type `ParsedScan` is exported from index barrel", () => {
      // Compile-time check: if the type isn't exported, tsc would fail.
      const shape: ParsedScan = {
        target: { ip: "1.2.3.4" },
        source: "nmap-text",
        ports: [],
        hostScripts: [],
        warnings: [],
      };
      expect(shape.source).toBe("nmap-text");
    });
  });
});
