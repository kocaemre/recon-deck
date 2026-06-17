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

export function isAiProvider(v: string): v is AiProvider {
  return v === "ollama" || v === "openai" || v === "openrouter";
}

/** Unknown/garbage provider values fall back to the local default. */
export function normalizeProvider(raw: string): AiProvider {
  return isAiProvider(raw) ? raw : "ollama";
}
