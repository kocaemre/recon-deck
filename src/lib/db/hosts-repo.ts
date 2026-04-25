import "server-only";

/**
 * Hosts repository (P1-F PR 1).
 *
 * Read-side helpers for the multi-host foundation. Write-side mutations live
 * in `engagement-repo.ts` (createFromScan / updateTarget) so the host invariants
 * — at-least-one row, exactly-one-primary — stay close to the engagement
 * lifecycle. Once later PRs introduce explicit "add host" / "delete host"
 * actions in the UI, full CRUD will land here.
 */

import { eq, and, desc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { hosts, type Host } from "./schema";
import type * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

/**
 * List every host inside an engagement, primary first then by IP.
 *
 * Sort order matters: the engagement page header reads `[0]` to render the
 * default-selected host until the UI explicitly switches. Keep deterministic.
 */
export function listHostsForEngagement(db: Db, engagementId: number): Host[] {
  return db
    .select()
    .from(hosts)
    .where(eq(hosts.engagement_id, engagementId))
    .all()
    .sort((a, b) => {
      // primary first
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      // then IP ascending — string compare is fine for both v4 and v6
      return a.ip.localeCompare(b.ip);
    });
}

/**
 * Resolve the engagement's primary host. Throws if absent — every engagement
 * is required to have one (migration 0007 backfilled, createFromScan inserts).
 * A missing primary signals corruption that callers shouldn't paper over.
 */
export function getPrimaryHost(db: Db, engagementId: number): Host {
  const row = db
    .select()
    .from(hosts)
    .where(
      and(eq(hosts.engagement_id, engagementId), eq(hosts.is_primary, true)),
    )
    .orderBy(desc(hosts.id))
    .get();
  if (!row) {
    throw new Error(
      `No primary host for engagement ${engagementId} — schema invariant violated.`,
    );
  }
  return row;
}
