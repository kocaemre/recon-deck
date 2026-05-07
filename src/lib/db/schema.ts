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
     *
     * Migration 0009 dropped the legacy `target_ip` / `target_hostname`
     * columns. Target identity now lives in `hosts.is_primary = 1`; this
     * `name` field is the only IP/hostname-bearing surface on engagements
     * (used by the FTS5 trigger as the search body).
     */
    name: text("name").notNull(),

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

    /**
     * Migration 0011: free-form tags as a JSON array of strings
     * ("htb", "oscp", "client-acme", "internal", …). Sidebar renders
     * one chip per tag; the tag-filter strip toggles AND-filtering
     * across the engagement list. Defaults to "[]" so legacy rows
     * carry an empty array.
     */
    tags: text("tags").notNull().default("[]"),

    /**
     * Migration 0011: archived engagements drop out of the sidebar's
     * default Active view but remain searchable via the global FTS5
     * modal and reachable from the "Archived" toggle. Archive is a
     * UX-only state — cascade delete works on archived rows too.
     */
    is_archived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    /**
     * Migration 0013: soft-delete timestamp. Null when the engagement
     * is live; ISO-8601 string when the operator has sent it to the
     * recycle bin. Sidebar / FTS / list APIs filter `deleted_at IS NULL`
     * by default; /settings gains a "Recently deleted" tab to Restore
     * or permanently purge.
     */
    deleted_at: text("deleted_at"),
    /**
     * Migration 0014: free-form writeup body. Plain text by default —
     * markdown preview deferred until operators ask for it. Engagement
     * page renders a collapsible section above Findings; markdown
     * export prepends a `## Writeup` block when non-empty.
     */
    writeup: text("writeup").notNull().default(""),
    /**
     * Migration 0015: most-recent visit timestamp. Updated server-side
     * on every engagement detail render so the landing page banner can
     * surface "Resume {engagement}" with a freshness window.
     */
    last_visited_at: text("last_visited_at"),
    /**
     * Migration 0015: most-recent active port id. Lets the banner deep
     * link back to the host:port the operator was on. Plain integer —
     * we resolve to host/port lazily so a deleted port silently degrades
     * to the engagement root.
     */
    last_visited_port_id: integer("last_visited_port_id"),
    /**
     * Migration 0018: marker for the bundled `lame.htb` sample
     * engagement seeded by the post-onboarding "Try sample" button.
     * UI surfaces a `sample` chip on the engagement header and a
     * one-click "Discard sample" affordance for fast cleanup.
     */
    is_sample: integer("is_sample", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [
    index("engagements_created_at_idx").on(t.created_at),
    index("engagements_is_archived_idx").on(t.is_archived),
  ],
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

    /**
     * P1-F PR 1: FK → hosts.id with CASCADE delete. Nullable in the column
     * definition because SQLite ALTER TABLE ADD COLUMN cannot enforce
     * NOT NULL retroactively; the application invariant ("every port belongs
     * to a host") is enforced at write time inside createFromScan.
     *
     * Existing rows were backfilled to the engagement's `is_primary = 1`
     * host during migration 0007 (see SQL header).
     */
    host_id: integer("host_id").references(() => hosts.id, {
      onDelete: "cascade",
    }),

    /**
     * P1-G PR 1: scan_history.id of the scan that first observed this port.
     * Backfilled by migration 0008 to the engagement's inaugural scan row;
     * never updated after insert.
     */
    first_seen_scan_id: integer("first_seen_scan_id").references(
      () => scan_history.id,
    ),

    /**
     * P1-G PR 1: scan_history.id of the most recent re-import that still
     * saw this port open. Equals first_seen_scan_id until a re-import
     * touches it.
     */
    last_seen_scan_id: integer("last_seen_scan_id").references(
      () => scan_history.id,
    ),

    /**
     * P1-G PR 1: nullable; set to scan_history.id of the re-import that
     * first failed to observe the port (i.e. the port has gone quiet
     * since this scan). UI can surface "closed since <date>" badges.
     */
    closed_at_scan_id: integer("closed_at_scan_id").references(
      () => scan_history.id,
    ),

    /**
     * Migration 0012: starred flag. Surfaces a ★ on the heatmap tile and
     * lifts the port to the top of its host group. UI-scope only — does
     * not affect imports, exports, or finding aggregation.
     */
    starred: integer("starred", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [
    index("ports_engagement_id_idx").on(t.engagement_id),
    index("ports_host_id_idx").on(t.host_id),
  ],
);

// ---------------------------------------------------------------------------
// port_fingerprints (v2.4.0 P2 #27 — context-aware checklists, parent #14)
// ---------------------------------------------------------------------------

/**
 * Per-port fingerprint signals derived from scan inputs.
 *
 * One row per (port, source, type, value). The resolver (P4) reads these
 * to evaluate `autorecon_finding(type, value)` predicates from KB
 * conditional groups; nmap-side predicates (script_contains,
 * version_matches) read raw `port_scripts` and `ports` columns directly.
 *
 * `source` distinguishes nmap-derived rows from AutoRecon-derived ones
 * so a re-import on one side doesn't blow away the other. UNIQUE(...)
 * makes the per-port replace path idempotent.
 */
export const port_fingerprints = sqliteTable(
  "port_fingerprints",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    port_id: integer("port_id")
      .notNull()
      .references(() => ports.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["nmap", "autorecon"] }).notNull(),
    type: text("type", { enum: ["tech", "cves", "banners"] }).notNull(),
    value: text("value").notNull(),
  },
  (t) => [index("port_fingerprints_port_id_idx").on(t.port_id)],
);

