/**
 * Conditional KB resolver (v2.4.0 P4 #29).
 *
 * Evaluates the `when` DSL declared in P1 against the fingerprint /
 * script / port-row data persisted by P2 and P3, then applies the
 * matched conditional groups to the baseline KB entry.
 *
 * Pure functions, no I/O. Callers (the engagement page server
 * component) hand in a `ResolveContext` built from the DB rows for the
 * port being rendered.
 *
 * Conflict policy (per #29 / parent #14 open question 3):
 *   - `adds_checks`: every matched conditional contributes its checks,
 *     in declaration order. Duplicates by `key` are dropped (first one
 *     wins). The lint already forbids collisions with baseline.
 *   - `modifies_commands.<id>.append`: every matched conditional that
 *     appends to the same command id fires, in declaration order. The
 *     resulting template carries the concatenated suffixes.
 *   - `modifies_commands.<id>.replace`: last-wins. Intentional —
 *     replace is the heavy hammer; if two rules both want to swap the
 *     same template, the latter one is presumed to be more specific.
 *
 * Re-import semantics (parent #14 open question 5): the resolver
 * surfaces every conditional that did NOT match in `inactive`. The
 * engagement page can join this against `check_states` rows to detect
 * checks the operator already toggled under a conditional that has
 * since lost its signal — those become "orphaned" in P5's UI surface.
 */

import type {
  Conditional,
  KbEntry,
  WhenExpr,
} from "./schema";

export interface ResolveContextPort {
  service: string | null;
  product: string | null;
  version: string | null;
}

export interface ResolveContextScript {
  /** NSE script id (e.g. `http-server-header`). */
  id: string;
  /** Verbatim script body. */
  output: string;
}

export interface ResolveContextFingerprint {
  source: "nmap" | "autorecon";
  type: "tech" | "cves" | "banners";
  value: string;
}

export interface ResolveContext {
  port: ResolveContextPort;
  scripts: ReadonlyArray<ResolveContextScript>;
  fingerprints: ReadonlyArray<ResolveContextFingerprint>;
}

export interface ResolvedCheck {
  key: string;
  label: string;
  source: "baseline" | "conditional";
  /** Set when source = "conditional". */
  conditionalId?: string;
}

export interface ResolvedCommand {
  /** Carried through from the baseline command if it had an id. */
  id?: string;
  label: string;
  /**
   * Final template after all matched appends + the last-wins replace.
   * Identical to the baseline template when no conditional touched
   * this command id.
   */
  template: string;
  /** Conditional ids that contributed an `append`, in declaration order. */
  appendedBy: string[];
  /** Conditional id that swapped the template, if any. Null when untouched. */
  replacedBy: string | null;
}

export interface InactiveConditional {
  /** Conditional `id` from the KB entry. */
  id: string;
  /** `adds_checks[].key` values from this conditional, for orphan detection. */
  checkKeys: string[];
}

export interface ResolvedEntry {
  checks: ResolvedCheck[];
  commands: ResolvedCommand[];
  /** Conditionals declared on the entry that didn't fire for this context. */
  inactive: InactiveConditional[];
  /** Conditionals that fired, in declaration order. Useful for P5 telemetry. */
  active: Array<{ id: string }>;
}

/* -------------------------------------------------------------------------- */
/* predicate evaluator                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Compare two dotted-numeric versions. Returns -1 / 0 / 1 like a usual
 * comparator. Non-numeric segments are coerced to 0 so an exotic build
 * suffix doesn't poison the comparison; KB authors who need exotic
 * matching should use a different predicate.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(/[.\s]/).map((n) => Number(n) || 0);
  const pb = b.replace(/^v/i, "").split(/[.\s]/).map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const dbn = pb[i] ?? 0;
    if (da !== dbn) return da < dbn ? -1 : 1;
  }
  return 0;
}

/**
 * Match a KB-author-supplied `version` string against the port's
 * version. Supports:
 *   - exact: `"2.3.4"`           — ports's version startsWith "2.3.4"
 *   - operators: `"<= 2.3.5"`, `"< 2.3.5"`, `">= 1.0.0"`, `"> 1.0.0"`
 *   - ranges: `">= 1.0.0 < 2.0.0"` (space-separated, all conjunctive)
 *
 * Anything else (semver ranges with carets, complex disjunctions) is
 * treated as a substring match — escape hatch for KB authors who want
 * to anchor on an exact build string.
 */
