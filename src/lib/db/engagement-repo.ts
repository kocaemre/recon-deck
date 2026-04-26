import "server-only";

/**
 * Engagement repository — Phase 3 CRUD layer for the engagements table.
 *
 * Functions:
 *   createFromScan  — Insert engagement + ports + scripts in a single transaction (PERSIST-02, PERSIST-04)
 *   getById         — Load full engagement with all nested data assembled (PERSIST-02)
 *   listSummaries   — List lightweight engagement summaries for sidebar (PERSIST-02)
 *   updateTarget    — Update target IP/hostname + auto-regenerate name (INPUT-03, Phase 4)
 *
 * All functions accept `db: Db` as first parameter (dependency injection).
 * This decouples the repo from the module-level client singleton, enabling
 * tests to pass in-memory DBs directly (avoids RESEARCH Pitfall 6).
 *
 * `import "server-only"` prevents accidental client-side imports.
 */

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq, sql, desc, and } from "drizzle-orm";
import {
  engagements,
  ports,
  port_scripts,
  port_commands,
  check_states,
  port_notes,
  port_evidence,
  findings as findingsTable,
  hosts,
  scan_history,
} from "./schema";
import type { ParsedScan } from "../parser/types";
import type { FullEngagement, EngagementSummary, PortWithDetails } from "./types";
import type * as schema from "./schema";

/** Drizzle database instance type — inferred from schema for full type safety. */
export type Db = BetterSQLite3Database<typeof schema>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Auto-generate engagement name from scan target (D-01).
 *
 * Rule: if hostname is present and different from the IP, format as
 * "hostname (ip)". Otherwise fall back to plain IP.
 *
 * Examples:
 *   { ip: "10.10.10.5", hostname: "box.htb" } → "box.htb (10.10.10.5)"
 *   { ip: "10.10.10.5" }                      → "10.10.10.5"
 *   { ip: "10.10.10.5", hostname: "10.10.10.5" } → "10.10.10.5"
 */
function generateName(scan: ParsedScan): string {
  const { ip, hostname } = scan.target;
  if (hostname && hostname !== ip) {
    return `${hostname} (${ip})`;
  }
  return ip;
}

// ---------------------------------------------------------------------------
// createFromScan
// ---------------------------------------------------------------------------

/**
 * Create a new engagement from a parsed nmap scan (PERSIST-02).
 *
 * Wraps all inserts (engagement + ports + scripts + host scripts + any
 * AutoRecon-sourced service files and manual commands) in a single
 * transaction (Pitfall 4: atomicity — partial inserts on crash are
 * prevented). Name auto-generated per D-01. raw_input stored verbatim per
 * PERSIST-04.
 *
 * Phase 5 extension: when `arData` is provided, per-port AutoRecon service
 * file outputs are inserted into `port_scripts` with `source='autorecon'`,
 * and parsed manual commands are inserted into `port_commands`. Both maps
 * are keyed by PORT NUMBER (not port_id) because at call time the caller
 * only knows the port number from the parsed data; the transaction looks
 * up AR data by port number after inserting each port row.
 *
 * @param db       - Drizzle database instance (injection for testability)
 * @param scan     - Parsed nmap output (from parseAny or parseNmapXml)
 * @param rawInput - Original paste/upload string before parsing (PERSIST-04)
 * @param arData   - Optional AutoRecon-specific data keyed by port number
 * @returns Created engagement id and name
 */
