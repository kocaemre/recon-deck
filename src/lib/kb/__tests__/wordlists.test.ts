import { describe, it, expect } from "vitest";
import {
  DEFAULT_WORDLISTS,
  interpolateWordlists,
  isValidWordlistKey,
} from "../wordlists";

describe("interpolateWordlists (P1-E)", () => {
  it("resolves a shipped default key", () => {
    const out = interpolateWordlists(
      "gobuster dir -u http://t -w {WORDLIST_DIRB_COMMON}",
    );
    expect(out).toBe(
      `gobuster dir -u http://t -w ${DEFAULT_WORDLISTS.WORDLIST_DIRB_COMMON}`,
    );
  });

  it("resolves multiple tokens in one template", () => {
    const out = interpolateWordlists(
      "ffuf -u {WORDLIST_RAFT_DIRS} -w {WORDLIST_SUBDOMAINS}",
    );
    expect(out).toContain(DEFAULT_WORDLISTS.WORDLIST_RAFT_DIRS);
    expect(out).toContain(DEFAULT_WORDLISTS.WORDLIST_SUBDOMAINS);
    expect(out).not.toContain("{WORDLIST_RAFT_DIRS}");
    expect(out).not.toContain("{WORDLIST_SUBDOMAINS}");
  });

  it("override beats shipped default", () => {
    const out = interpolateWordlists(
      "x -w {WORDLIST_DIRB_COMMON}",
      { WORDLIST_DIRB_COMMON: "/custom/dirb.txt" },
    );
    expect(out).toBe("x -w /custom/dirb.txt");
  });

  it("empty/whitespace override falls through to shipped default", () => {
    const out = interpolateWordlists(
      "x -w {WORDLIST_DIRB_COMMON}",
      { WORDLIST_DIRB_COMMON: "   " },
    );
    expect(out).toBe(`x -w ${DEFAULT_WORDLISTS.WORDLIST_DIRB_COMMON}`);
  });

  it("unknown key without override is left verbatim", () => {
    const out = interpolateWordlists("x -w {WORDLIST_NEVER_SHIPPED}");
    expect(out).toBe("x -w {WORDLIST_NEVER_SHIPPED}");
  });

  it("custom (non-shipped) key resolves from override map", () => {
    const out = interpolateWordlists("x -w {WORDLIST_MY_CUSTOM}", {
      WORDLIST_MY_CUSTOM: "/opt/lists/mine.txt",
    });
    expect(out).toBe("x -w /opt/lists/mine.txt");
  });

  it("does not touch {IP}/{PORT}/{HOST} tokens", () => {
    const out = interpolateWordlists("nmap -p {PORT} {IP} -oA {HOST}");
    expect(out).toBe("nmap -p {PORT} {IP} -oA {HOST}");
  });

  it("trims override path before injecting", () => {
    const out = interpolateWordlists("x -w {WORDLIST_FOO}", {
      WORDLIST_FOO: "  /a/b.txt  ",
    });
    expect(out).toBe("x -w /a/b.txt");
  });
});

describe("isValidWordlistKey (P1-E)", () => {
  it("accepts shipped-style keys", () => {
    expect(isValidWordlistKey("WORDLIST_DIRB_COMMON")).toBe(true);
    expect(isValidWordlistKey("WORDLIST_RAFT_DIRS_BIG")).toBe(true);
    expect(isValidWordlistKey("WORDLIST_CUSTOM_42")).toBe(true);
  });

  it("rejects malformed keys", () => {
    expect(isValidWordlistKey("WORDLIST")).toBe(false);
    expect(isValidWordlistKey("WORDLIST_")).toBe(false);
    expect(isValidWordlistKey("wordlist_dirb")).toBe(false);
    expect(isValidWordlistKey("WORDLIST_dirb")).toBe(false);
    expect(isValidWordlistKey("WORDLIST_FOO-BAR")).toBe(false);
    expect(isValidWordlistKey("FOO")).toBe(false);
  });
});
