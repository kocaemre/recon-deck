import "server-only";

/**
 * Minimal OpenAI-compatible streaming client (v2.5.0).
 *
 * One client for every provider — Ollama, OpenAI, OpenRouter and any other
 * OpenAI-compatible server all speak `POST {baseUrl}/chat/completions` with
 * SSE deltas, so we just swap `baseUrl` + `apiKey` + `model`. No SDK: a thin
 * fetch keeps the dependency surface (and the egress surface) auditable.
 *
 * Returns a plain-text ReadableStream — the SSE `data:` frames are parsed and
 * only the `choices[].delta.content` text is forwarded, so the route/UI never
 * sees raw protocol framing. A non-2xx upstream throws BEFORE any streaming
 * starts, letting the route surface a clean JSON error.
 */

import type { ChatMessage } from "./prompts";

export interface StreamOptions {
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Fired once with token/cost usage when the provider reports it (used to
   *  populate the usage ledger). Streaming needs stream_options.include_usage. */
  onUsage?: (usage: UsageInfo) => void;
}

/** Token counts + per-call cost, when the provider reports them. */
export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  /** USD for this call. OpenRouter reports it; OpenAI/Ollama leave it null. */
  costUsd: number | null;
}

/** Parse an OpenAI/OpenRouter `usage` object; null when nothing useful. */
export function parseUsage(u: unknown): UsageInfo | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const promptTokens = num(o.prompt_tokens) ?? 0;
  const completionTokens = num(o.completion_tokens) ?? 0;
  const costUsd = num(o.cost) ?? null;
  if (promptTokens === 0 && completionTokens === 0 && costUsd === null) {
    return null;
  }
  return { promptTokens, completionTokens, costUsd };
}

export class AiUpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AiUpstreamError";
  }
}

/**
 * Turn a non-2xx provider response into a clean, user-facing AiUpstreamError.
 *
 * Beta-test B-2: a raw `Provider returned 429: {"error":{...upstream json...}}`
 * is noise to the operator — and rate-limits are common on the free models the
 * picker recommends. Map the statuses worth distinguishing to plain guidance;
 * everything else keeps the generic "Provider returned N" shape (with the
 * upstream detail, which is useful for the long tail of 4xx/5xx).
 */
export function upstreamError(
  status: number,
  detail: string,
  surfaceStatus: number = status,
): AiUpstreamError {
  const trimmed = detail.trim();
  if (status === 429) {
    return new AiUpstreamError(
      "The AI provider is rate-limiting requests (429). Free models hit this " +
        "often — wait a few seconds and retry, or pick another model in " +
        "Settings → AI assistant.",
      surfaceStatus,
    );
  }
  if (status === 401 || status === 403) {
    return new AiUpstreamError(
      `The AI provider rejected the request (${status}) — check your API key ` +
        "and model access in Settings → AI assistant.",
      surfaceStatus,
    );
  }
  return new AiUpstreamError(
    `Provider returned ${status}${trimmed ? `: ${trimmed}` : ""}`,
    surfaceStatus,
  );
}

export interface StreamClientConfig {
  baseUrl: string;
  apiKey: string | null;
  model: string;
}

const DEFAULT_MAX_TOKENS = 700;
const DEFAULT_TIMEOUT_MS = 60_000;

/** Combine the caller's signal (if any) with a timeout signal. */
function combineSignals(timeoutMs: number, extra?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!extra) return timeout;
  // AbortSignal.any keeps both alive — abort if either fires.
  return AbortSignal.any([timeout, extra]);
}

export async function streamChatCompletion(
  cfg: StreamClientConfig,
  messages: ChatMessage[],
  opts: StreamOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  const signal = combineSignals(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: true,
      // Ask OpenAI-compatible providers to emit a final usage frame so we can
      // record token/cost analytics for streamed Explain calls.
      stream_options: { include_usage: true },
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: 0.2,
    }),
    signal,
    cache: "no-store",
  });

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    throw upstreamError(res.status, detail, res.ok ? 502 : res.status);
  }

  return parseSseToText(res.body, opts.onUsage);
}

