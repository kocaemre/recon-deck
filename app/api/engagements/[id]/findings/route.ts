/**
 * GET  /api/engagements/[id]/findings — list findings for an engagement
 * POST /api/engagements/[id]/findings — create a finding
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, listFindings, createFinding, type Severity } from "@/lib/db";
import { readJsonBody } from "@/lib/api/body";

const ALLOWED_SEVERITY: Severity[] = ["info", "low", "medium", "high", "critical"];

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const engagementId = parseInt(id, 10);
  if (!Number.isInteger(engagementId)) {
    return NextResponse.json({ error: "Invalid engagement id." }, { status: 400 });
  }
  const findings = listFindings(db, engagementId);
  return NextResponse.json({ findings });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const engagementId = parseInt(id, 10);
  if (!Number.isInteger(engagementId)) {
    return NextResponse.json({ error: "Invalid engagement id." }, { status: 400 });
  }

  const parsed = await readJsonBody<{
    portId?: number | null;
    severity?: string;
    title?: string;
    description?: string;
    cve?: string | null;
    evidenceRefs?: number[];
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  const severity = (body.severity ?? "medium") as Severity;
  if (!ALLOWED_SEVERITY.includes(severity)) {
    return NextResponse.json(
      { error: `Severity must be one of ${ALLOWED_SEVERITY.join(", ")}.` },
      { status: 400 },
    );
  }

  const finding = createFinding(db, {
    engagementId,
    portId: body.portId ?? null,
    severity,
    title,
    description: body.description?.trim() ?? "",
    cve: body.cve ?? null,
    evidenceRefs: Array.isArray(body.evidenceRefs)
      ? body.evidenceRefs.filter((n) => typeof n === "number")
      : [],
  });

  revalidatePath(`/engagements/${engagementId}`);
  return NextResponse.json({ finding });
}
