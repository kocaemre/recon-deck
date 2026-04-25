#!/usr/bin/env tsx
/**
 * KB Lint Script (Phase 1 Plan 06)
 *
 * Runs over the SHIPPED knowledge base only (knowledge/ports + knowledge/default.yaml,
 * per D-20). User KB at knowledge/user/ is NOT linted — that's the operator's local
 * scratch space.
 *
 * Four rule families:
 *   1. Schema    — Zod parse via KbEntrySchema (single source of truth, Pitfall 1 / T-11)
 *                  Catches: prose in resources (T-03), bad URL scheme (T-02), missing
 *                  schema_version, unknown fields, etc.
 *   2. Placeholder — only {IP}, {PORT}, {HOST} allowed in command templates (KB-09 / D-16)
 *   3. Command denylist — rejects pipe-to-shell / RCE patterns (KB-11 / T-01 / T-10)
 *   4. URL scheme backstop — defensive double-check for resource URLs (T-02)
 *
 * CLI: `tsx scripts/lint-kb.ts` — exits 0 if clean, 1 on any violation.
 * Programmatic: import { lintKnowledgeBase } and pass { portsDir, defaultFile }.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { KbEntrySchema } from "../src/lib/kb/schema.js";

export interface LintFailure {
  file: string;
  rule: "schema" | "placeholder" | "url-scheme" | "command-denylist";
  detail: string;
}

/**
 * Allowed command-template placeholders (D-16 / KB-09).
 * Anything else (e.g. {TARGET}, {RHOST}, {FOO}) is rejected.
 *
 * P1-E: `{WORDLIST_*}` tokens (uppercase + digits + underscores after the
 * `WORDLIST_` prefix) are allowed; resolution to a filesystem path happens
 * at render time via `src/lib/kb/wordlists.ts`. Operators add custom keys
 * via `/settings/wordlists`, so the lint pattern is the general shape, not
 * a fixed enum.
 */
export const PLACEHOLDER_ALLOWLIST = /^\{(IP|PORT|HOST|WORDLIST_[A-Z0-9_]+)\}$/;

/**
 * Command denylist (D-19 / CD-02 / T-01 / T-10 / T-12).
 * Pattern order matters: more-specific first, generic `pipe-sh` last so its
 * detail message only fires for templates the specific patterns missed.
 *
 * The catch-all `pipe-sh` uses `\s*` (zero-or-more) so `|bash` (no space)
 * also trips it — direct mitigation for T-12.
 */
export const COMMAND_DENYLIST: Array<{ name: string; pattern: RegExp }> = [
  { name: "rm-rf", pattern: /\brm\s+-rf\b/ },
  { name: "curl-pipe-sh", pattern: /curl[^|]*\|\s*(sh|bash)\b/ },
  { name: "wget-pipe-sh", pattern: /wget[^|]*\|\s*(sh|bash)\b/ },
  { name: "dev-tcp", pattern: /\/dev\/tcp/ },
  { name: "base64-pipe", pattern: /base64\s+-d\s*\|\s*(sh|bash)\b/ },
  { name: "pipe-sh", pattern: /\|\s*(sh|bash)\b/ },
];

export function lintKnowledgeBase(opts: {
  portsDir: string;
  defaultFile: string;
}): { failures: LintFailure[] } {
  const failures: LintFailure[] = [];

  const portFiles = fs.existsSync(opts.portsDir)
    ? fs
        .readdirSync(opts.portsDir)
        .filter((f) => f.endsWith(".yaml"))
        .sort()
        .map((f) => path.join(opts.portsDir, f))
    : [];

  const files: string[] = [...portFiles, opts.defaultFile];

  for (const file of files) {
    if (!fs.existsSync(file)) {
      failures.push({ file, rule: "schema", detail: "file does not exist" });
      continue;
    }

    let doc: unknown;
    try {
      doc = yaml.load(fs.readFileSync(file, "utf8"));
    } catch (err) {
      failures.push({
        file,
        rule: "schema",
        detail: `YAML parse error: ${(err as Error).message}`,
      });
      continue;
    }

    const parsed = KbEntrySchema.safeParse(doc);
    if (!parsed.success) {
      failures.push({
        file,
        rule: "schema",
        detail: parsed.error.message,
      });
      // Skip downstream rules — we can't trust the shape.
      continue;
    }
    const entry = parsed.data;

    // Rule 2 + 3: Placeholder allowlist + command denylist
    for (const cmd of entry.commands) {
      const tokens = cmd.template.match(/\{[A-Z_]+\}/g) ?? [];
      for (const t of tokens) {
        if (!PLACEHOLDER_ALLOWLIST.test(t)) {
          failures.push({
            file,
            rule: "placeholder",
            detail: `command "${cmd.label}": unlisted placeholder ${t}`,
          });
        }
      }
      for (const rule of COMMAND_DENYLIST) {
        if (rule.pattern.test(cmd.template)) {
          failures.push({
            file,
            rule: "command-denylist",
            detail: `command "${cmd.label}": hit ${rule.name} (${cmd.template})`,
          });
        }
      }
    }

    // Rule 4: URL scheme backstop (schema refine should already block,
    // but belt-and-braces in case schema ever gets relaxed by mistake).
    for (const res of entry.resources) {
      if (!/^https?:\/\//.test(res.url)) {
        failures.push({
          file,
          rule: "url-scheme",
          detail: `resource "${res.title}": non-http(s) URL ${res.url}`,
        });
      }
    }
  }

  return { failures };
}

/* -------- CLI entry point -------- */

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..");
  const { failures } = lintKnowledgeBase({
    portsDir: path.join(repoRoot, "knowledge/ports"),
    defaultFile: path.join(repoRoot, "knowledge/default.yaml"),
  });

  for (const f of failures) {
    console.error(`[FAIL ${f.rule}] ${f.file}: ${f.detail}`);
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} violation(s) in shipped KB`);
    process.exit(1);
  }
  console.log("KB lint passed");
}