/**
 * Non-streaming completion — returns the full assistant message text. Used for
 * structured tasks (e.g. command suggestions) where we need the whole JSON
 * before validating it, not a token stream.
 */
export async function chatCompletion(
  cfg: StreamClientConfig,
  messages: ChatMessage[],
  opts: StreamOptions = {},
): Promise<{ text: string; usage: UsageInfo | null }> {
  const signal = combineSignals(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: false,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: 0.2,
    }),
    signal,
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    throw upstreamError(res.status, detail);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };
  return {
    text: json?.choices?.[0]?.message?.content ?? "",
    usage: parseUsage(json?.usage),
  };
}

/**
 * One model from an OpenAI-compatible `/models` listing. OpenRouter also
 * returns per-token `pricing` + `context_length`; OpenAI/Ollama omit pricing
 * (fields stay undefined). Prices are USD per token (as OpenRouter reports).
 */
export interface ModelInfo {
  id: string;
  name?: string;
  promptPrice?: number;
  completionPrice?: number;
  contextLength?: number;
}

/**
 * List available models from an OpenAI-compatible `GET /models`. Used by the
 * settings model picker. OpenAI, OpenRouter, Ollama and LM Studio all expose
 * this; OpenRouter additionally carries pricing/context metadata which we
 * surface for the price + cost-estimate UI. De-duped, sorted by id.
 */
export async function listModels(
  cfg: StreamClientConfig,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ModelInfo[]> {
  const signal = combineSignals(opts.timeoutMs ?? 15_000, opts.signal);
  const headers: Record<string, string> = {};
  if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/models`, {
    headers,
    signal,
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    throw upstreamError(res.status, detail);
  }
  const json = (await res.json()) as {
    data?: Array<{
      id?: unknown;
      name?: unknown;
      context_length?: unknown;
      pricing?: { prompt?: unknown; completion?: unknown };
    }>;
  };
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return typeof v === "string" || typeof v === "number"
      ? Number.isFinite(n)
        ? n
        : undefined
      : undefined;
  };
  const seen = new Set<string>();
  const out: ModelInfo[] = [];
  for (const m of json?.data ?? []) {
    if (typeof m?.id !== "string" || !m.id || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push({
      id: m.id,
      name: typeof m.name === "string" ? m.name : undefined,
      promptPrice: num(m.pricing?.prompt),
      completionPrice: num(m.pricing?.completion),
      contextLength: num(m.context_length),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Transform an OpenAI-style SSE byte stream into a plain UTF-8 text stream of
 * just the assistant deltas. Buffers across chunk boundaries; tolerates
 * keepalive comments and the terminal `[DONE]` sentinel.
 */
function parseSseToText(
  upstream: ReadableStream<Uint8Array>,
  onUsage?: (usage: UsageInfo) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const reader = upstream.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      // Keep reading upstream until we actually enqueue something, hit [DONE],
      // or the upstream ends. Returning from pull() WITHOUT enqueuing (e.g. a
      // keepalive comment or a delta split across chunk boundaries) would
      // deadlock the consumer, which is waiting on a value that never comes.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        let enqueued = false;
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line || line.startsWith(":")) continue; // blank / keepalive
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            controller.close();
            return;
          }
          try {
            const json = JSON.parse(payload);
            // Final usage frame (stream_options.include_usage) — choices is
            // usually empty here; record it without enqueuing any text.
            if (json?.usage && onUsage) {
              const u = parseUsage(json.usage);
              if (u) onUsage(u);
            }
            const delta: string | undefined =
              json?.choices?.[0]?.delta?.content;
            if (delta) {
              controller.enqueue(encoder.encode(delta));
              enqueued = true;
            }
          } catch {
            // Partial/non-JSON frame — ignore; next chunk completes it.
          }
        }
        if (enqueued) return;
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}
