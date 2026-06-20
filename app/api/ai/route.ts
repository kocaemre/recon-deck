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
import { db, recordAiUsage } from "@/lib/db";
import { readJsonBody } from "@/lib/api/body";
import { effectiveAiConfig } from "@/lib/ai/config";
import {
  buildExplainMessages,
  buildSuggestMessages,
  buildSummaryMessages,
  parseSuggestions,
  type SummaryPortInput,
} from "@/lib/ai/prompts";
import {
  streamChatCompletion,
  chatCompletion,
  AiUpstreamError,
} from "@/lib/ai/client";

export const dynamic = "force-dynamic";

interface AiRequestBody {
  task?: unknown;
  /** Optional target identity for the usage ledger (analytics only). */
  engagementId?: unknown;
  engagementLabel?: unknown;
  host?: unknown;
  context?: {
    port?: unknown;
    protocol?: unknown;
    service?: unknown;
    version?: unknown;
    scanOutput?: unknown;
    kbCommands?: unknown;
    /** summarize_engagement: the host's open ports. */
    ports?: unknown;
    target?: unknown;
  };
}

const asStr = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** Coerce the client-sent baseline KB commands into a clean {label, command}[]. */
function asKbCommands(v: unknown): Array<{ label: string; command: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => ({
      label: asStr((c as { label?: unknown })?.label) ?? "",
      command: asStr((c as { command?: unknown })?.command) ?? "",
    }))
    .filter((c) => c.command)
    .slice(0, 30);
}

/** Coerce the client-sent open-ports list for the engagement summary. */
function asSummaryPorts(v: unknown): SummaryPortInput[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((p) => {
      const o = p as Record<string, unknown>;
      return {
        port: Number(o?.port),
        protocol: asStr(o?.protocol) ?? null,
        service: asStr(o?.service) ?? null,
        version: asStr(o?.version) ?? null,
        scanOutput: asStr(o?.scanOutput) ?? null,
      };
    })
    .filter((p) => Number.isInteger(p.port))
    .slice(0, 60);
}

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
  if (
    task !== "explain" &&
    task !== "suggest_commands" &&
    task !== "summarize_engagement"
  ) {
    return NextResponse.json({ error: "Unknown task." }, { status: 400 });
  }

  const clientCfg = {
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
  };

  // Best-effort usage ledger (analytics only — never breaks the AI response).
  const engagementId = Number.isInteger(Number(parsed.body.engagementId))
    ? Number(parsed.body.engagementId)
    : null;
  const ledger = (
    ledgerTask: "explain" | "suggest" | "summary",
    usage: { promptTokens: number; completionTokens: number; costUsd: number | null } | null,
  ) => {
    if (!usage) return;
    try {
      recordAiUsage(db, {
        engagementId,
        engagementLabel: asStr(parsed.body.engagementLabel) ?? null,
        host: asStr(parsed.body.host) ?? null,
        task: ledgerTask,
        provider: cfg.provider,
        model: cfg.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        costUsd: usage.costUsd,
      });
    } catch {
      /* analytics must never break the response */
    }
  };

  try {
    // Engagement-level summary: a prioritized plan over ALL open ports.
    if (task === "summarize_engagement") {
      const ports = asSummaryPorts(context?.ports);
      if (ports.length === 0) {
        return NextResponse.json(
          { error: "No ports to summarize." },
          { status: 400 },
        );
      }
      const stream = await streamChatCompletion(
        clientCfg,
        buildSummaryMessages({ target: asStr(context?.target) ?? null, ports }),
        {
          signal: request.signal,
          // Whole-host summary is the heaviest prompt — give reasoning models
          // extra headroom so reasoning doesn't crowd out the answer.
          maxTokens: 2048,
          onUsage: (u) => ledger("summary", u),
        },
      );
      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // explain / suggest are single-port: validate the port + scan output here.
    const port = Number(context?.port);
    const scanOutput = asStr(context?.scanOutput) ?? "";
    if (!Number.isInteger(port) || !scanOutput.trim()) {
      return NextResponse.json(
        { error: "Missing port or scan output." },
        { status: 400 },
      );
    }
    const common = {
      port,
      protocol: asStr(context?.protocol) ?? null,
      service: asStr(context?.service) ?? null,
      version: asStr(context?.version) ?? null,
      scanOutput,
    };

    // Structured task: full JSON, validated server-side before returning.
    if (task === "suggest_commands") {
      const { text, usage } = await chatCompletion(
        clientCfg,
        buildSuggestMessages({
          ...common,
          kbCommands: asKbCommands(context?.kbCommands),
        }),
        { signal: request.signal },
      );
      ledger("suggest", usage);
      const suggestions = parseSuggestions(text);
      if (suggestions.length === 0) {
        return NextResponse.json(
          { error: "The model returned no usable suggestions." },
          { status: 502 },
        );
      }
      return NextResponse.json({ suggestions });
    }

    // Streaming task: explain.
    const stream = await streamChatCompletion(
      clientCfg,
      buildExplainMessages(common),
      {
        signal: request.signal,
        onUsage: (u) => ledger("explain", u),
      },
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
