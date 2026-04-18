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
import { eq, sql, desc } from "drizzle-orm";
import {
  engagements,
  ports,
  port_scripts,
  port_commands,
  check_states,
  port_notes,
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
    arFiles: Map<number, { filename: string; content: string }[]>;
    arCommands: Map<number, { label: string; template: string }[]>;
  },
): { id: number; name: string } {
  // better-sqlite3 transactions are synchronous — Drizzle wraps them cleanly
  return db.transaction((tx) => {
    const now = new Date().toISOString();

    // Insert root engagement row
    const eng = tx
      .insert(engagements)
      .values({
        name: generateName(scan),
        target_ip: scan.target.ip,
        target_hostname: scan.target.hostname ?? null,
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

    // Insert each port and its port-level scripts
    for (const p of scan.ports) {
      const port = tx
        .insert(ports)
        .values({
          engagement_id: eng.id,
          port: p.port,
          protocol: p.protocol,
          state: p.state,
          service: p.service ?? null,
          product: p.product ?? null,
          version: p.version ?? null,
          tunnel: p.tunnel ?? null,
          extrainfo: p.extrainfo ?? null,
        })
        .returning({ id: ports.id })
        .get();

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

      // Phase 5 D-12: AutoRecon per-port service file outputs stored in
      // port_scripts with source='autorecon'. Keyed by port number in arFiles.
      if (arData?.arFiles) {
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

      // Phase 5 CD-01: AutoRecon manual commands stored in port_commands
      // (separate from port_scripts because these are runnable templates,
      // not script output). Keyed by port number in arCommands.
      if (arData?.arCommands) {
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
    // These represent ParsedScan.hostScripts[], stored distinctly from port scripts.
    for (const hs of scan.hostScripts) {
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

  // Separate host scripts (D-08) from port-level scripts
  const hostScripts = scriptRows.filter((s) => s.is_host_script);
  const portScripts = scriptRows.filter((s) => !s.is_host_script);

  const portsWithDetails: PortWithDetails[] = portRows.map((p) => ({
    ...p,
    scripts: portScripts.filter((s) => s.port_id === p.id),
    checks: checkRows.filter((c) => c.port_id === p.id),
    notes: noteRows.find((n) => n.port_id === p.id) ?? null,
    commands: commandRows.filter((c) => c.port_id === p.id),
  }));

  return {
    ...eng,
    ports: portsWithDetails,
    hostScripts,
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
  return db
    .select({
      id: engagements.id,
      name: engagements.name,
      target_ip: engagements.target_ip,
      target_hostname: engagements.target_hostname,
      source: engagements.source,
      created_at: engagements.created_at,
      port_count: sql<number>`(SELECT COUNT(*) FROM ports WHERE ports.engagement_id = engagements.id)`,
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
  db.update(engagements)
    .set({
      target_ip: ip,
      target_hostname: hostname,
      name,
      updated_at: now,
    })
    .where(eq(engagements.id, engagementId))
    .run();
}