function versionExpressionMatches(expr: string, observed: string): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return true;

  // Detect operator-prefix segments.
  const tokens = trimmed.split(/\s+/);
  const ops: Array<{ op: string; ver: string }> = [];
  let exact: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "<=" || t === "<" || t === ">=" || t === ">" || t === "==") {
      const next = tokens[i + 1];
      if (!next) return false;
      ops.push({ op: t, ver: next });
      i += 1;
      continue;
    }
    if (/^[<>]=?/.test(t)) {
      // Glued form like "<=2.3.5" with no space.
      const m = t.match(/^([<>]=?)(.+)$/);
      if (m) {
        ops.push({ op: m[1], ver: m[2] });
        continue;
      }
    }
    // Bare token — treat as exact.
    exact = t;
  }

  if (ops.length === 0 && exact !== null) {
    return observed.toLowerCase().startsWith(exact.toLowerCase());
  }

  for (const { op, ver } of ops) {
    const cmp = compareVersions(observed, ver);
    switch (op) {
      case "<=": if (cmp > 0) return false; break;
      case "<":  if (cmp >= 0) return false; break;
      case ">=": if (cmp < 0) return false; break;
      case ">":  if (cmp <= 0) return false; break;
      case "==": if (cmp !== 0) return false; break;
    }
  }
  if (exact !== null && !observed.toLowerCase().includes(exact.toLowerCase())) {
    return false;
  }
  return true;
}

export function evaluateWhen(when: WhenExpr, ctx: ResolveContext): boolean {
  if ("anyOf" in when) {
    return when.anyOf.some((sub) => evaluateWhen(sub, ctx));
  }
  if ("allOf" in when) {
    return when.allOf.every((sub) => evaluateWhen(sub, ctx));
  }
  if ("not" in when) {
    return !evaluateWhen(when.not, ctx);
  }
  if ("nmap_script_contains" in when) {
    const { script, pattern } = when.nmap_script_contains;
    const scriptLower = script.toLowerCase();
    const patternLower = pattern.toLowerCase();
    return ctx.scripts.some(
      (s) =>
        s.id.toLowerCase() === scriptLower &&
        s.output.toLowerCase().includes(patternLower),
    );
  }
  if ("nmap_version_matches" in when) {
    const { product, version } = when.nmap_version_matches;
    if (product) {
      const obs = (ctx.port.product ?? "").toLowerCase();
      if (!obs.includes(product.toLowerCase())) return false;
    }
    if (version) {
      const obs = ctx.port.version ?? "";
      if (!versionExpressionMatches(version, obs)) return false;
    }
    return true;
  }
  if ("autorecon_finding" in when) {
    const { type, value } = when.autorecon_finding;
    const valueLower = value.toLowerCase();
    return ctx.fingerprints.some(
      (f) =>
        f.source === "autorecon" &&
        f.type === type &&
        f.value.toLowerCase() === valueLower,
    );
  }
  if ("port_field_equals" in when) {
    const { field, value } = when.port_field_equals;
    const obs = ctx.port[field] ?? "";
    return obs.toLowerCase() === value.toLowerCase();
  }
  // Schema validation ought to make this branch unreachable; fail closed
  // rather than fail open if a future predicate slips past the type guard.
  return false;
}

/* -------------------------------------------------------------------------- */
/* applyConditionals                                                           */
/* -------------------------------------------------------------------------- */

function buildBaselineCommands(entry: KbEntry): ResolvedCommand[] {
  return entry.commands.map((c) => ({
    id: c.id,
    label: c.label,
    template: c.template,
    appendedBy: [],
    replacedBy: null,
  }));
}

function applyOneConditional(
  cond: Conditional,
  out: { checks: ResolvedCheck[]; commands: ResolvedCommand[] },
  seenCheckKeys: Set<string>,
): void {
  for (const c of cond.adds_checks) {
    if (seenCheckKeys.has(c.key)) continue;
    out.checks.push({
      key: c.key,
      label: c.label,
      source: "conditional",
      conditionalId: cond.id,
    });
    seenCheckKeys.add(c.key);
  }
  if (cond.modifies_commands) {
    for (const [targetId, mod] of Object.entries(cond.modifies_commands)) {
      const cmd = out.commands.find((c) => c.id === targetId);
      // Lint already rejects unknown ids; defensive skip if it ever slips.
      if (!cmd) continue;
      if (mod.replace !== undefined) {
        cmd.template = mod.replace;
        cmd.replacedBy = cond.id;
      }
      if (mod.append !== undefined) {
        cmd.template = cmd.template + mod.append;
        cmd.appendedBy.push(cond.id);
      }
    }
  }
}

export function applyConditionals(
  entry: KbEntry,
  ctx: ResolveContext,
): ResolvedEntry {
  const seenCheckKeys = new Set<string>();
  const checks: ResolvedCheck[] = entry.checks.map((c) => {
    seenCheckKeys.add(c.key);
    return {
      key: c.key,
      label: c.label,
      source: "baseline" as const,
    };
  });
  const commands = buildBaselineCommands(entry);
  const active: Array<{ id: string }> = [];
  const inactive: InactiveConditional[] = [];

  for (const cond of entry.conditional ?? []) {
    if (evaluateWhen(cond.when, ctx)) {
      applyOneConditional(cond, { checks, commands }, seenCheckKeys);
      active.push({ id: cond.id });
    } else {
      inactive.push({
        id: cond.id,
        checkKeys: cond.adds_checks.map((c) => c.key),
      });
    }
  }

  return { checks, commands, active, inactive };
}
