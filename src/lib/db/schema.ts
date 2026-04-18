/**
 * Drizzle ORM schema — Phase 3 persistence layer.
 *
 * 5 normalized tables mirroring ParsedScan + checklist + notes:
 *   engagements  — one row per nmap scan session (ParsedScan root)
 *   ports        — one row per open/filtered port (ParsedPort)
 *   port_scripts — NSE output for both port-level and host-level scripts (ScriptOutput)
 *   check_states — per-port checklist item state, keyed by stable check_key string
 *   port_notes   — per-port freeform text notes
 *
 * Design decisions (from 03-CONTEXT.md):
 *   D-07: Normalized tables (over JSON-blob hybrid) for query flexibility.
 *   D-08: All ParsedPort fields, check_key stable strings, source column, hostScripts distinct.
 *   D-12: check_key is a stable string (KB CheckSchema.key), never a positional index.
 *   PERSIST-04: raw_input column retained on engagement for re-parse and audit.
 *   CD-05: warnings_json stores ParsedScan.warnings[] as a JSON array string.
 *
 * Foreign key cascade rules: all child rows are deleted when the parent engagement
 * is deleted (T-03-01 threat mitigation). The `foreign_keys = ON` pragma must also
 * be set at connection time — see Plan 02 client.ts.
 *
 * NOTE: No React / Next.js imports here. This file is pure Drizzle declarations.
 * server-only guard is applied in client.ts (the singleton that opens the DB),
 * not in the schema which is also consumed by the test helper.
 */

import {
  sqliteTable,
  integer,
  text,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// engagements
// ---------------------------------------------------------------------------

export const engagements = sqliteTable(
  "engagements",
  {
    /** Auto-incrementing primary key. */
    id: integer("id").primaryKey({ autoIncrement: true }),

    /**
     * Human-readable name auto-generated at insert time.
     * D-01: uses `hostname (ip)` when hostname present, falls back to `ip`.
     * D-02: mutable — Phase 4 allows inline sidebar rename.
     */
    name: text("name").notNull(),

    /** ParsedScan.target.ip */
    target_ip: text("target_ip").notNull(),

    /** ParsedScan.target.hostname — null when nmap returns no PTR/rDNS. */
    target_hostname: text("target_hostname"),

    /**
     * ParsedScan.source — "nmap-text" | "nmap-xml" | "autorecon".
     * "autorecon" is reserved for Phase 5; Phase 3 only stores text/xml.
     */
    source: text("source", { enum: ["nmap-text", "nmap-xml", "autorecon"] }).notNull(),

    /** ParsedScan.scannedAt — ISO-8601 from nmap XML <nmaprun start=...>. Null for text output. */
    scanned_at: text("scanned_at"),

    /** ParsedScan.os?.name */
    os_name: text("os_name"),

    /** ParsedScan.os?.accuracy — integer 0-100. */
    os_accuracy: integer("os_accuracy"),

    /**
     * The raw nmap input string as pasted/uploaded by the user (PERSIST-04).
     * Stored to allow re-parse on KB updates and for audit / export purposes.
     */
    raw_input: text("raw_input").notNull(),

    /**
     * ParsedScan.warnings serialized as a JSON array (e.g. '["skipped sctp port"]').
     * CD-05: retained so Phase 4 UI can display parse warnings to the user.
     */
    warnings_json: text("warnings_json").notNull().default("[]"),

    /** ISO-8601 timestamp set at insert — never updated. */
    created_at: text("created_at").notNull(),

    /** ISO-8601 timestamp updated on any mutation (rename, check toggle, notes save). */
    updated_at: text("updated_at").notNull(),
  },
  (t) => [index("engagements_created_at_idx").on(t.created_at)],
);

// ---------------------------------------------------------------------------
// ports
// ---------------------------------------------------------------------------

export const ports = sqliteTable(
  "ports",
  {
    /** Auto-incrementing primary key. */
    id: integer("id").primaryKey({ autoIncrement: true }),

    /** FK → engagements.id with CASCADE delete. */
    engagement_id: integer("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),

    /** ParsedPort.port — 1-65535. */
    port: integer("port").notNull(),

    /** ParsedPort.protocol */
    protocol: text("protocol", { enum: ["tcp", "udp"] }).notNull(),

    /** ParsedPort.state */
    state: text("state", { enum: ["open", "filtered"] }).notNull(),

    /** ParsedPort.service — null when <service> element absent in nmap output. */
    service: text("service"),

    /** ParsedPort.product */
    product: text("product"),

    /** ParsedPort.version */
    version: text("version"),

    /** ParsedPort.tunnel — "ssl" when nmap reports tunnel="ssl" (HTTPS on nonstandard port). */
    tunnel: text("tunnel", { enum: ["ssl"] }),

    /** ParsedPort.extrainfo */
    extrainfo: text("extrainfo"),
  },
  (t) => [index("ports_engagement_id_idx").on(t.engagement_id)],
);

// ---------------------------------------------------------------------------
// port_scripts
// ---------------------------------------------------------------------------

/**
 * Stores both port-level NSE scripts and host-level scripts (D-08).
 * Host scripts have port_id = NULL and is_host_script = true.
 */
export const port_scripts = sqliteTable(
  "port_scripts",
  {
    /** Auto-incrementing primary key. */
    id: integer("id").primaryKey({ autoIncrement: true }),

    /** FK → engagements.id with CASCADE delete. */
    engagement_id: integer("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),

    /**
     * FK → ports.id with CASCADE delete.
     * NULL for host-level scripts (is_host_script = true).
     */
    port_id: integer("port_id").references(() => ports.id, {
      onDelete: "cascade",
    }),

    /** ScriptOutput.id — NSE script name, e.g. "http-title", "smb-os-discovery". */
    script_id: text("script_id").notNull(),

    /** ScriptOutput.output — raw NSE output text. */
    output: text("output").notNull(),

    /**
     * Distinguishes ParsedScan.hostScripts[] from ParsedPort.scripts[].
     * D-08: hostScripts stored distinctly — this flag enables the query split.
     */
    is_host_script: integer("is_host_script", { mode: "boolean" })
      .notNull()
      .default(false),

    /**
     * D-12 (Phase 5): Distinguishes NSE script outputs ('nmap') from AutoRecon
     * per-port service file outputs ('autorecon'). Defaults to 'nmap' so
     * existing rows retain correct semantics after migration (T-05-01).
     */
    source: text("source", { enum: ["nmap", "autorecon"] })
      .notNull()
      .default("nmap"),
  },
  (t) => [
    index("port_scripts_port_id_idx").on(t.port_id),
    index("port_scripts_engagement_id_idx").on(t.engagement_id),
  ],
);

// ---------------------------------------------------------------------------
// check_states
// ---------------------------------------------------------------------------

/**
 * Persists per-port checklist item state.
 *
 * D-12: check_key is the KB CheckSchema.key string (e.g. "smb-null-session"),
 * never a positional index. KB edits do not corrupt historical check state.
 *
 * Composite PK on (engagement_id, port_id, check_key) enforces one row per
 * engagement+port+check combination.
 */
export const check_states = sqliteTable(
  "check_states",
  {
    /** FK → engagements.id with CASCADE delete. */
    engagement_id: integer("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),

    /** FK → ports.id with CASCADE delete. */
    port_id: integer("port_id")
      .notNull()
      .references(() => ports.id, { onDelete: "cascade" }),

    /**
     * Stable string identifier for the check, sourced from KB CheckSchema.key.
     * Examples: "smb-null-session", "http-dir-listing", "ftp-anon-login".
     */
    check_key: text("check_key").notNull(),

    /** Whether the user has ticked this check item. */
    checked: integer("checked", { mode: "boolean" }).notNull().default(false),

    /** ISO-8601 timestamp of last toggle. */
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.engagement_id, t.port_id, t.check_key] }),
  ],
);

// ---------------------------------------------------------------------------
// port_notes
// ---------------------------------------------------------------------------

/**
 * Per-port freeform text notes.
 *
 * Composite PK on (engagement_id, port_id) — exactly one notes row per port
 * per engagement. Row is upserted on save; body defaults to "" (empty string).
 */
export const port_notes = sqliteTable(
  "port_notes",
  {
    /** FK → engagements.id with CASCADE delete. */
    engagement_id: integer("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),

    /** FK → ports.id with CASCADE delete. */
    port_id: integer("port_id")
      .notNull()
      .references(() => ports.id, { onDelete: "cascade" }),

    /** The notes text — empty string when untouched. */
    body: text("body").notNull().default(""),

    /** ISO-8601 timestamp of last save. */
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.engagement_id, t.port_id] }),
  ],
);