export function createFromScan(
  db: Db,
  scan: ParsedScan,
  rawInput: string,
  arData?: {
    arFiles: Map<number, { filename: string; content: string; encoding?: "utf8" | "base64" }[]>;
    arCommands: Map<number, { label: string; template: string }[]>;
    arArtifacts?: Array<{
      kind:
        | "loot"
        | "report"
        | "screenshot"
        | "patterns"
        | "errors"
        | "commands"
        | "exploit"
        | "service-nmap-xml";
      filename: string;
      content: string;
      encoding: "utf8" | "base64";
    }>;
  },
): { id: number; name: string } {
  // better-sqlite3 transactions are synchronous — Drizzle wraps them cleanly
  return db.transaction((tx) => {
    const now = new Date().toISOString();

    // Insert root engagement row. Migration 0009 dropped target_ip /
    // target_hostname — primary host identity lives in the `hosts` table.
    const eng = tx
      .insert(engagements)
      .values({
        name: generateName(scan),
        source: scan.source,
        scanned_at: scan.scannedAt ?? null,
        os_name: scan.os?.name ?? null,
        os_accuracy: scan.os?.accuracy ?? null,
        raw_input: rawInput,
        warnings_json: JSON.stringify(scan.warnings),
        created_at: now,
        updated_at: now,
      })
      .returning({ id: engagements.id, name: engagements.name })
      .get();

    // P1-G PR 1: insert the inaugural scan_history row before any port writes
    // so newly-inserted ports can carry first_seen_scan_id / last_seen_scan_id
    // = inaugural.id. Existing engagements were backfilled by migration 0008;
    // every fresh createFromScan call writes its own scan_history row here.
    const inauguralScan = tx
      .insert(scan_history)
      .values({
        engagement_id: eng.id,
        raw_input: rawInput,
        source: scan.source,
        scanned_at: scan.scannedAt ?? null,
        created_at: now,
      })
      .returning({ id: scan_history.id })
      .get();
    const inauguralScanId = inauguralScan.id;

    // P1-F PR 2: insert one row per ParsedHost. The first host is marked
    // primary and mirrors the legacy engagements.target_ip/target_hostname/
    // os_* columns. AR data (per-port files, manual commands, screenshots)
    // is keyed by port number only and is applied to the *primary* host's
    // ports — multi-host AutoRecon zips aren't a supported import shape yet.
    const portIdByKey = new Map<string, number>();

    for (let hostIdx = 0; hostIdx < scan.hosts.length; hostIdx++) {
      const ph = scan.hosts[hostIdx];
      const isPrimary = hostIdx === 0;

      const insertedHost = tx
        .insert(hosts)
        .values({
          engagement_id: eng.id,
          ip: ph.target.ip,
          hostname: ph.target.hostname ?? null,
          state: ph.target.state ?? null,
          os_name: ph.os?.name ?? null,
          os_accuracy: ph.os?.accuracy ?? null,
          is_primary: isPrimary,
          scanned_at: scan.scannedAt ?? null,
        })
        .returning({ id: hosts.id })
        .get();

      // Per-port + per-host port_scripts.
      for (const p of ph.ports) {
        const port = tx
          .insert(ports)
          .values({
            engagement_id: eng.id,
            host_id: insertedHost.id,
            port: p.port,
            protocol: p.protocol,
            state: p.state,
            service: p.service ?? null,
            product: p.product ?? null,
            version: p.version ?? null,
            tunnel: p.tunnel ?? null,
            extrainfo: p.extrainfo ?? null,
            // P1-G PR 1: every new port belongs to the inaugural scan_history
            // row of this engagement. last_seen will advance on re-imports.
            first_seen_scan_id: inauguralScanId,
            last_seen_scan_id: inauguralScanId,
          })
          .returning({ id: ports.id })
          .get();
        // portIdByKey only tracks the primary host's ports — that's the
        // host AR data (screenshots, files, manual commands) attributes to.
        if (isPrimary) {
          portIdByKey.set(`${p.protocol}:${p.port}`, port.id);
        }

        for (const s of p.scripts) {
          tx
            .insert(port_scripts)
            .values({
              engagement_id: eng.id,
              port_id: port.id,
              script_id: s.id,
              output: s.output,
              is_host_script: false,
            })
            .run();
        }

        // Phase 5 D-12: AutoRecon per-port service files. Only applied to
        // the primary host — AR import is single-host today.
        if (isPrimary && arData?.arFiles) {
          const files = arData.arFiles.get(p.port);
          if (files) {
            for (const f of files) {
              tx
                .insert(port_scripts)
                .values({
                  engagement_id: eng.id,
                  port_id: port.id,
                  script_id: f.filename,
                  output: f.content,
                  is_host_script: false,
                  source: "autorecon",
                })
                .run();
            }
          }
        }

        // Phase 5 CD-01: AutoRecon manual commands (primary host only).
        if (isPrimary && arData?.arCommands) {
          const cmds = arData.arCommands.get(p.port);
          if (cmds) {
            for (const cmd of cmds) {
              tx
                .insert(port_commands)
                .values({
                  engagement_id: eng.id,
                  port_id: port.id,
                  source: "autorecon",
                  label: cmd.label,
                  template: cmd.template,
                })
                .run();
            }
          }
        }
      }

      // Host scripts: port_id is null, is_host_script is true (D-08). One
      // group per host — they live on the engagement but logically belong
      // to a specific host (smb-os-discovery surfaces THIS host's OS, etc.).
      // PR 4 will surface host attribution in the UI; the schema stays
      // engagement-scoped for now to avoid a migration churn.
      for (const hs of ph.hostScripts) {
        tx
          .insert(port_scripts)
          .values({
            engagement_id: eng.id,
            port_id: null,
            script_id: hs.id,
            output: hs.output,
            is_host_script: true,
          })
          .run();
      }
    }
    // v2: AutoRecon engagement-level artifacts (loot, report, screenshots,
    // patterns log, errors log, commands log, exploit hints, service-nmap XML).
    // Stored on port_scripts with port_id=null and source='autorecon-{kind}'.
    // Binary content (screenshots) is base64-encoded; encoding is implied by
    // source value (autorecon-screenshot → base64; everything else → utf8).
    //
    // v2/P0-B: gowitness/aquatone PNG screenshots (kind='screenshot') are
    // additionally surfaced into port_evidence with source='autorecon-import'
    // so the UI's per-port Evidence pane can render them next to manually
    // uploaded screenshots. The original port_scripts row is kept for
    // backward compatibility with existing exports / artifact panels.
    if (arData?.arArtifacts) {
      for (const a of arData.arArtifacts) {
        tx
          .insert(port_scripts)
          .values({
            engagement_id: eng.id,
            port_id: null,
            script_id: a.filename,
            output: a.content,
            is_host_script: false,
            source: `autorecon-${a.kind}` as
              | "autorecon-loot"
              | "autorecon-report"
              | "autorecon-screenshot"
              | "autorecon-patterns"
              | "autorecon-errors"
              | "autorecon-commands"
              | "autorecon-exploit"
              | "autorecon-service-nmap-xml",
          })
          .run();

        if (a.kind === "screenshot") {
          // Attribute the screenshot to a specific port by parsing the
          // filename: gowitness/aquatone produce names like
          // `tcp80/index_aquatone.png` or `tcp_443_https_aquatone.png`.
          // Falls back to NULL (engagement-level evidence) on no match.
          const portMatch =
            /(?:^|[/_])(tcp|udp)[_]?(\d+)(?:[/_]|\.|$)/.exec(a.filename);
          let portIdForEvidence: number | null = null;
          if (portMatch) {
            portIdForEvidence =
              portIdByKey.get(`${portMatch[1]}:${Number(portMatch[2])}`) ??
              null;
          }

          const lower = a.filename.toLowerCase();
          const mime = lower.endsWith(".png")
            ? "image/png"
            : /\.(jpe?g)$/.test(lower)
              ? "image/jpeg"
              : lower.endsWith(".gif")
                ? "image/gif"
                : lower.endsWith(".webp")
                  ? "image/webp"
                  : null;
          const dataB64 = a.content.trim();

          if (mime && dataB64.length > 0) {
            tx.insert(port_evidence)
              .values({
                engagement_id: eng.id,
                port_id: portIdForEvidence,
                filename: a.filename.split("/").pop() ?? a.filename,
                mime,
                data_b64: dataB64,
                caption: null,
                source: "autorecon-import",
                created_at: now,
              })
              .run();
          }
        }
      }
    }

    return eng;
  });
}

