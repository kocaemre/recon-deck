import "server-only";

/**
 * Tool path auto-detection (#9).
 *
 * Probes common install locations for the external tools recon-deck talks
 * to (searchsploit, SecLists, dirb, dirbuster) and reports what was found
 * so /settings can show "Detected: /usr/share/seclists" instead of making
 * the operator hunt for paths manually.
 *
 * Pure read-only filesystem checks — no spawn, no network. Each probe
 * returns the first match in priority order; everything else is ignored.
 */

import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DetectedPath {
  /** Absolute filesystem path that exists. */
  path: string;
  /** Human label used in the UI ("Kali default", "PATH", …). */
  source: string;
}

export interface ToolPathReport {
  searchsploit: DetectedPath | null;
  seclists: DetectedPath | null;
  dirb: DetectedPath | null;
  dirbuster: DetectedPath | null;
  /**
   * True when the Next.js process is running inside a Docker container
   * (probed via /.dockerenv). When true, host paths like
   * /usr/share/wordlists/dirb aren't visible without a -v bind mount,
   * so the UI surfaces a callout instead of all-rows-Not-found.
   */
  inDocker: boolean;
}

function isInDocker(): boolean {
  return existsSync("/.dockerenv");
}

function fileExists(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function detectSearchsploit(): DetectedPath | null {
  const home = homedir();
  const candidates: Array<[string, string]> = [
    ["/usr/local/bin/searchsploit", "Docker image bundle"],
    ["/usr/bin/searchsploit", "apt (Kali / Debian)"],
    ["/opt/exploitdb/searchsploit", "git clone"],
    [join(home, "exploitdb", "searchsploit"), "user home"],
    [join(home, "tools", "exploitdb", "searchsploit"), "user home"],
  ];
  for (const [p, source] of candidates) {
    if (fileExists(p)) return { path: p, source };
  }
  // PATH fallback — first directory containing a searchsploit executable.
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(":").filter(Boolean)) {
    const p = join(dir, "searchsploit");
    if (fileExists(p)) return { path: p, source: "PATH" };
  }
  return null;
}

function detectSecLists(): DetectedPath | null {
  const home = homedir();
  const candidates: Array<[string, string]> = [
    ["/host/seclists", "Docker host mount"],
    ["/host/wordlists/seclists", "Docker host mount"],
    ["/host/wordlists/SecLists", "Docker host mount"],
    ["/usr/share/seclists", "Kali default (apt)"],
    ["/usr/share/wordlists/seclists", "wordlists/seclists"],
    ["/usr/share/wordlists/SecLists", "wordlists/SecLists"],
    ["/opt/SecLists", "/opt"],
    [join(home, "SecLists"), "user home"],
    [join(home, "tools", "SecLists"), "user home"],
  ];
  for (const [p, source] of candidates) {
    if (dirExists(p)) return { path: p, source };
  }
  return null;
}

function detectDirb(): DetectedPath | null {
  const candidates: Array<[string, string]> = [
    ["/host/wordlists/dirb", "Docker host mount"],
    ["/host/dirb", "Docker host mount"],
    ["/usr/share/dirb/wordlists", "apt (Kali default)"],
    ["/usr/share/wordlists/dirb", "wordlists/dirb"],
    ["/usr/local/share/dirb/wordlists", "Homebrew / source"],
  ];
  for (const [p, source] of candidates) {
    if (dirExists(p)) return { path: p, source };
  }
  return null;
}

function detectDirbuster(): DetectedPath | null {
  const candidates: Array<[string, string]> = [
    ["/host/wordlists/dirbuster", "Docker host mount"],
    ["/host/dirbuster", "Docker host mount"],
    ["/usr/share/dirbuster/wordlists", "apt (Kali default)"],
    ["/usr/share/wordlists/dirbuster", "wordlists/dirbuster"],
  ];
  for (const [p, source] of candidates) {
    if (dirExists(p)) return { path: p, source };
  }
  return null;
}

export function detectToolPaths(): ToolPathReport {
  return {
    searchsploit: detectSearchsploit(),
    seclists: detectSecLists(),
    dirb: detectDirb(),
    dirbuster: detectDirbuster(),
    inDocker: isInDocker(),
  };
}
