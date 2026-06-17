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
    throw new AiUpstreamError(
      `Provider returned ${res.status}${detail ? `: ${detail}` : ""}`,
      res.ok ? 502 : res.status,
    );
  }

  return parseSseToText(res.body);
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
): Promise<string> {
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
    throw new AiUpstreamError(`Provider returned ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json?.choices?.[0]?.message?.content ?? "";
}

/**
 * Transform an OpenAI-style SSE byte stream into a plain UTF-8 text stream of
 * just the assistant deltas. Buffers across chunk boundaries; tolerates
 * keepalive comments and the terminal `[DONE]` sentinel.
 */
function parseSseToText(
  upstream: ReadableStream<Uint8Array>,
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
