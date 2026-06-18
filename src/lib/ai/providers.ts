/**
 * AI provider presets — client-safe (NO `server-only`).
 *
 * Pure data + helpers shared by the server resolver (`config.ts`) and the
 * client settings UI (`AiSettingsSection`). Keep this free of any DB / fs /
 * secret access so it can be imported into a client component bundle.
 */

export type AiProvider = "ollama" | "openai" | "openrouter";

export interface ProviderPreset {
  label: string;
  defaultBaseUrl: string;
  defaultModel: string;
  /** Cloud providers require an API key; local ones do not. */
  needsKey: boolean;
  /** True when requests leave the host (privacy-relevant for scan data). */
  cloud: boolean;
}

export const AI_PROVIDERS: Record<AiProvider, ProviderPreset> = {
  ollama: {
    label: "Ollama (local)",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "llama3.1",
    needsKey: false,
    cloud: false,
  },
  openai: {
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    needsKey: true,
    cloud: true,
  },
  openrouter: {
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4.1-mini",
    needsKey: true,
    cloud: true,
  },
};

export const AI_PROVIDER_ORDER: AiProvider[] = ["ollama", "openai", "openrouter"];

/**
 * Curated models that work well for recon-deck's explain/suggest tasks —
 * strong instruction-following, reliable structured/JSON output, and neutral
 * enough not to refuse a pentest context. Surfaced as "Recommended" at the top
 * of the picker, and only when the provider actually lists the id (so the free
 * OpenRouter ids simply don't appear for OpenAI/Ollama users).
 *
 * The `:free` entries are OpenRouter's zero-cost tier (rate-limited but $0) —
 * good enough for explain/suggest on a budget. Free slugs churn; treat this as
 * a best-effort default, not a guarantee. Verified against OpenRouter's free
 * collection, 2026-06.
 */
export const RECOMMENDED_MODEL_IDS: string[] = [
  // Paid — cheap, dependable JSON, fast.
  "openai/gpt-4o-mini",
  "anthropic/claude-3.5-haiku",
  "deepseek/deepseek-chat",
  // Free ($0) — strong at command generation + structured output for "Suggest",
  // and steerable for security work. Hermes 3 in particular stays neutral on
  // offensive-security prompts instead of refusing.
  "qwen/qwen3-coder:free",
  "openai/gpt-oss-120b:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

/**
 * Rough token budget for a "typical target" so we can show a ballpark spend.
 * Deliberately conservative — a few ports, explain + suggest on each.
 */
export const COST_ESTIMATE = {
  opsPerTarget: 15,
  inTokensPerOp: 1500,
  outTokensPerOp: 350,
};

/**
 * Estimate USD to work a typical target with a model, given OpenRouter's
 * per-token prices. Returns null when pricing is unknown (local providers).
 */
export function estimateTargetCostUSD(
  promptPrice?: number,
  completionPrice?: number,
): number | null {
  if (promptPrice === undefined || completionPrice === undefined) return null;
  const { opsPerTarget, inTokensPerOp, outTokensPerOp } = COST_ESTIMATE;
  return (
    opsPerTarget *
    (inTokensPerOp * promptPrice + outTokensPerOp * completionPrice)
  );
}

/** Convert a $/token price to $/1M tokens for display. */
export function pricePerMillion(perToken?: number): number | undefined {
  return perToken === undefined ? undefined : perToken * 1_000_000;
}

export function isAiProvider(v: string): v is AiProvider {
  return v === "ollama" || v === "openai" || v === "openrouter";
}

/** Unknown/garbage provider values fall back to the local default. */
export function normalizeProvider(raw: string): AiProvider {
  return isAiProvider(raw) ? raw : "ollama";
}
