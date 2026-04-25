/**
 * POST /api/engagements/[id]/ports — manually add a port to an engagement.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, addManualPort } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const engagementId = parseInt(id, 10);
  if (!Number.isInteger(engagementId)) {
    return NextResponse.json({ error: "Invalid engagement id." }, { status: 400 });
  }

  let body: {
    port?: number;
    protocol?: string;
    state?: string;
    service?: string | null;
    product?: string | null;
    version?: string | null;
    extrainfo?: string | null;
    tunnel?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

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