// ---------------------------------------------------------------------------
// port_commands
// ---------------------------------------------------------------------------

/**
 * Stores AutoRecon manual commands parsed from _manual_commands.txt (Phase 5).
 *
 * KB commands are NOT stored here — they are server-rendered from YAML at read
 * time. Only AutoRecon commands are persisted because they are per-engagement,
 * per-target artifacts (not global KB content).
 *
 * CD-01 resolution: separate table rather than overloading port_scripts (which
 * semantically stores script output, not runnable commands).
 * D-06: Display separately from KB commands in the port card UI.
 * D-08: template contains {IP}/{PORT}/{HOST} placeholders, interpolated at render.
 * T-05-02: CASCADE delete on both FKs ensures cleanup, no orphans.
 */
export const port_commands = sqliteTable(
  "port_commands",
  {
    /** Auto-incrementing primary key. */
    id: integer("id").primaryKey({ autoIncrement: true }),

    /** FK → engagements.id with CASCADE delete. */
    engagement_id: integer("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),

    /** FK → ports.id with CASCADE delete. */
    port_id: integer("port_id")
      .notNull()
      .references(() => ports.id, { onDelete: "cascade" }),

    /** Source of the command — currently only 'autorecon'. */
    source: text("source", { enum: ["autorecon"] }).notNull(),

    /** Human-readable label (e.g. "nikto", "gobuster"). */
    label: text("label").notNull(),

    /** Command template with {IP}/{PORT}/{HOST} placeholders. */
    template: text("template").notNull(),
  },
  (t) => [
    index("port_commands_port_id_idx").on(t.port_id),
    index("port_commands_engagement_id_idx").on(t.engagement_id),
  ],
);

// ---------------------------------------------------------------------------
// Drizzle-inferred select types
// ---------------------------------------------------------------------------

/** Row type for the engagements table. */
export type Engagement = typeof engagements.$inferSelect;

/** Row type for the ports table. */
export type Port = typeof ports.$inferSelect;

/** Row type for the port_scripts table. */
export type PortScript = typeof port_scripts.$inferSelect;

/** Row type for the check_states table. */
export type CheckState = typeof check_states.$inferSelect;

/** Row type for the port_notes table. */
export type PortNote = typeof port_notes.$inferSelect;

/** Row type for the port_commands table. */
export type PortCommand = typeof port_commands.$inferSelect;
