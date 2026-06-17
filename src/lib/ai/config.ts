import "server-only";

/**
 * AI co-pilot configuration resolver (v2.5.0).
 *
 * Turns the raw `app_state` AI fields into the *effective* runtime config the
 * server proxy route consumes. Three rules live here, deliberately in one
 * place so every call site agrees:
 *
 *   1. **Exam Mode is a hard override.** When on, the assistant is OFF no
 *      matter what `ai_enabled` says (OSCP-style exams forbid AI). Nothing
 *      else is touched — internet research / HackTricks stay available.
 *   2. **Local-first defaults.** An unconfigured provider resolves to Ollama
 *      on localhost, so enabling AI never silently sends scan data to a cloud.
 *   3. **Cloud providers need a key.** OpenAI/OpenRouter resolve to disabled
 *      (reason `missing_key`) until a key is configured.
 *
 * The API key never leaves the server: `effectiveAiConfig` returns it for the
 * proxy route's own outbound call, while `publicAiStatus` strips it (and the
 * base URL) for anything sent to the client.
 */

import { effectiveAppState, type Db } from "@/lib/db/app-state-repo";

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

export function isAiProvider(v: string): v is AiProvider {
  return v === "ollama" || v === "openai" || v === "openrouter";
}

/** Unknown/garbage provider values fall back to the local default. */
export function normalizeProvider(raw: string): AiProvider {
  return isAiProvider(raw) ? raw : "ollama";
}

export type AiDisabledReason = "exam_mode" | "disabled" | "missing_key" | null;

export interface EffectiveAiConfig {
  /** Final gate the proxy route checks before making any outbound call. */
  enabled: boolean;
  reason: AiDisabledReason;
  examMode: boolean;
  provider: AiProvider;
  /** Resolved endpoint (provider preset unless overridden). */
  baseUrl: string;
  model: string;
  /** Whether a key is configured — NOT the key itself. */
  hasKey: boolean;
  cloud: boolean;
  /** Server-only. Present for the proxy route's outbound call; never serialize. */
  apiKey: string | null;
}

export function effectiveAiConfig(db: Db): EffectiveAiConfig {
  const cfg = effectiveAppState(db);
  const provider = normalizeProvider(cfg.aiProvider);
  const preset = AI_PROVIDERS[provider];
  const baseUrl = cfg.aiBaseUrl ?? preset.defaultBaseUrl;
  const model = cfg.aiModel ?? preset.defaultModel;
  const apiKey = cfg.aiApiKey;
  const hasKey = !!apiKey && apiKey.length > 0;

  let enabled = true;
  let reason: AiDisabledReason = null;
  if (cfg.examMode) {
    enabled = false;
    reason = "exam_mode";
  } else if (!cfg.aiEnabled) {
    enabled = false;
    reason = "disabled";
  } else if (preset.needsKey && !hasKey) {
    enabled = false;
    reason = "missing_key";
  }

  return {
    enabled,
    reason,
    examMode: cfg.examMode,
    provider,
    baseUrl,
    model,
    hasKey,
    cloud: preset.cloud,
    apiKey,
  };
}

/** Client-safe projection — drops the API key and endpoint. */
export interface PublicAiStatus {
  enabled: boolean;
  reason: AiDisabledReason;
  examMode: boolean;
  provider: AiProvider;
  model: string;
  hasKey: boolean;
  cloud: boolean;
}

export function publicAiStatus(db: Db): PublicAiStatus {
  const c = effectiveAiConfig(db);
  return {
    enabled: c.enabled,
    reason: c.reason,
    examMode: c.examMode,
    provider: c.provider,
    model: c.model,
    hasKey: c.hasKey,
    cloud: c.cloud,
  };
}