// ---------------------------------------------------------------------------
// getById
// ---------------------------------------------------------------------------

/**
 * Load a full engagement with all nested data (PERSIST-02).
 *
 * Assembles ports, scripts, checks, notes, and host scripts into the
 * FullEngagement composite type for detail view and export. Uses 4 separate
 * SELECT statements (one per child table) and assembles in JS — simpler and
 * fast enough for single-user tool scope.
 *
 * @param db - Drizzle database instance
 * @param id - Engagement primary key
 * @returns FullEngagement or null if not found
 */
export function getById(db: Db, id: number): FullEngagement | null {
  const eng = db
    .select()
    .from(engagements)
    .where(eq(engagements.id, id))
    .get();
  if (!eng) return null;

  const portRows = db
    .select()
    .from(ports)
    .where(eq(ports.engagement_id, id))
    .all();

  const scriptRows = db
    .select()
    .from(port_scripts)
    .where(eq(port_scripts.engagement_id, id))
    .all();

  const checkRows = db
    .select()
    .from(check_states)
    .where(eq(check_states.engagement_id, id))
    .all();

  const noteRows = db
    .select()
    .from(port_notes)
    .where(eq(port_notes.engagement_id, id))
    .all();

  // Phase 5: AutoRecon manual commands per port (CD-01).
  const commandRows = db
    .select()
    .from(port_commands)
    .where(eq(port_commands.engagement_id, id))
    .all();

  // v2: per-port evidence (screenshots / attachments).
  const evidenceRows = db
    .select()
    .from(port_evidence)
    .where(eq(port_evidence.engagement_id, id))
    .all()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // v2: findings catalog.
  const findingRows = db
    .select()
    .from(findingsTable)
    .where(eq(findingsTable.engagement_id, id))
    .all();

  // P1-F PR 1: hosts inside the engagement. Always non-empty (migration
  // 0007 backfilled, createFromScan inserts). Sort: primary first, then IP.
  const hostRows = db
    .select()
    .from(hosts)
    .where(eq(hosts.engagement_id, id))
    .all()
    .sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return a.ip.localeCompare(b.ip);
    });

  // Separate host scripts (D-08) from port-level scripts and v2 engagement-level
  // artifacts (port_id=null, is_host_script=false, source='autorecon-*').
  const hostScripts = scriptRows.filter((s) => s.is_host_script);
  const portScripts = scriptRows.filter(
    (s) => !s.is_host_script && s.port_id !== null,
  );
  const engagementArtifacts = scriptRows.filter(
    (s) => !s.is_host_script && s.port_id === null,
  );

  const portsWithDetails: PortWithDetails[] = portRows.map((p) => ({
    ...p,
    scripts: portScripts.filter((s) => s.port_id === p.id),
    checks: checkRows.filter((c) => c.port_id === p.id),
    notes: noteRows.find((n) => n.port_id === p.id) ?? null,
    commands: commandRows.filter((c) => c.port_id === p.id),
  }));

  return {
    ...eng,
    hosts: hostRows,
    ports: portsWithDetails,
    hostScripts,
    engagementArtifacts,
    evidence: evidenceRows,
    findings: findingRows,
  };
}