export type PortFingerprint = typeof port_fingerprints.$inferSelect;

// ---------------------------------------------------------------------------
// scan_history (v2 P1-G: track every nmap re-import per engagement)
// ---------------------------------------------------------------------------

/**
 * One row per nmap import against an engagement. The first row mirrors the
 * engagement's inaugural scan (auto-inserted at createFromScan time and
 * backfilled for legacy engagements by migration 0008). Subsequent rows
 * are produced by the `/api/engagements/[id]/rescan` route.
 *
 * `ports.first_seen_scan_id`, `ports.last_seen_scan_id`,
 * `ports.closed_at_scan_id` correlate ports to their lifecycle inside this
 * history. PR 2 will surface these in a diff UI.
 */
export const scan_history = sqliteTable(
  "scan_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    engagement_id: integer("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    raw_input: text("raw_input").notNull(),
    source: text("source").notNull(),
    scanned_at: text("scanned_at"),
    created_at: text("created_at").notNull(),
  },
  (t) => [index("scan_history_engagement_id_idx").on(t.engagement_id)],
);

// ---------------------------------------------------------------------------
// hosts (v2 P1-F: multi-host engagement)
// ---------------------------------------------------------------------------

/**
 * One row per network host inside an engagement (P1-F PR 1).
 *
 * Schema is additive — `engagements.target_ip` / `target_hostname` are
 * retained until the UI is switched over in a later PR. Migration 0007
 * backfills a single `is_primary = 1` row per existing engagement that
 * mirrors the legacy columns; downstream invariants:
 *   - every engagement has at least one row here
 *   - exactly one row per engagement has `is_primary = 1`
 * Both invariants are enforced at write time in engagement-repo.ts —
 * SQLite cannot express "exactly one primary per parent" declaratively.
 *
 * `state` is the nmap host state ("up" | "down") and is currently not
 * populated by the parser; left for future use.
 */
