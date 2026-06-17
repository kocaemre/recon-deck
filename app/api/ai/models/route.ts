/**
 * GET /api/ai/models — list the configured provider's available models (v2.5.0).
 *
 * Drives the model picker in Settings. It's a configuration helper, so it works
 * even when the assistant itself is gated off (disabled / Exam Mode) — but a
 * cloud provider still needs its key saved first. The key never leaves the
 * server; the browser only ever sees the resulting id list.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { effectiveAiConfig } from "@/lib/ai/config";
import { listModels, AiUpstreamError } from "@/lib/ai/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = effectiveAiConfig(db);
  if (cfg.cloud && !cfg.hasKey) {
    return NextResponse.json(
      { error: "Save an API key first, then load models.", models: [] },
      { status: 400 },
    );
  }
  try {
    const models = await listModels({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
    });
    return NextResponse.json({ models });
  } catch (err) {
    if (err instanceof AiUpstreamError) {
      return NextResponse.json(
        { error: err.message, models: [] },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: "Could not reach the provider.", models: [] },
      { status: 503 },
    );
  }
}
