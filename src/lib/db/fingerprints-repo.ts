import "server-only";

/**
 * port_fingerprints repo (v2.4.0 P2 #27).
 *
 * Two operations the import path needs:
 *   - replaceForPort: delete + reinsert a source's rows for a single port,
 *     atomically inside the caller's transaction. Used on rescan so a
 *     fresh nmap import doesn't accumulate stale signals from the prior
 *     scan, while AutoRecon-derived rows (different `source`) survive.
 *   - listForPort: read fingerprints for resolver / debugging.
 *
 * Inserts hit the UNIQUE(port_id, source, type, value) index so a no-op
 * rescan with identical signals collapses into the same row set.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { port_fingerprints, type PortFingerprint } from "./schema";
import type * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type FingerprintSource = "nmap" | "autorecon";
export type FingerprintType = "tech" | "cves" | "banners";

export interface FingerprintInput {
  type: FingerprintType;
  value: string;
}

/**
 * Replace all rows for a (port_id, source) pair with the supplied set.
 * No-op when `fingerprints` is empty AND there were no existing rows —
 * the delete still runs to keep the contract simple ("after this call,
 * rows for this scope are exactly `fingerprints`").
 *
 * Must run inside a transaction — the import flow uses one big tx and
 * we don't want partial state if the caller bails halfway.
 */
export function replaceForPort(
  tx: Tx,
  portId: number,
  source: FingerprintSource,
  fingerprints: ReadonlyArray<FingerprintInput>,
): void {
  tx.delete(port_fingerprints)
    .where(
      and(
        eq(port_fingerprints.port_id, portId),
        eq(port_fingerprints.source, source),
      ),
    )
    .run();

  for (const fp of fingerprints) {
    tx.insert(port_fingerprints)
      .values({
        port_id: portId,
        source,
        type: fp.type,
        value: fp.value,
      })
      .onConflictDoNothing()
      .run();
  }
}

/** Read fingerprints for a port, optionally filtered by source. */
export function listForPort(
  db: Db | Tx,
  portId: number,
  source?: FingerprintSource,
): PortFingerprint[] {
  const where = source
    ? and(
        eq(port_fingerprints.port_id, portId),
        eq(port_fingerprints.source, source),
      )
    : eq(port_fingerprints.port_id, portId);
  return db
    .select()
    .from(port_fingerprints)
    .where(where)
    .all();
}

/**
 * Bulk-load fingerprints for many ports in one query. Engagement page
 * uses this to avoid an N+1 across the heatmap render. Empty input
 * returns an empty map.
 */
export function listForPorts(
  db: Db | Tx,
  portIds: ReadonlyArray<number>,
): Map<number, PortFingerprint[]> {
  const out = new Map<number, PortFingerprint[]>();
  if (portIds.length === 0) return out;
  const rows = db
    .select()
    .from(port_fingerprints)
    .where(inArray(port_fingerprints.port_id, [...portIds]))
    .all();
  for (const r of rows) {
    const list = out.get(r.port_id) ?? [];
    list.push(r);
    out.set(r.port_id, list);
  }
  return out;
}