export const hosts = sqliteTable(
  "hosts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    engagement_id: integer("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    ip: text("ip").notNull(),
    hostname: text("hostname"),
    state: text("state"),
    os_name: text("os_name"),
    os_accuracy: integer("os_accuracy"),
    is_primary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    scanned_at: text("scanned_at"),
  },
  (t) => [index("hosts_engagement_id_idx").on(t.engagement_id)],
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

    /**
     * FK → hosts.id with CASCADE delete (migration 0010).
     *
     * Populated for both port-level (mirrors ports.host_id) and
     * host-level scripts so the multi-host UI can split host scripts
     * by their owning host. Engagement-level AutoRecon artifacts
     * (port_id IS NULL, is_host_script = 0, source = 'autorecon-*')
     * keep host_id NULL — they're scoped to the engagement, not to
     * any one host.
     */
    host_id: integer("host_id").references(() => hosts.id, {
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
     *
     * v2 extension: engagement-level AutoRecon artifacts are stored with
     * port_id = null and one of the `autorecon-*` source values. The SQLite
     * column is plain TEXT — no CHECK constraint exists in migration 0001 —
     * so additive enum members do not require a new migration.
     */
    source: text("source", {
      enum: [
        "nmap",
        "autorecon",
        "autorecon-loot",
        "autorecon-report",
        "autorecon-screenshot",
        "autorecon-patterns",
        "autorecon-errors",
        "autorecon-commands",
        "autorecon-exploit",
        "autorecon-service-nmap-xml",
      ],
    })
      .notNull()
      .default("nmap"),

    /*
     * NOTE: encoding for binary content is implicit by `source` value:
     * `autorecon-screenshot` rows store `output` as base64-encoded bytes;
     * all other sources store utf-8 text. Avoids the need for a new column
     * (which would require a migration).
     */
  },
  (t) => [
    index("port_scripts_port_id_idx").on(t.port_id),
    index("port_scripts_engagement_id_idx").on(t.engagement_id),
    index("port_scripts_host_id_idx").on(t.host_id),
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
// port_evidence (v2: screenshots / binary attachments)
// ---------------------------------------------------------------------------

/**
 * Per-port (or per-engagement when port_id is null) binary evidence —
 * screenshots, proof images, attachments. Stored as base64 TEXT.
 *
 * Why TEXT (not BLOB): keeps the schema portable across SQLite drivers
 * (better-sqlite3 ↔ bun:sqlite). Per-row 4 MB cap is enforced application-side
 * before insert.
 *
 * `port_id` nullable for engagement-level evidence (proof-of-compromise
 * screenshot, dashboard, etc.).
 *
 * `source = 'manual' | 'autorecon-import'` — distinguishes user-uploaded
 * evidence from gowitness/aquatone PNGs lifted out of an AutoRecon zip.
 */
export const port_evidence = sqliteTable(
  "port_evidence",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    engagement_id: integer("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    port_id: integer("port_id").references(() => ports.id, {
      onDelete: "cascade",
    }),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    /** Base64-encoded binary content. */
    data_b64: text("data_b64").notNull(),
    caption: text("caption"),
    source: text("source", { enum: ["manual", "autorecon-import"] })
      .notNull()
      .default("manual"),
    /**
     * Migration 0016 (v2.0.0 #7): id of the source evidence row this
     * one was annotated from. Null = standalone upload. Stamped by the
     * screenshot-annotator save path; UI uses it to surface a chip
     * back-linking the annotated child to its original parent.
     */
    parent_evidence_id: integer("parent_evidence_id"),
    created_at: text("created_at").notNull(),
  },
  (t) => [
    index("port_evidence_port_id_idx").on(t.port_id),
    index("port_evidence_engagement_id_idx").on(t.engagement_id),
  ],
);

// ---------------------------------------------------------------------------
// findings (v2: pentester-discovered issue catalog)
// ---------------------------------------------------------------------------

/**
 * Findings catalog — what the pentester has discovered while working through
 * an engagement. Lives between the raw scan output (low-level facts) and the
 * eventual report (high-level narrative).
 *
 * Design:
 *   - severity is a stable string enum so reports can sort/filter consistently
 *   - port_id nullable for engagement-level findings (privesc, AD takeover)
 *   - evidence_refs is a JSON-encoded array of port_evidence.id values, kept
 *     as a TEXT column to avoid a third join table for "M findings ↔ N
 *     screenshots". Validated on read in repo.
 *   - cve free-text (comma-separated) — pentester may list multiple
 */
