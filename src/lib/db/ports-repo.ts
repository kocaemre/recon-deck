import "server-only";

/**
 * Manual port repository — adds a port to an existing engagement without
 * going through the nmap/AutoRecon parse pipeline. Used when the pentester
 * discovers a service that nmap missed (e.g. a service announced via
 * `dig` zone transfer or a kerberos pre-auth probe).
 */

import { eq, and } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { ports, engagements, type Port } from "./schema";
import type * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

export interface ManualPortInput {
  engagementId: number;
  port: number;
  protocol: "tcp" | "udp";
  state?: "open" | "filtered";
  service?: string | null;
  product?: string | null;
  version?: string | null;
  extrainfo?: string | null;
  tunnel?: "ssl" | null;
}

export function addManualPort(db: Db, input: ManualPortInput): Port {
  // Verify engagement exists (FK CASCADE handles delete cleanup).
  const eng = db
    .select({ id: engagements.id })
    .from(engagements)
    .where(eq(engagements.id, input.engagementId))
    .get();
  if (!eng) {
    throw new Error(`Engagement ${input.engagementId} not found.`);
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error("Port must be 1-65535.");
  }
  if (input.protocol !== "tcp" && input.protocol !== "udp") {
    throw new Error("Protocol must be 'tcp' or 'udp'.");
  }

  // Reject duplicate (engagement, port, protocol) — pentester likely meant to
  // edit the existing one rather than create a phantom row.
  const dup = db
    .select({ id: ports.id })
    .from(ports)
    .where(
      and(
        eq(ports.engagement_id, input.engagementId),
        eq(ports.port, input.port),
        eq(ports.protocol, input.protocol),
      ),
    )
    .get();
  if (dup) {
    throw new Error(
      `${input.port}/${input.protocol} already exists in this engagement.`,
    );
  }

  return db
    .insert(ports)
    .values({
      engagement_id: input.engagementId,
      port: input.port,
      protocol: input.protocol,
      state: input.state ?? "open",
      service: input.service ?? null,
      product: input.product ?? null,
      version: input.version ?? null,
      tunnel: input.tunnel ?? null,
      extrainfo: input.extrainfo ?? null,
    })
    .returning()
    .get();
}

export function deletePort(
  db: Db,
  engagementId: number,
  portId: number,
): boolean {
  return (
    db
      .delete(ports)
      .where(
        and(eq(ports.id, portId), eq(ports.engagement_id, engagementId)),
      )
      .run().changes > 0
  );
}
