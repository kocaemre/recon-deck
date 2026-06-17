/**
 * GET /api/ai/status — client-safe AI assistant state (v2.5.0).
 *
 * Returns whether the AI co-pilot is usable right now and why not, without
 * ever exposing the API key or endpoint. The UI uses this to show/hide AI
 * affordances and to render the Exam Mode badge. Mirrors the opt-in,
 * server-resolved pattern of /api/update-check.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publicAiStatus } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(publicAiStatus(db));
}