export const findings = sqliteTable(
  "findings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    engagement_id: integer("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    port_id: integer("port_id").references(() => ports.id, {
      onDelete: "set null",
    }),
    severity: text("severity", {
      enum: ["info", "low", "medium", "high", "critical"],
    })
      .notNull()
      .default("medium"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    cve: text("cve"),
    /** JSON array string of port_evidence.id values. Default '[]'. */
    evidence_refs: text("evidence_refs").notNull().default("[]"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    index("findings_engagement_id_idx").on(t.engagement_id),
    index("findings_port_id_idx").on(t.port_id),
  ],
);

// ---------------------------------------------------------------------------
// user_commands (v2: personal command library)
// ---------------------------------------------------------------------------

/**
 * User-defined command snippets surfaced alongside KB commands at render
 * time. Scope is filtered by service / port — see migration 0005 SQL header
 * for the matrix.
 */
export const user_commands = sqliteTable(
  "user_commands",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    service: text("service"),
    port: integer("port"),
    label: text("label").notNull(),
    template: text("template").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    index("user_commands_service_idx").on(t.service),
    index("user_commands_port_idx").on(t.port),
  ],
);

// ---------------------------------------------------------------------------
// wordlist_overrides (v2 P1-E: per-install custom wordlist paths)
// ---------------------------------------------------------------------------

/**
 * Override table for `{WORDLIST_*}` placeholder resolution. Defaults live in
 * `src/lib/kb/wordlists.ts` (DEFAULT_WORDLISTS) and target a Kali install;
 * rows here win at render time when the operator stores custom paths.
 *
 * `key` is the uppercase identifier without braces (e.g. WORDLIST_DIRB_COMMON).
 * Validated against `WORDLIST_[A-Z0-9_]+` in the repo before insert.
 */
export const wordlist_overrides = sqliteTable("wordlist_overrides", {
  key: text("key").primaryKey(),
  path: text("path").notNull(),
  updated_at: text("updated_at").notNull(),
});

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

/** Row type for the port_evidence table. */
export type PortEvidence = typeof port_evidence.$inferSelect;

/** Row type for the findings table. */
export type Finding = typeof findings.$inferSelect;

/** Row type for the user_commands table. */
export type UserCommand = typeof user_commands.$inferSelect;

/** Row type for the wordlist_overrides table. */
export type WordlistOverride = typeof wordlist_overrides.$inferSelect;

/** Row type for the hosts table. */
export type Host = typeof hosts.$inferSelect;

/** Row type for the scan_history table. */
export type ScanHistory = typeof scan_history.$inferSelect;

// ---------------------------------------------------------------------------
// app_state (v1.9.0: first-run onboarding singleton)
// ---------------------------------------------------------------------------

/**
 * Single-row k/v table for app-level state. Migration 0017 enforces
 * id = 1 via a CHECK constraint and seeds the row at install time, so
 * every read can assume the row exists. The repo's setter does an
 * UPDATE-only (no upsert) for the same reason.
 *
 * `onboarded_at = NULL` is the gate: every render path checks this and
 * redirects to /welcome until it's set. Replay onboarding clears it.
 */
export const app_state = sqliteTable("app_state", {
  id: integer("id").primaryKey(),
  onboarded_at: text("onboarded_at"),
  local_export_dir: text("local_export_dir"),
  kb_user_dir: text("kb_user_dir"),
  wordlist_base: text("wordlist_base"),
  update_check: integer("update_check", { mode: "boolean" })
    .notNull()
    .default(false),
  sidebar_collapsed: integer("sidebar_collapsed", { mode: "boolean" })
    .notNull()
    .default(false),
  /** Tri-state — "system" follows prefers-color-scheme, "dark"/"light"
   *  are explicit user overrides. Stored as TEXT; the repo narrows it
   *  to the ThemeMode union. v2.3.0 #3. */
  theme: text("theme").notNull().default("system"),
  updated_at: text("updated_at").notNull(),
});

export type AppState = typeof app_state.$inferSelect;
