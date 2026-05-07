import "server-only";

/**
 * Scan history repository (P1-G PR 1).
 *
 * Two surfaces:
 *   - `listScanHistory(db, engagementId)` — surface every scan associated
 *     with an engagement, newest first. Drives the "Compare to scan X"
 *     dropdown landing in PR 2.
 *   - `rescanEngagement(db, engagementId, scan, rawInput)` — append a new
 *     scan_history row, reconcile hosts + ports against the existing
 *     state, and update lifecycle columns:
 *       * existing port re-observed   → last_seen_scan_id = new id;
 *                                       closed_at_scan_id cleared (re-open)
 *       * existing port absent        → closed_at_scan_id = new id
 *       * new port surfaced           → insert with first_seen = last_seen = new id
 *       * new host surfaced           → insert host (is_primary = false), then ports
 *
 * Findings, evidence, checks, notes, and AR artifacts are NOT touched here
 * — those are operator-curated content; only the scan-derived port surface
 * area changes. PR 2 will surface a diff view; PR 1 just persists the
 * deltas so the schema is honest about what has happened.
 */

import { and, eq, desc, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  scan_history,
  ports as portsTable,
  port_scripts,
  hosts as hostsTable,
  type ScanHistory,
} from "./schema";
import type { ParsedScan } from "../parser/types";
import { extractNmapFingerprints } from "../parser/fingerprints";
import { replaceForPort as replaceFingerprintsForPort } from "./fingerprints-repo";
import type * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

export function listScanHistory(
  db: Db,
  engagementId: number,
): ScanHistory[] {
  return db
    .select()
    .from(scan_history)
    .where(eq(scan_history.engagement_id, engagementId))
    .orderBy(desc(scan_history.id))
    .all();
}

export interface RescanResult {
  scanId: number;
  added: number;
  reopened: number;
  closed: number;
  reaffirmed: number;
  newHosts: number;
}

/**
 * Append a re-import to an engagement and reconcile the port surface area.
 *
 * Throws when the engagement doesn't exist (FK insert will fail) or when
 * `scan.hosts` is empty (every parsed scan must include ≥1 host per the
 * parser contract — see src/lib/parser/types.ts).
 */
