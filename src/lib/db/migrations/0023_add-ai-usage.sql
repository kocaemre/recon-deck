-- v2.5.0 (beta-test feature): AI usage ledger for the /settings/usage analytics
-- page. One row per AI co-pilot call (explain / suggest / summary), recording
-- the model, token counts, and cost so an operator can see what each target
-- cost and which models they leaned on.
--
-- engagement_id is ON DELETE SET NULL (usage history outlives a deleted
-- engagement); `host` + `engagement_label` snapshot the target identity at call
-- time so per-IP / per-engagement breakdowns survive that deletion too.
--
-- cost_usd is nullable: OpenRouter returns a per-call cost, but OpenAI / Ollama
-- (and any provider that omits it) leave it null and the UI shows tokens only.

CREATE TABLE ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  engagement_id INTEGER REFERENCES engagements(id) ON DELETE SET NULL,
  engagement_label TEXT,
  host TEXT,
  task TEXT NOT NULL CHECK (task IN ('explain', 'suggest', 'summary')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL
);
--> statement-breakpoint
CREATE INDEX ai_usage_engagement_id_idx ON ai_usage (engagement_id);
--> statement-breakpoint
CREATE INDEX ai_usage_created_at_idx ON ai_usage (created_at);
