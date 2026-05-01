#!/usr/bin/env tsx
/**
 * KB Link Checker (v1.4.1).
 *
 * Walks every shipped YAML under `knowledge/` and verifies that every
 * `url:` / `link:` field actually resolves to a real page (HTTP 200 +
 * a non-"Page not found" title). Caught the 2026 HackTricks site
 * rebuild after-the-fact; this script exists so the next migration
 * doesn't ambush us silently.
 *
 * Usage:
 *   npm run kb:check-links              # full sweep
 *   npm run kb:check-links -- --quick   # HEAD-only (skip title check)
 *
 * Exit codes:
 *   0 — every URL is reachable with a real title
 *   1 — at least one URL is broken
 *   2 — script error (network down, parser exception)
 *
 * Network constraint: this script is **opt-in** by design. recon-deck
 * itself never hits the internet (OPS-03). The check-links script does,
 * because that's its whole job — but it's a CLI tool that operators
 * run before opening a KB PR, not part of the runtime.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { fileURLToPath, pathToFileURL } from "node:url";

interface LinkRef {
  file: string;
  url: string;
  field: "resource" | "known_vuln";
}

interface CheckResult {
  ref: LinkRef;
  status: number;
  title: string | null;
  ok: boolean;
  reason?: string;
}

const NOT_FOUND_PATTERNS = [
  /Page not found/i,
  /404 not found/i,
  /^Not Found$/i,
];

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) yield full;
  }
}

function extractRefs(filePath: string): LinkRef[] {
  const text = fs.readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = yaml.load(text);
  } catch (err) {
    console.error(`[parse] ${filePath}: ${(err as Error).message}`);
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const root = parsed as Record<string, unknown>;
  const refs: LinkRef[] = [];

  // resources: [{ url }]
  if (Array.isArray(root.resources)) {
    for (const r of root.resources) {
      if (r && typeof r === "object" && typeof (r as { url?: unknown }).url === "string") {
        refs.push({ file: filePath, url: (r as { url: string }).url, field: "resource" });
      }
    }
  }
  // known_vulns: [{ link }]
  if (Array.isArray(root.known_vulns)) {
    for (const v of root.known_vulns) {
      if (v && typeof v === "object" && typeof (v as { link?: unknown }).link === "string") {
        refs.push({ file: filePath, url: (v as { link: string }).link, field: "known_vuln" });
      }
    }
  }
  return refs;
}

async function check(ref: LinkRef, quick: boolean): Promise<CheckResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(ref.url, {
      method: quick ? "HEAD" : "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "recon-deck-kb-link-checker/1.0" },
    });
    if (!res.ok) {
      return { ref, status: res.status, title: null, ok: false, reason: `HTTP ${res.status}` };
    }
    if (quick) {
      return { ref, status: res.status, title: null, ok: true };
    }
    const html = await res.text();
    const m = html.match(/<title>([^<]*)<\/title>/i);
    const title = m ? m[1].trim() : null;
    if (title && NOT_FOUND_PATTERNS.some((p) => p.test(title))) {
      return { ref, status: res.status, title, ok: false, reason: `title: ${title}` };
    }
    return { ref, status: res.status, title, ok: true };
  } catch (err) {
    return { ref, status: 0, title: null, ok: false, reason: (err as Error).message };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const quick = args.includes("--quick");
  const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");
  const kbDir = path.join(root, "knowledge");
  if (!fs.existsSync(kbDir)) {
    console.error(`No knowledge/ directory at ${kbDir}`);
    process.exit(2);
  }

  const refs: LinkRef[] = [];
  for (const file of walk(kbDir)) refs.push(...extractRefs(file));

  // Dedup by URL — same link can appear in many files; only check once.
  const byUrl = new Map<string, LinkRef[]>();
  for (const r of refs) {
    const list = byUrl.get(r.url) ?? [];
    list.push(r);
    byUrl.set(r.url, list);
  }

  console.log(
    `Checking ${byUrl.size} unique URL${byUrl.size === 1 ? "" : "s"} ` +
      `across ${refs.length} reference${refs.length === 1 ? "" : "s"}` +
      `${quick ? " (HEAD-only)" : ""}…\n`,
  );

  let failures = 0;
  // Cap concurrency at 8 — small enough to stay friendly to the
  // upstream (HackTricks is an mdbook on Cloudflare; not our place to
  // hammer it) but parallel enough to finish in seconds, not minutes.
  const urls = Array.from(byUrl.keys());
  const concurrency = 8;
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((u) => check(byUrl.get(u)![0], quick)),
    );
    for (const r of results) {
      const sites = byUrl.get(r.ref.url)!;
      if (r.ok) {
        console.log(`✓ ${r.ref.url}` + (r.title ? `  — ${r.title}` : ""));
      } else {
        failures++;
        console.log(`✗ ${r.ref.url}  — ${r.reason}`);
        for (const s of sites) {
          const rel = path.relative(root, s.file);
          console.log(`    ${rel}  (${s.field})`);
        }
      }
    }
  }

  console.log(
    `\n${byUrl.size - failures}/${byUrl.size} URLs healthy` +
      (failures ? ` — ${failures} broken` : ""),
  );
  process.exit(failures ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
