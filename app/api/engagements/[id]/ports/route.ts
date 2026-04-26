/**
 * POST /api/engagements/[id]/ports — manually add a port to an engagement.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, addManualPort } from "@/lib/db";
import { readJsonBody } from "@/lib/api/body";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const engagementId = parseInt(id, 10);
  if (!Number.isInteger(engagementId)) {
    return NextResponse.json({ error: "Invalid engagement id." }, { status: 400 });
  }

  const parsed = await readJsonBody<{
    port?: number;
    protocol?: string;
    state?: string;
    service?: string | null;
    product?: string | null;
    version?: string | null;
    extrainfo?: string | null;
    tunnel?: string | null;
    /** Optional explicit host (multi-host engagement). Falls back to primary. */
    hostId?: number;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (typeof body.port !== "number") {
    return NextResponse.json({ error: "Port is required." }, { status: 400 });
  }
  if (body.protocol !== "tcp" && body.protocol !== "udp") {
    return NextResponse.json(
      { error: "Protocol must be tcp or udp." },
      { status: 400 },
    );
  }

  const state =
    body.state === "open" || body.state === "filtered" ? body.state : "open";

  try {
    const port = addManualPort(db, {
      engagementId,
      hostId:
        typeof body.hostId === "number" && Number.isInteger(body.hostId)
          ? body.hostId
          : undefined,
      port: body.port,
      protocol: body.protocol,
      state,
      service: body.service?.trim() || null,
      product: body.product?.trim() || null,
      version: body.version?.trim() || null,
      extrainfo: body.extrainfo?.trim() || null,
      tunnel: body.tunnel === "ssl" ? "ssl" : null,
    });
    revalidatePath(`/engagements/${engagementId}`);
    return NextResponse.json({ port });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add port." },
      { status: 422 },
    );
  }
}
