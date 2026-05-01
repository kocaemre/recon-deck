import "server-only";

/**
 * Manual port repository — adds a port to an existing engagement without
 * going through the nmap/AutoRecon parse pipeline. Used when the pentester
 * discovers a service that nmap missed (e.g. a service announced via
 * `dig` zone transfer or a kerberos pre-auth probe).
 */

import { eq, and, desc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { ports, engagements, hosts, scan_history, type Port } from "./schema";
import type * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

export interface ManualPortInput {
  engagementId: number;
  /** Optional explicit host. Falls back to the engagement's primary host. */
  hostId?: number;
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

  // Resolve target host. Caller may pin the active host (multi-host UI);
  // otherwise we attribute the port to the engagement's primary host.
  // Migration 0007 guarantees every engagement has at least one host with
  // is_primary = 1.
  let hostId: number | null = null;
  if (input.hostId !== undefined) {
    const requested = db
      .select({ id: hosts.id })
      .from(hosts)
      .where(
        and(
          eq(hosts.id, input.hostId),
          eq(hosts.engagement_id, input.engagementId),
        ),
      )
      .get();
    if (!requested) {
      throw new Error(
        `Host ${input.hostId} does not belong to engagement ${input.engagementId}.`,
      );
    }
    hostId = requested.id;
  } else {
    const primary = db
      .select({ id: hosts.id })
      .from(hosts)
      .where(
        and(
          eq(hosts.engagement_id, input.engagementId),
          eq(hosts.is_primary, true),
        ),
      )
      .get();
    if (!primary) {
      throw new Error(
        `Engagement ${input.engagementId} has no primary host (migration 0007 invariant violated).`,
      );
    }
    hostId = primary.id;
  }

  // Bind the new port to the engagement's most recent scan so the lifecycle
  // chips (NEW / CLOSED) on the heatmap behave correctly across re-imports.
  // Migration 0008 backfilled an inaugural scan_history row for every
  // existing engagement, so the lookup is always non-empty.
  const latestScan = db
    .select({ id: scan_history.id })
    .from(scan_history)
    .where(eq(scan_history.engagement_id, input.engagementId))
    .orderBy(desc(scan_history.id))
    .get();
  if (!latestScan) {
    throw new Error(
      `Engagement ${input.engagementId} has no scan_history rows (migration 0008 invariant violated).`,
    );
  }

  // Reject duplicate (engagement, host, port, protocol) — pentester likely
  // meant to edit the existing one rather than create a phantom row. Scope
  // is per-host so the same port number can exist on different hosts inside
  // the same engagement.
  const dup = db
    .select({ id: ports.id })
    .from(ports)
    .where(
      and(
        eq(ports.engagement_id, input.engagementId),
        eq(ports.host_id, hostId),
        eq(ports.port, input.port),
        eq(ports.protocol, input.protocol),
      ),
    )
    .get();
  if (dup) {
    throw new Error(
      `${input.port}/${input.protocol} already exists on this host in the engagement.`,
    );
  }

  return db
    .insert(ports)
    .values({
      engagement_id: input.engagementId,
      host_id: hostId,
      port: input.port,
      protocol: input.protocol,
      state: input.state ?? "open",
      service: input.service ?? null,
      product: input.product ?? null,
      version: input.version ?? null,
      tunnel: input.tunnel ?? null,
      extrainfo: input.extrainfo ?? null,
      first_seen_scan_id: latestScan.id,
      last_seen_scan_id: latestScan.id,
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

/**
 * Toggle the starred flag on a port (v1.2.0 #11).
 *
 * Scoped by engagement so a stray portId from another engagement
 * cannot flip the wrong row — the heatmap surfaces the affordance
 * per-engagement and the route checks ownership before calling.
 *
 * Returns the new starred state, or `null` when the (engagement, port)
 * pair doesn't exist.
 */
export function togglePortStar(
  db: Db,
  engagementId: number,
  portId: number,
): boolean | null {
  const row = db
    .select({ starred: ports.starred })
    .from(ports)
    .where(and(eq(ports.id, portId), eq(ports.engagement_id, engagementId)))
    .get();
  if (!row) return null;
  const next = !row.starred;
  const result = db
    .update(ports)
    .set({ starred: next })
    .where(and(eq(ports.id, portId), eq(ports.engagement_id, engagementId)))
    .run();
  return result.changes > 0 ? next : null;
}

/**
 * Set the starred flag explicitly. Used by the PATCH route when the
 * client supplies `{ starred: boolean }`. Returns true on update.
 */
export function setPortStar(
  db: Db,
  engagementId: number,
  portId: number,
  starred: boolean,
): boolean {
  return (
    db
      .update(ports)
      .set({ starred })
      .where(
        and(eq(ports.id, portId), eq(ports.engagement_id, engagementId)),
      )
      .run().changes > 0
  );
}
