/**
 * POST /api/kb/validate — dry-run a YAML KB entry against the schema, and
 * optionally persist it to the user KB directory.
 *
 * Body shape:
 *   { yaml: string, save?: boolean, filename?: string }
 *
 *   - yaml: the YAML text the operator pasted into the editor.
 *   - save: when true, write the parsed entry to <userDir>/<filename>.yaml
 *           and invalidate the KB cache so subsequent requests pick it up
 *           without a server restart. Save also requires `userDir` to be
 *           configured via `RECON_KB_USER_DIR`; the route surfaces a
 *           friendly 400 when it isn't.
 *   - filename: required when save=true. Strict allowlist (alnum/hyphen/
 *               underscore, max 64 chars) so the route can't be coerced
 *               into writing outside the user dir.
 *
 * Responses:
 *   200 → { ok: true, entry: { port, service, protocol, aliases, … } }
 *           dry-run validation succeeded; entry summary echoed back so the
 *           UI can confirm what it parsed.
 *   200 → { ok: true, saved: true, path: string }
 *           save succeeded.
 *   400 → { error: string }
 *           bad request (no userDir configured, missing/invalid filename,
 *           bad JSON body).
 *   422 → { error: string, issues?: zod.ZodIssue[] }
 *           YAML parsed but failed schema validation; issues array lets
 *           the UI surface field-level guidance.
 */

import { NextRequest, NextResponse } from "next/server";
import yaml from "js-yaml";
import fs from "node:fs";
import path from "node:path";
import { KbEntrySchema, invalidateKb } from "@/lib/kb";
import { readJsonBody } from "@/lib/api/body";

interface RequestBody {
  yaml?: unknown;
  save?: unknown;
  filename?: unknown;
}

// Stricter than POSIX file naming: only what an operator would type as a
// service identifier. Defends against `..`, slashes, NUL bytes, and the
// rest of the traversal toolkit. Length cap matches the YAML content
// the schema enforces on `service`.
const SAFE_FILENAME = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(request: NextRequest) {
  const parsed = await readJsonBody<RequestBody>(request, {
    maxBytes: 256 * 1024,
  });
  if (!parsed.ok) return parsed.response;

  const yamlText = parsed.body?.yaml;
  if (typeof yamlText !== "string" || yamlText.length === 0) {
    return NextResponse.json(
      { error: "Body must include a non-empty `yaml` string." },
      { status: 400 },
    );
  }

  // Parse the YAML first — surface that as a 422 the same way schema
  // failures are surfaced, so the editor only needs one error path.
  let parsedYaml: unknown;
  try {
    parsedYaml = yaml.load(yamlText);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Invalid YAML: ${(err as Error).message}`,
      },
      { status: 422 },
    );
  }

  const validation = KbEntrySchema.safeParse(parsedYaml);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: "Schema validation failed.",
        issues: validation.error.issues,
      },
      { status: 422 },
    );
  }

  const entry = validation.data;
  const summary = {
    port: entry.port,
    service: entry.service,
    protocol: entry.protocol,
    risk: entry.risk,
    aliases: entry.aliases,
    checkCount: entry.checks.length,
    commandCount: entry.commands.length,
    resourceCount: entry.resources.length,
    knownVulnCount: entry.known_vulns?.length ?? 0,
  };

  const wantsSave = parsed.body?.save === true;
  if (!wantsSave) {
    return NextResponse.json({ ok: true, entry: summary });
  }

  // Save path: requires userDir + safe filename. Filename is operator-
  // supplied; SAFE_FILENAME blocks every traversal vector.
  const userDir = process.env.RECON_KB_USER_DIR;
  if (!userDir) {
    return NextResponse.json(
      {
        error:
          "RECON_KB_USER_DIR is not set; saving requires a writable user KB directory.",
      },
      { status: 400 },
    );
  }

  const filenameRaw = parsed.body?.filename;
  if (typeof filenameRaw !== "string") {
    return NextResponse.json(
      { error: "`filename` is required when save=true." },
      { status: 400 },
    );
  }
  // Strip a trailing `.yaml` (operator convenience) before the safety
  // regex so files saved on disk always carry the canonical extension.
  const stem = filenameRaw.replace(/\.ya?ml$/i, "");
  if (!SAFE_FILENAME.test(stem)) {
    return NextResponse.json(
      {
        error:
          "Invalid filename. Use letters, digits, underscores, or hyphens (max 64 chars).",
      },
      { status: 400 },
    );
  }

  // Resolve to an absolute path inside userDir. Even with the regex
  // above, `path.resolve` + a startsWith check is the belt-and-braces
  // version — defends against future regex regressions.
  const targetPath = path.resolve(userDir, `${stem}.yaml`);
  const userDirAbs = path.resolve(userDir);
  if (
    !targetPath.startsWith(userDirAbs + path.sep) &&
    targetPath !== userDirAbs
  ) {
    return NextResponse.json(
      { error: "Resolved path escapes RECON_KB_USER_DIR." },
      { status: 400 },
    );
  }

  try {
    fs.mkdirSync(userDirAbs, { recursive: true });
    fs.writeFileSync(targetPath, yamlText, "utf8");
    invalidateKb();
    return NextResponse.json({
      ok: true,
      saved: true,
      path: targetPath,
      entry: summary,
    });
  } catch (err) {
    console.error("[kb] save failed:", err);
    return NextResponse.json(
      { error: "Could not write the KB file." },
      { status: 500 },
    );
  }
}