export function rescanEngagement(
  db: Db,
  engagementId: number,
  scan: ParsedScan,
  rawInput: string,
): RescanResult {
  if (!scan.hosts || scan.hosts.length === 0) {
    throw new Error(
      "Re-imported scan must contain at least one host — parser contract violated.",
    );
  }

  return db.transaction((tx) => {
    const now = new Date().toISOString();

    // 1. Append new scan_history row.
    const inserted = tx
      .insert(scan_history)
      .values({
        engagement_id: engagementId,
        raw_input: rawInput,
        source: scan.source,
        scanned_at: scan.scannedAt ?? null,
        created_at: now,
      })
      .returning({ id: scan_history.id })
      .get();
    const newScanId = inserted.id;

    // 2. Load current host + port surface for the engagement once.
    const existingHosts = tx
      .select()
      .from(hostsTable)
      .where(eq(hostsTable.engagement_id, engagementId))
      .all();
    const existingPorts = tx
      .select()
      .from(portsTable)
      .where(eq(portsTable.engagement_id, engagementId))
      .all();

    // hostKey = ip — multi-host engagements rely on IP being unique within
    // an engagement (parsers don't synthesize duplicates).
    const hostByIp = new Map<string, number>();
    for (const h of existingHosts) hostByIp.set(h.ip, h.id);

    // portKey = `${host_id}:${proto}/${port}` — uniquely identifies a port
    // within an engagement.
    const portByKey = new Map<string, (typeof existingPorts)[number]>();
    for (const p of existingPorts) {
      if (p.host_id != null) {
        portByKey.set(`${p.host_id}:${p.protocol}/${p.port}`, p);
      }
    }

    let added = 0;
    let reopened = 0;
    let reaffirmed = 0;
    let newHosts = 0;

    // Collect every port key the new scan still observes so we can flag
    // the absentees as closed in step 4.
    const observedKeys = new Set<string>();

    // 3. Walk the parsed scan and reconcile per host.
    for (const ph of scan.hosts) {
      let hostId = hostByIp.get(ph.target.ip);
      if (hostId == null) {
        // New host added by this re-import — non-primary by default.
        const insertedHost = tx
          .insert(hostsTable)
          .values({
            engagement_id: engagementId,
            ip: ph.target.ip,
            hostname: ph.target.hostname ?? null,
            state: ph.target.state ?? null,
            os_name: ph.os?.name ?? null,
            os_accuracy: ph.os?.accuracy ?? null,
            is_primary: false,
            scanned_at: scan.scannedAt ?? null,
          })
          .returning({ id: hostsTable.id })
          .get();
        hostId = insertedHost.id;
        hostByIp.set(ph.target.ip, hostId);
        newHosts += 1;
      } else if (ph.target.hostname || ph.os?.name) {
        // Refresh host metadata that may have evolved between scans.
        tx.update(hostsTable)
          .set({
            hostname: ph.target.hostname ?? null,
            os_name: ph.os?.name ?? null,
            os_accuracy: ph.os?.accuracy ?? null,
            scanned_at: scan.scannedAt ?? null,
          })
          .where(eq(hostsTable.id, hostId))
          .run();
      }

      for (const p of ph.ports) {
        const key = `${hostId}:${p.protocol}/${p.port}`;
        observedKeys.add(key);
        const existing = portByKey.get(key);

        if (existing) {
          // Port already known — refresh last_seen, clear closed marker if
          // the port had previously gone quiet, and update service/version
          // metadata that may have drifted.
          const wasClosed = existing.closed_at_scan_id != null;
          tx.update(portsTable)
            .set({
              last_seen_scan_id: newScanId,
              closed_at_scan_id: null,
              state: p.state,
              service: p.service ?? null,
              product: p.product ?? null,
              version: p.version ?? null,
              tunnel: p.tunnel ?? null,
              extrainfo: p.extrainfo ?? null,
            })
            .where(eq(portsTable.id, existing.id))
            .run();

          // Replace NSE script output with the new scan's payload — we
          // delete only the previously-recorded NSE rows (source='nmap')
          // so AutoRecon-imported artifacts are preserved across re-imports.
          tx.delete(port_scripts)
            .where(
              and(
                eq(port_scripts.port_id, existing.id),
                eq(port_scripts.source, "nmap"),
              ),
            )
            .run();
          for (const s of p.scripts) {
            tx.insert(port_scripts)
              .values({
                engagement_id: engagementId,
                port_id: existing.id,
                host_id: hostId,
                script_id: s.id,
                output: s.output,
                is_host_script: false,
                source: "nmap",
              })
              .run();
          }

          // v2.4.0 P2 (#27): refresh nmap fingerprints on the existing
          // port row. AutoRecon-derived rows (different `source`) survive.
          replaceFingerprintsForPort(
            tx,
            existing.id,
            "nmap",
            extractNmapFingerprints(p),
          );

          if (wasClosed) reopened += 1;
          else reaffirmed += 1;
        } else {
          // First time this port surfaces in the engagement.
          const insertedPort = tx
            .insert(portsTable)
            .values({
              engagement_id: engagementId,
              host_id: hostId,
              port: p.port,
              protocol: p.protocol,
              state: p.state,
              service: p.service ?? null,
              product: p.product ?? null,
              version: p.version ?? null,
              tunnel: p.tunnel ?? null,
              extrainfo: p.extrainfo ?? null,
              first_seen_scan_id: newScanId,
              last_seen_scan_id: newScanId,
            })
            .returning({ id: portsTable.id })
            .get();
          for (const s of p.scripts) {
            tx.insert(port_scripts)
              .values({
                engagement_id: engagementId,
                port_id: insertedPort.id,
                host_id: hostId,
                script_id: s.id,
                output: s.output,
                is_host_script: false,
                source: "nmap",
              })
              .run();
          }
          // v2.4.0 P2 (#27): brand-new port → seed its nmap fingerprints.
          replaceFingerprintsForPort(
            tx,
            insertedPort.id,
            "nmap",
            extractNmapFingerprints(p),
          );
          added += 1;
        }
      }
    }

    // 4. Flag previously-open ports that the new scan didn't see as closed.
    let closed = 0;
    for (const [key, existing] of portByKey) {
      if (observedKeys.has(key)) continue;
      // Already-closed ports stay closed (don't bump closed_at_scan_id —
      // that would lose the original close timestamp).
      if (existing.closed_at_scan_id != null) continue;
      tx.update(portsTable)
        .set({ closed_at_scan_id: newScanId })
        .where(
          and(eq(portsTable.id, existing.id), isNull(portsTable.closed_at_scan_id)),
        )
        .run();
      closed += 1;
    }

    return {
      scanId: newScanId,
      added,
      reopened,
      closed,
      reaffirmed,
      newHosts,
    };
  });
}
