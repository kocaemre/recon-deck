import "server-only";

/**
 * ai_usage ledger repo (v2.5.0 beta-test feature).
 *
 * One row per AI co-pilot call; backs the /settings/usage analytics page.
 * Recording is best-effort and must never break the AI response — callers wrap
 * `recordAiUsage` in a try/catch and swallow failures.
 */

import { desc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { ai_usage, type AiUsage } from "./schema";
import type * as schema from "./schema";

type Db = BetterSQLite3Database<typeof schema>;

export interface RecordAiUsageInput {
  engagementId: number | null;
  engagementLabel: string | null;
  host: string | null;
  task: "explain" | "suggest" | "summary";
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}

export function recordAiUsage(db: Db, input: RecordAiUsageInput): void {
  db.insert(ai_usage)
    .values({
      created_at: new Date().toISOString(),
      engagement_id: input.engagementId,
      engagement_label: input.engagementLabel,
      host: input.host,
      task: input.task,
      provider: input.provider,
      model: input.model,
      prompt_tokens: input.promptTokens,
      completion_tokens: input.completionTokens,
      cost_usd: input.costUsd,
    })
    .run();
}

/** All usage rows, newest first. Single-user local tool — no pagination yet. */
export function listAiUsage(db: Db): AiUsage[] {
  return db.select().from(ai_usage).orderBy(desc(ai_usage.created_at)).all();
}

/* --------------------------- aggregation (pure) --------------------------- */

export interface UsageTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  /** True when at least one row carried a cost (so the UI can show $ vs tokens-only). */
  hasCost: boolean;
}

export interface UsageGroup extends UsageTotals {
  key: string;
}

export interface UsageReport {
  totals: UsageTotals;
  byModel: UsageGroup[];
  byTarget: UsageGroup[];
  byTask: UsageGroup[];
  recent: AiUsage[];
}

function emptyTotals(): UsageTotals {
  return {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
    hasCost: false,
  };
}

function add(t: UsageTotals, r: AiUsage): void {
  t.calls += 1;
  t.promptTokens += r.prompt_tokens;
  t.completionTokens += r.completion_tokens;
  if (r.cost_usd != null) {
    t.costUsd += r.cost_usd;
    t.hasCost = true;
  }
}

function group(rows: AiUsage[], keyOf: (r: AiUsage) => string): UsageGroup[] {
  const map = new Map<string, UsageGroup>();
  for (const r of rows) {
    const key = keyOf(r);
    let g = map.get(key);
    if (!g) {
      g = { key, ...emptyTotals() };
      map.set(key, g);
    }
    add(g, r);
  }
  // Sort by cost desc, then calls desc — biggest spenders first.
  return [...map.values()].sort(
    (a, b) => b.costUsd - a.costUsd || b.calls - a.calls,
  );
}

/** Build the full analytics report from the ledger. */
export function buildUsageReport(db: Db): UsageReport {
  const rows = listAiUsage(db);
  const totals = emptyTotals();
  for (const r of rows) add(totals, r);
  return {
    totals,
    byModel: group(rows, (r) => r.model),
    byTarget: group(
      rows,
      (r) => r.engagement_label || r.host || "(unknown target)",
    ),
    byTask: group(rows, (r) => r.task),
    recent: rows.slice(0, 50),
  };
}
