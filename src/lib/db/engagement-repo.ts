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
              host_id: insertedHost.id,
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
                  host_id: insertedHost.id,
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

      // Host scripts: port_id is null, is_host_script is true (D-08).
      // Migration 0010 added host_id so multi-host engagements can split
      // host scripts by their owning host (smb-os-discovery on DC01 vs
      // smb-os-discovery on ws01). The host_id is the only attribution
      // primitive — port_id stays NULL because host scripts run against
      // the host as a whole, not a specific port.
      for (const hs of ph.hostScripts) {
        tx
          .insert(port_scripts)
          .values({
            engagement_id: eng.id,
            port_id: null,
            host_id: insertedHost.id,
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
  // Migration 0013: soft-deleted engagements behave like missing rows so
  // navigating to a stale URL hits the same 404 branch every other
  // "engagement not found" code path uses. Restore from /settings to
  // surface them again.
  if (eng.deleted_at != null) return null;

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

  // v2: per-port evidence (screenshots / attachments). The base64 payload
  // (`data_b64`, up to 4 MB per row) is intentionally OMITTED — it ships
  // separately via `GET /api/engagements/[id]/evidence/[evidenceId]/raw`
  // so the engagement page render isn't a multi-megabyte HTML response.
  const evidenceRows = db
    .select({
      id: port_evidence.id,
      engagement_id: port_evidence.engagement_id,
      port_id: port_evidence.port_id,
      filename: port_evidence.filename,
      mime: port_evidence.mime,
      caption: port_evidence.caption,
      source: port_evidence.source,
      created_at: port_evidence.created_at,
      parent_evidence_id: port_evidence.parent_evidence_id,
      // Stand-in for the full-shape `PortEvidence` consumer contract.
      // Empty string keeps the type narrow without adding a separate
      // "metadata only" alias type. Consumers that actually need the
      // bytes hit the streaming route.
      data_b64: sql<string>`''`,
    })
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
  //
  // Also pre-aggregates `done_check_count` so the layout doesn't have to
  // pull every row from `check_states` and group in JS. KB-driven `total`
  // can't be SQL-derived (it requires KB matching per port at read time);
  // see app/layout.tsx for the in-memory totals loop.
  const rows = db
    .select({
      id: engagements.id,
      name: engagements.name,
      source: engagements.source,
      created_at: engagements.created_at,
      tags_raw: engagements.tags,
      is_archived: engagements.is_archived,
      port_count: sql<number>`(SELECT COUNT(*) FROM ports WHERE ports.engagement_id = engagements.id)`,
      // P1-F PR 4: host_count surfaces in the sidebar as a "N hosts" chip
      // when > 1. Single-host engagements still render the legacy compact
      // row (no chip) — the Sidebar component branches on host_count > 1.
      host_count: sql<number>`(SELECT COUNT(*) FROM hosts WHERE hosts.engagement_id = engagements.id)`,
      primary_ip: sql<string>`(SELECT ip FROM hosts WHERE hosts.engagement_id = engagements.id AND hosts.is_primary = 1 LIMIT 1)`,
      primary_hostname: sql<string | null>`(SELECT hostname FROM hosts WHERE hosts.engagement_id = engagements.id AND hosts.is_primary = 1 LIMIT 1)`,
      done_check_count: sql<number>`(SELECT COUNT(*) FROM check_states WHERE check_states.engagement_id = engagements.id AND check_states.checked = 1)`,
      // v1.2.0: aggregate findings counts so the sidebar bulk-filter chip
      // strip ("Has findings", "Risk ≥ high") can render without a JOIN
      // at the React layer. Two correlated subqueries — same N+1 shape as
      // the rest; under 200 engagements this is well within budget.
      findings_count: sql<number>`(SELECT COUNT(*) FROM findings WHERE findings.engagement_id = engagements.id)`,
      high_findings_count: sql<number>`(SELECT COUNT(*) FROM findings WHERE findings.engagement_id = engagements.id AND findings.severity IN ('high', 'critical'))`,
    })
    .from(engagements)
    // Migration 0013: hide soft-deleted rows. Recycle bin lives in
    // /settings via listDeletedSummaries.
    .where(sql`${engagements.deleted_at} IS NULL`)
    .orderBy(desc(engagements.created_at))
    .all();

  // Migration 0011: parse the tags JSON column into a real array. Bad
  // payloads fall through to []; the repo is the contract surface, so
  // consumers (Sidebar, palette filter logic) only ever see string[].
  return rows.map((r) => {
    const { tags_raw, ...rest } = r;
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(tags_raw);
      if (Array.isArray(parsed)) {
        tags = parsed.filter((t): t is string => typeof t === "string");
      }
    } catch {
      // ignore — empty array
    }
    return { ...rest, tags };
  });
}

// ---------------------------------------------------------------------------
// setEngagementTags / archiveEngagement (v1.2.0)
// ---------------------------------------------------------------------------

/**
 * Replace the engagement's tag set. Caller normalizes (trim, dedup,
 * lowercase) before passing — the repo trusts the array shape and
 * just JSON-encodes it. Returns true when the row was updated.
 */
export function setEngagementTags(
  db: Db,
  engagementId: number,
  tags: string[],
): boolean {
  const now = new Date().toISOString();
  const result = db
    .update(engagements)
    .set({ tags: JSON.stringify(tags), updated_at: now })
    .where(eq(engagements.id, engagementId))
    .run();
  return (result.changes ?? 0) > 0;
}

/**
 * v1.4.0 #15: stamp the engagement as just-visited. Called server-side
 * on every engagement detail render. Optional `portId` records the
 * active deep-link target so the banner can resume to host:port.
 *
 * Bypasses `updated_at` deliberately — visit-tracking is not a meaningful
 * mutation and shouldn't disturb the sidebar's recency ordering.
 */
export function touchEngagementVisit(
  db: Db,
  engagementId: number,
  portId: number | null,
): void {
  const now = new Date().toISOString();
  db
    .update(engagements)
    .set({ last_visited_at: now, last_visited_port_id: portId })
    .where(eq(engagements.id, engagementId))
    .run();
}

export interface ResumeCandidate {
  id: number;
  name: string;
  primary_ip: string;
  last_visited_at: string;
  last_visited_port_id: number | null;
  /** Resolved port label "<port>/<proto>" if the row is still alive. */
  port_label: string | null;
  host_label: string | null;
}

/**
 * v1.4.0 #15: most-recently-visited engagement, capped at 7 days.
 * Returns null when nobody's visited an engagement recently — the
 * landing banner just doesn't render in that case.
 *
 * Soft-deleted engagements are excluded so a deleted-and-restored row
 * doesn't ghost-resurface as a banner before the operator clicks
 * Restore.
 */
export function getResumeCandidate(db: Db): ResumeCandidate | null {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString();
  const row = db
    .select({
      id: engagements.id,
      name: engagements.name,
      last_visited_at: engagements.last_visited_at,
      last_visited_port_id: engagements.last_visited_port_id,
      primary_ip: sql<string>`(SELECT ip FROM hosts WHERE hosts.engagement_id = engagements.id AND hosts.is_primary = 1 LIMIT 1)`,
    })
    .from(engagements)
    .where(
      sql`${engagements.deleted_at} IS NULL AND ${engagements.last_visited_at} IS NOT NULL AND ${engagements.last_visited_at} >= ${sevenDaysAgo}`,
    )
    .orderBy(desc(engagements.last_visited_at))
    .limit(1)
    .get();

  if (!row || row.last_visited_at == null) return null;

  let port_label: string | null = null;
  let host_label: string | null = null;
  if (row.last_visited_port_id != null) {
    const port = db
      .select({
        port: ports.port,
        protocol: ports.protocol,
        host_id: ports.host_id,
      })
      .from(ports)
      .where(eq(ports.id, row.last_visited_port_id))
      .get();
    if (port) {
      port_label = `${port.port}/${port.protocol}`;
      if (port.host_id != null) {
        const host = db
          .select({ ip: hosts.ip, hostname: hosts.hostname })
          .from(hosts)
          .where(eq(hosts.id, port.host_id))
          .get();
        if (host) host_label = host.hostname ?? host.ip;
      }
    }
  }

  return {
    id: row.id,
    name: row.name,
    primary_ip: row.primary_ip,
    last_visited_at: row.last_visited_at,
    last_visited_port_id: row.last_visited_port_id,
    port_label,
    host_label,
  };
}

/**
 * Replace the engagement's writeup body (v1.3.0 #9). Empty string is a
 * valid value (clears the section). Returns true when the row was
 * updated.
 */
export function setEngagementWriteup(
  db: Db,
  engagementId: number,
  writeup: string,
): boolean {
  const now = new Date().toISOString();
  const result = db
    .update(engagements)
    .set({ writeup, updated_at: now })
    .where(eq(engagements.id, engagementId))
    .run();
  return (result.changes ?? 0) > 0;
}

/**
 * Flip the engagement's archive state. Archive is UI-scoped — DELETE
 * still cascades, FTS index still includes the row. Sidebar's default
 * Active view filters by `is_archived = false`. Returns true when the
 * row was updated.
 */
export function archiveEngagement(
  db: Db,
  engagementId: number,
  archived: boolean,
): boolean {
  const now = new Date().toISOString();
  const result = db
    .update(engagements)
    .set({ is_archived: archived, updated_at: now })
    .where(eq(engagements.id, engagementId))
    .run();
  return (result.changes ?? 0) > 0;
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
// renameEngagement
// ---------------------------------------------------------------------------

/**
 * Rename an engagement — overrides the auto-generated `hostname (ip)` label
 * with a free-form name chosen by the operator. Distinct from `updateTarget`,
 * which regenerates the name from IP/hostname; rename touches only the
 * display label and never mutates host identity.
 *
 * The caller is expected to validate that `name` is non-empty after trimming
 * and within a reasonable length cap (route-layer concern). updated_at is
 * bumped so the sidebar's recency ordering reflects the rename.
 *
 * Returns true when the row was found and updated, false when the engagement
 * id matched no row (caller can map to 404).
 */
export function renameEngagement(
  db: Db,
  engagementId: number,
  name: string,
): boolean {
  const now = new Date().toISOString();
  const result = db
    .update(engagements)
    .set({ name, updated_at: now })
    .where(eq(engagements.id, engagementId))
    .run();
  return (result.changes ?? 0) > 0;
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

// ---------------------------------------------------------------------------
// softDeleteEngagement / restoreEngagement / listDeletedSummaries (v1.3.0 #6)
// ---------------------------------------------------------------------------

/**
 * Send an engagement to the recycle bin. Sets `deleted_at = now()` so
 * the row drops out of the sidebar and FTS surface but every child row
 * stays intact — Restore brings the engagement back without loss.
 *
 * Idempotent: calling on an already-deleted row is a no-op (returns
 * true so the caller can swallow double-clicks safely).
 */
export function softDeleteEngagement(
  db: Db,
  engagementId: number,
): boolean {
  const now = new Date().toISOString();
  const result = db
    .update(engagements)
    .set({ deleted_at: now, updated_at: now })
    .where(eq(engagements.id, engagementId))
    .run();
  return (result.changes ?? 0) > 0;
}

/**
 * Restore a soft-deleted engagement. Clears `deleted_at` so the row
 * resurfaces in the sidebar and FTS. Returns false when no row matched
 * (deleted-from-recycle-bin race or unknown id).
 */
export function restoreEngagement(db: Db, engagementId: number): boolean {
  const now = new Date().toISOString();
  const result = db
    .update(engagements)
    .set({ deleted_at: null, updated_at: now })
    .where(eq(engagements.id, engagementId))
    .run();
  return (result.changes ?? 0) > 0;
}

/**
 * Soft-deleted engagements for the /settings "Recently deleted" tab.
 * Mirrors `listSummaries` shape minus the live filter so the tab can
 * render the same row component, but ordered by `deleted_at DESC`
 * so the most-recent send-to-bin shows first.
 */
export function listDeletedSummaries(db: Db): EngagementSummary[] {
  const rows = db
    .select({
      id: engagements.id,
      name: engagements.name,
      source: engagements.source,
      created_at: engagements.created_at,
      tags_raw: engagements.tags,
      is_archived: engagements.is_archived,
      port_count: sql<number>`(SELECT COUNT(*) FROM ports WHERE ports.engagement_id = engagements.id)`,
      host_count: sql<number>`(SELECT COUNT(*) FROM hosts WHERE hosts.engagement_id = engagements.id)`,
      primary_ip: sql<string>`(SELECT ip FROM hosts WHERE hosts.engagement_id = engagements.id AND hosts.is_primary = 1 LIMIT 1)`,
      primary_hostname: sql<string | null>`(SELECT hostname FROM hosts WHERE hosts.engagement_id = engagements.id AND hosts.is_primary = 1 LIMIT 1)`,
      done_check_count: sql<number>`(SELECT COUNT(*) FROM check_states WHERE check_states.engagement_id = engagements.id AND check_states.checked = 1)`,
      findings_count: sql<number>`(SELECT COUNT(*) FROM findings WHERE findings.engagement_id = engagements.id)`,
      high_findings_count: sql<number>`(SELECT COUNT(*) FROM findings WHERE findings.engagement_id = engagements.id AND findings.severity IN ('high', 'critical'))`,
      deleted_at_raw: engagements.deleted_at,
    })
    .from(engagements)
    .where(sql`${engagements.deleted_at} IS NOT NULL`)
    .orderBy(desc(engagements.deleted_at))
    .all();

  return rows.map((r) => {
    const { tags_raw, deleted_at_raw, ...rest } = r;
    void deleted_at_raw;
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(tags_raw);
      if (Array.isArray(parsed)) {
        tags = parsed.filter((t): t is string => typeof t === "string");
      }
    } catch {
      // ignore — empty array
    }
    return { ...rest, tags };
  });
}

// ---------------------------------------------------------------------------
// cloneEngagement
// ---------------------------------------------------------------------------

/**
 * Deep-copy an engagement and every child row to a brand-new id (P2).
 *
 * Use case: keep an engagement as a "template" snapshot before applying
 * a re-import or destructive cleanup, or fork off a writeup variant for
 * a teammate. The copy is independent — editing one never affects the
 * other; CASCADE delete on the source no longer reaches the clone.
 *
 * Wraps the entire copy in a single transaction so a partial copy can't
 * leave behind orphan rows. Each child table is read once into memory
 * (engagement-scoped row counts are small enough that a single-pass copy
 * is simpler and safer than a streamed approach), then re-inserted with
 * fresh primary keys via the standard `INSERT ... RETURNING id` pattern.
 *
 * Foreign keys are remapped through six per-table id maps:
 *   - scanIdMap     (scan_history.id → new scan_history.id)
 *   - hostIdMap     (hosts.id → new hosts.id)
 *   - portIdMap     (ports.id → new ports.id)
 *   - evidenceIdMap (port_evidence.id → new port_evidence.id)
 *
 * `findings.evidence_refs` is a JSON array of port_evidence.id values;
 * each element is rewritten through evidenceIdMap. Malformed JSON or
 * missing ids fall through to an empty array — the source data was
 * already invalid before clone touched it.
 *
 * @returns The new engagement id, or null when the source id was unknown.
 */
export function cloneEngagement(
  db: Db,
  sourceId: number,
  newName?: string,
): number | null {
  const eng = db
    .select()
    .from(engagements)
    .where(eq(engagements.id, sourceId))
    .get();
  if (!eng) return null;

  const now = new Date().toISOString();
  const cloneName = (newName ?? `${eng.name} (copy)`).trim() || `${eng.name} (copy)`;

  return db.transaction((tx) => {
    // 1. New engagement row. raw_input + warnings carry over so an
    //    operator can re-parse the clone identically; created_at /
    //    updated_at refresh so the sidebar's recency ordering treats
    //    it as a freshly-made engagement.
    const newEng = tx
      .insert(engagements)
      .values({
        name: cloneName,
        source: eng.source,
        scanned_at: eng.scanned_at,
        os_name: eng.os_name,
        os_accuracy: eng.os_accuracy,
        raw_input: eng.raw_input,
        warnings_json: eng.warnings_json,
        created_at: now,
        updated_at: now,
      })
      .returning({ id: engagements.id })
      .get();

    // 2. scan_history → build the id map first so ports can remap their
    //    first_seen_scan_id / last_seen_scan_id / closed_at_scan_id.
    const scanIdMap = new Map<number, number>();
    const scanRows = tx
      .select()
      .from(scan_history)
      .where(eq(scan_history.engagement_id, sourceId))
      .all();
    for (const s of scanRows) {
      const inserted = tx
        .insert(scan_history)
        .values({
          engagement_id: newEng.id,
          raw_input: s.raw_input,
          source: s.source,
          scanned_at: s.scanned_at,
          created_at: s.created_at,
        })
        .returning({ id: scan_history.id })
        .get();
      scanIdMap.set(s.id, inserted.id);
    }

    // 3. hosts → host id map drives ports.host_id and port_scripts.host_id.
    const hostIdMap = new Map<number, number>();
    const hostRows = tx
      .select()
      .from(hosts)
      .where(eq(hosts.engagement_id, sourceId))
      .all();
    for (const h of hostRows) {
      const inserted = tx
        .insert(hosts)
        .values({
          engagement_id: newEng.id,
          ip: h.ip,
          hostname: h.hostname,
          state: h.state,
          os_name: h.os_name,
          os_accuracy: h.os_accuracy,
          is_primary: h.is_primary,
          scanned_at: h.scanned_at,
        })
        .returning({ id: hosts.id })
        .get();
      hostIdMap.set(h.id, inserted.id);
    }

    // 4. ports — remap host_id and the three scan_id lifecycle pointers.
    const portIdMap = new Map<number, number>();
    const portRows = tx
      .select()
      .from(ports)
      .where(eq(ports.engagement_id, sourceId))
      .all();
    for (const p of portRows) {
      const inserted = tx
        .insert(ports)
        .values({
          engagement_id: newEng.id,
          host_id: p.host_id != null ? hostIdMap.get(p.host_id) ?? null : null,
          port: p.port,
          protocol: p.protocol,
          state: p.state,
          service: p.service,
          product: p.product,
          version: p.version,
          tunnel: p.tunnel,
          extrainfo: p.extrainfo,
          first_seen_scan_id:
            p.first_seen_scan_id != null
              ? scanIdMap.get(p.first_seen_scan_id) ?? null
              : null,
          last_seen_scan_id:
            p.last_seen_scan_id != null
              ? scanIdMap.get(p.last_seen_scan_id) ?? null
              : null,
          closed_at_scan_id:
            p.closed_at_scan_id != null
              ? scanIdMap.get(p.closed_at_scan_id) ?? null
              : null,
        })
        .returning({ id: ports.id })
        .get();
      portIdMap.set(p.id, inserted.id);
    }

    // 5. port_scripts — engagement-level rows (port_id NULL,
    //    is_host_script=0, autorecon-* source) keep host_id NULL.
    const scriptRows = tx
      .select()
      .from(port_scripts)
      .where(eq(port_scripts.engagement_id, sourceId))
      .all();
    for (const s of scriptRows) {
      tx.insert(port_scripts)
        .values({
          engagement_id: newEng.id,
          port_id: s.port_id != null ? portIdMap.get(s.port_id) ?? null : null,
          host_id: s.host_id != null ? hostIdMap.get(s.host_id) ?? null : null,
          script_id: s.script_id,
          output: s.output,
          is_host_script: s.is_host_script,
          source: s.source,
        })
        .run();
    }

    // 6. check_states — composite primary key of (engagement_id, port_id,
    //    check_key) means a missing portIdMap entry would silently drop the
    //    check. Defensive skip rather than throw.
    const checkRows = tx
      .select()
      .from(check_states)
      .where(eq(check_states.engagement_id, sourceId))
      .all();
    for (const c of checkRows) {
      const newPortId = portIdMap.get(c.port_id);
      if (newPortId == null) continue;
      tx.insert(check_states)
        .values({
          engagement_id: newEng.id,
          port_id: newPortId,
          check_key: c.check_key,
          checked: c.checked,
          updated_at: c.updated_at,
        })
        .run();
    }

    // 7. port_notes
    const noteRows = tx
      .select()
      .from(port_notes)
      .where(eq(port_notes.engagement_id, sourceId))
      .all();
    for (const n of noteRows) {
      const newPortId = portIdMap.get(n.port_id);
      if (newPortId == null) continue;
      tx.insert(port_notes)
        .values({
          engagement_id: newEng.id,
          port_id: newPortId,
          body: n.body,
          updated_at: n.updated_at,
        })
        .run();
    }

    // 8. port_commands — port_id is NOT NULL on this table, so a missing
    //    portIdMap entry would be an integrity bug; skip rather than
    //    insert with a stale id.
    const commandRows = tx
      .select()
      .from(port_commands)
      .where(eq(port_commands.engagement_id, sourceId))
      .all();
    for (const c of commandRows) {
      const newPortId = portIdMap.get(c.port_id);
      if (newPortId == null) continue;
      tx.insert(port_commands)
        .values({
          engagement_id: newEng.id,
          port_id: newPortId,
          source: c.source,
          label: c.label,
          template: c.template,
        })
        .run();
    }

    // 9. port_evidence — build evidenceIdMap so step 10 can remap
    //    findings.evidence_refs JSON.
    const evidenceIdMap = new Map<number, number>();
    const evidenceRows = tx
      .select()
      .from(port_evidence)
      .where(eq(port_evidence.engagement_id, sourceId))
      .all();
    for (const e of evidenceRows) {
      const inserted = tx
        .insert(port_evidence)
        .values({
          engagement_id: newEng.id,
          port_id:
            e.port_id != null ? portIdMap.get(e.port_id) ?? null : null,
          filename: e.filename,
          mime: e.mime,
          data_b64: e.data_b64,
          caption: e.caption,
          source: e.source,
          created_at: e.created_at,
        })
        .returning({ id: port_evidence.id })
        .get();
      evidenceIdMap.set(e.id, inserted.id);
    }

    // 10. findings — remap evidence_refs (JSON array of evidence ids).
    const findingRows = tx
      .select()
      .from(findingsTable)
      .where(eq(findingsTable.engagement_id, sourceId))
      .all();
    for (const f of findingRows) {
      let remappedRefs = "[]";
      try {
        const parsed = JSON.parse(f.evidence_refs);
        if (Array.isArray(parsed)) {
          const remapped = parsed
            .filter((id): id is number => typeof id === "number")
            .map((id) => evidenceIdMap.get(id))
            .filter((id): id is number => typeof id === "number");
          remappedRefs = JSON.stringify(remapped);
        }
      } catch {
        // Malformed source data — best-effort fall through to []
        remappedRefs = "[]";
      }
      tx.insert(findingsTable)
        .values({
          engagement_id: newEng.id,
          port_id:
            f.port_id != null ? portIdMap.get(f.port_id) ?? null : null,
          severity: f.severity,
          title: f.title,
          description: f.description,
          cve: f.cve,
          evidence_refs: remappedRefs,
          created_at: f.created_at,
          updated_at: f.updated_at,
        })
        .run();
    }

    return newEng.id;
  });
}
