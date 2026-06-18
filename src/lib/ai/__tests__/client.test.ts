import { afterEach, describe, expect, it, vi } from "vitest";
import {
  streamChatCompletion,
  chatCompletion,
  listModels,
  AiUpstreamError,
} from "../client.js";
import {
  estimateTargetCostUSD,
  pricePerMillion,
  RECOMMENDED_MODEL_IDS,
} from "../providers.js";

function sseStream(frames: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

const cfg = { baseUrl: "http://127.0.0.1:11434/v1", apiKey: null, model: "x" };

describe("ai/client streamChatCompletion", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses OpenAI SSE deltas into plain text and stops at [DONE]", async () => {
    const body = sseStream([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":", world"}}]}\n\n',
      "data: [DONE]\n\n",
      'data: {"choices":[{"delta":{"content":"IGNORED"}}]}\n\n',
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    );
    const out = await readAll(await streamChatCompletion(cfg, []));
    expect(out).toBe("Hello, world");
  });

  it("tolerates deltas split across chunk boundaries and keepalives", async () => {
    const body = sseStream([
      ": keepalive\n",
      'data: {"choices":[{"delta":{"content":"foo',
      '"}}]}\n', // completes the previous line on the next chunk
      'data: {"choices":[{"delta":{"content":"bar"}}]}\n',
      "data: [DONE]\n\n",
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    );
    const out = await readAll(await streamChatCompletion(cfg, []));
    expect(out).toBe("foobar");
  });

  it("throws AiUpstreamError on a non-2xx provider response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("nope", { status: 401, statusText: "Unauthorized" }),
      ),
    );
    await expect(streamChatCompletion(cfg, [])).rejects.toBeInstanceOf(
      AiUpstreamError,
    );
  });

  it("sends Authorization header only when a key is set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(sseStream(["data: [DONE]\n\n"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await readAll(
      await streamChatCompletion(
        { baseUrl: "https://api.openai.com/v1", apiKey: "sk-abc", model: "gpt" },
        [],
      ),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-abc");
  });
});

describe("ai/client chatCompletion (non-streaming)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the assistant message content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '[{"command":"x"}]' } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const out = await chatCompletion(cfg, []);
    expect(out).toBe('[{"command":"x"}]');
  });

  it("sends stream:false", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await chatCompletion(cfg, []);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.stream).toBe(false);
  });

  it("throws AiUpstreamError on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad", { status: 500 })),
    );
    await expect(chatCompletion(cfg, [])).rejects.toBeInstanceOf(AiUpstreamError);
  });
});

describe("ai/client listModels", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses, de-dupes and sorts models + pricing from /models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "openai/gpt-4o-mini",
                name: "GPT-4o mini",
                context_length: 128000,
                pricing: { prompt: "0.0000006", completion: "0.0000024" },
              },
              { id: "openai/gpt-4o" },
              { id: "openai/gpt-4o-mini" },
              { not_an_id: true },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const out = await listModels(cfg);
    expect(out.map((m) => m.id)).toEqual(["openai/gpt-4o", "openai/gpt-4o-mini"]);
    const mini = out.find((m) => m.id === "openai/gpt-4o-mini")!;
    expect(mini.promptPrice).toBe(0.0000006);
    expect(mini.completionPrice).toBe(0.0000024);
    expect(mini.contextLength).toBe(128000);
    expect(out.find((m) => m.id === "openai/gpt-4o")!.promptPrice).toBeUndefined();
  });

  it("hits the /models endpoint with the auth header when keyed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await listModels({ baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-or", model: "x" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/models");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk-or");
  });

  it("throws AiUpstreamError on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 401 })),
    );
    await expect(listModels(cfg)).rejects.toBeInstanceOf(AiUpstreamError);
  });
});

describe("ai/providers cost estimate", () => {
  it("estimates target cost from per-token prices", () => {
    // 15 ops * (1500*p + 350*c)
    const cost = estimateTargetCostUSD(0.0000006, 0.0000024)!;
    // 15*(1500*6e-7 + 350*2.4e-6) = 15*(9e-4 + 8.4e-4) = 15*1.74e-3 = 0.0261
    expect(cost).toBeCloseTo(0.0261, 4);
  });
  it("returns null when pricing is unknown (local providers)", () => {
    expect(estimateTargetCostUSD(undefined, undefined)).toBeNull();
    expect(estimateTargetCostUSD(0.0000006, undefined)).toBeNull();
  });
  it("pricePerMillion converts $/token to $/1M", () => {
    expect(pricePerMillion(0.0000006)).toBeCloseTo(0.6, 6);
    expect(pricePerMillion(undefined)).toBeUndefined();
  });
  it("has a non-empty recommended model list", () => {
    expect(RECOMMENDED_MODEL_IDS.length).toBeGreaterThan(3);
  });
});
