/**
 * POST /api/ai — AI co-pilot proxy (v2.5.0).
 *
 * The browser never talks to the LLM provider directly (CSP `connect-src
 * 'self'`); it calls this same-origin route, which resolves the server-side
 * config, builds an injection-hardened prompt, and streams the provider's
 * reply back as plain text. The API key never leaves the server.
 *
 * Hardening:
 *   - Gated on effectiveAiConfig().enabled — Exam Mode / disabled / missing
 *     key all short-circuit to a JSON error, no outbound call.
 *   - The system prompt is built here, not accepted from the client; the
 *     client only supplies structured context. Scan output is fenced as
 *     untrusted data (see prompts.ts).
 *   - The model is given no tools — a successful injection can only produce
 *     bad text, never an action.
 *   - Inherits the per-IP rate limit from middleware (/api/*).
 *
 * Body: { task: "explain", context: { port, protocol?, service?, version?, scanOutput } }
 * 200:  text/plain stream of the explanation
 * 400:  bad request   403: AI disabled (with reason)   502/503: provider error
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/api/body";
import { effectiveAiConfig } from "@/lib/ai/config";
import { buildExplainMessages } from "@/lib/ai/prompts";
import { streamChatCompletion, AiUpstreamError } from "@/lib/ai/client";

export const dynamic = "force-dynamic";

interface AiRequestBody {
  task?: unknown;
  context?: {
    port?: unknown;
    protocol?: unknown;
    service?: unknown;
    version?: unknown;
    scanOutput?: unknown;
  };
}

const asStr = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

export async function POST(request: NextRequest) {
  const cfg = effectiveAiConfig(db);
  if (!cfg.enabled) {
    return NextResponse.json(
      { error: "AI assistant is not available.", reason: cfg.reason },
      { status: 403 },
    );
  }

  const parsed = await readJsonBody<AiRequestBody>(request, {
    maxBytes: 64 * 1024,
  });
  if (!parsed.ok) return parsed.response;

  const { task, context } = parsed.body;
  if (task !== "explain") {
    return NextResponse.json({ error: "Unknown task." }, { status: 400 });
  }
  const port = Number(context?.port);
  const scanOutput = asStr(context?.scanOutput) ?? "";
  if (!Number.isInteger(port) || !scanOutput.trim()) {
    return NextResponse.json(
      { error: "Missing port or scan output." },
      { status: 400 },
    );
  }

  const messages = buildExplainMessages({
    port,
    protocol: asStr(context?.protocol) ?? null,
    service: asStr(context?.service) ?? null,
    version: asStr(context?.version) ?? null,
    scanOutput,
  });

  try {
    const stream = await streamChatCompletion(
      { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model },
      messages,
      { signal: request.signal },
    );
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    if (err instanceof AiUpstreamError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const aborted = err instanceof Error && err.name === "TimeoutError";
    return NextResponse.json(
      {
        error: aborted
          ? "AI provider timed out."
          : "Could not reach the AI provider.",
      },
      { status: 503 },
    );
  }
}
