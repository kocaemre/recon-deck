import { afterEach, describe, expect, it, vi } from "vitest";
import {
  streamChatCompletion,
  chatCompletion,
  AiUpstreamError,
} from "../client.js";

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