// ---------------------------------------------------------------------------
// listSummaries
// ---------------------------------------------------------------------------

/**
 * List all engagements with port counts for sidebar display (PERSIST-02).
 *
 * Returns lightweight summaries (no nested port data) sorted by
 * created_at descending (newest first). port_count uses a correlated
 * subquery — avoids a JOIN + GROUP BY for clarity at single-user scale.
 *
 * @param db - Drizzle database instance
 * @returns Array of EngagementSummary (may be empty)
 */
export function listSummaries(db: Db): EngagementSummary[] {
  // Migration 0009: target_ip / target_hostname were dropped. We surface the
  // primary host's IP / hostname via correlated subqueries — same shape the
  // sidebar consumed before, just sourced from `hosts.is_primary = 1`.
  return db
    .select({
      id: engagements.id,
      name: engagements.name,
      source: engagements.source,
      created_at: engagements.created_at,
      port_count: sql<number>`(SELECT COUNT(*) FROM ports WHERE ports.engagement_id = engagements.id)`,
      // P1-F PR 4: host_count surfaces in the sidebar as a "N hosts" chip
      // when > 1. Single-host engagements still render the legacy compact
      // row (no chip) — the Sidebar component branches on host_count > 1.
      host_count: sql<number>`(SELECT COUNT(*) FROM hosts WHERE hosts.engagement_id = engagements.id)`,
      primary_ip: sql<string>`(SELECT ip FROM hosts WHERE hosts.engagement_id = engagements.id AND hosts.is_primary = 1 LIMIT 1)`,
      primary_hostname: sql<string | null>`(SELECT hostname FROM hosts WHERE hosts.engagement_id = engagements.id AND hosts.is_primary = 1 LIMIT 1)`,
    })
    .from(engagements)
    .orderBy(desc(engagements.created_at))
    .all();
}

// ---------------------------------------------------------------------------
// updateTarget
// ---------------------------------------------------------------------------

/**
 * Update engagement target IP/hostname (INPUT-03, Phase 4 inline rename).
 *
 * Auto-regenerates the display name using the same D-01 convention as
 * createFromScan: "hostname (ip)" when hostname is present and differs from
 * the IP, plain IP otherwise. Also bumps updated_at so the sidebar ordering
 * / audit trail stays accurate.
 *
 * Called from the `updateEngagementTarget` server action in
 * `app/engagements/[id]/actions.ts`, which performs input validation
 * (non-empty IP) and triggers revalidatePath afterwards.
 *
 * @param db           - Drizzle database instance
 * @param engagementId - Engagement primary key
 * @param ip           - New target IP (trimmed, non-empty — validated by caller)
 * @param hostname     - New target hostname (null to clear)
 */
export function updateTarget(
  db: Db,
  engagementId: number,
  ip: string,
  hostname: string | null,
): void {
  const now = new Date().toISOString();
  const name = hostname && hostname !== ip ? `${hostname} (${ip})` : ip;
  db.transaction((tx) => {
    // Migration 0009: target_ip / target_hostname were dropped from
    // engagements. Only refresh the display name + bookkeeping fields here;
    // identity itself lives on the primary host row.
    tx.update(engagements)
      .set({
        name,
        updated_at: now,
      })
      .where(eq(engagements.id, engagementId))
      .run();

    tx.update(hosts)
      .set({ ip, hostname })
      .where(
        and(eq(hosts.engagement_id, engagementId), eq(hosts.is_primary, true)),
      )
      .run();
  });
}

// ---------------------------------------------------------------------------
// deleteEngagement
// ---------------------------------------------------------------------------

/**
 * Delete an engagement and every row owned by it.
 *
 * All child tables (ports, port_scripts, port_commands, check_states,
 * port_notes, port_evidence, findings, hosts, scan_history) declare
 * `ON DELETE CASCADE` against `engagements.id`, so a single DELETE on
 * the parent reaps the entire object graph. The FTS5 trigger
 * `engagements_search_ad` removes the search_index rows scoped to this
 * engagement in the same statement.
 *
 * Returns true when a row was actually deleted, false when no engagement
 * matched the id (caller can return 404).
 */
export function deleteEngagement(db: Db, engagementId: number): boolean {
  const result = db
    .delete(engagements)
    .where(eq(engagements.id, engagementId))
    .run();
  return (result.changes ?? 0) > 0;
}
