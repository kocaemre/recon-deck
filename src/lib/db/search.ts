import "server-only";

/**
 * Cross-engagement full-text search via SQLite FTS5.
 *
 * Backed by the `search_index` virtual table created in migration 0002.
 * Triggers keep it in sync with engagements/ports/port_scripts/port_notes
 * — callers do NOT touch search_index directly.
 *
 * Query syntax: standard FTS5 MATCH grammar (phrases in quotes, AND/OR/NEAR,
 * column filters). User input is wrapped in double-quotes when it contains
 * special FTS5 operators so a stray `"` or `*` from a paste doesn't blow up
 * the query parser.
 */

import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export type SearchKind =
  | "engagement"
  | "port"
  | "script"
  | "note"
  | "finding";

export interface SearchHit {
  engagementId: number;
  engagementName: string;
  kind: SearchKind;
  refId: number;
  title: string;
  /** snippet with <mark> highlights around the match. */
  snippet: string;
  rank: number;
  /**
   * P1-F PR 4 follow-up: host label for port/script/finding hits in
   * multi-host engagements. `hostname` if non-null, otherwise the IP.
   * `null` when the hit isn't bound to a port (engagement/note kinds, or
   * a finding/script with port_id=null).
   */
  hostLabel: string | null;
}

/**
 * Quote a user query for safe FTS5 MATCH.
 *
 * FTS5 treats `"`, `*`, `^`, `(`, `)`, AND, OR, NOT, NEAR as operators. The
 * easiest robust approach is to extract word tokens, escape any embedded
 * double-quotes, and re-emit each as a quoted prefix term. So `smb null` →
 * `"smb"* "null"*` which behaves like a forgiving prefix-match across both
 * tokens.
 */
function buildFtsQuery(raw: string): string {
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return "";
  return tokens
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
    .join(" ");
}

export function searchEngagements(
  db: BetterSQLite3Database<Record<string, unknown>>,
  query: string,
  limit = 30,
): SearchHit[] {
  const fts = buildFtsQuery(query);
  if (!fts) return [];

  // Join search_index back to engagements to surface engagement name in hits.
  // `bm25(search_index)` returns lower-is-better — we sort ASC and surface as
  // `rank` (negated for downstream "higher is better" UX if needed).
  //
  // P1-F PR 4 follow-up: `host_label` correlates each port-bound hit back
  // to its host so the global search modal can render "DC01" / "ws01.htb"
  // alongside the snippet. Engagement-/note-kind hits return NULL; finding
  // and script hits with no port (port_id=null) likewise return NULL via
  // the LEFT JOIN chain.
  const rows = db.all(
    sql`
      SELECT
        si.engagement_id  AS engagement_id,
        e.name            AS engagement_name,
        si.kind           AS kind,
        si.ref_id         AS ref_id,
        si.title          AS title,
        snippet(search_index, 4, '<mark>', '</mark>', '…', 16) AS snippet,
        bm25(search_index) AS rank,
        CASE
          WHEN si.kind = 'port' THEN (
            SELECT COALESCE(h.hostname, h.ip)
            FROM ports p
            LEFT JOIN hosts h ON h.id = p.host_id
            WHERE p.id = si.ref_id
          )
          WHEN si.kind = 'script' THEN (
            SELECT COALESCE(h.hostname, h.ip)
            FROM port_scripts ps
            LEFT JOIN ports p ON p.id = ps.port_id
            LEFT JOIN hosts h ON h.id = p.host_id
            WHERE ps.id = si.ref_id
          )
          WHEN si.kind = 'finding' THEN (
            SELECT COALESCE(h.hostname, h.ip)
            FROM findings f
            LEFT JOIN ports p ON p.id = f.port_id
            LEFT JOIN hosts h ON h.id = p.host_id
            WHERE f.id = si.ref_id
          )
          ELSE NULL
        END AS host_label
      FROM search_index si
      JOIN engagements e ON e.id = si.engagement_id
      WHERE search_index MATCH ${fts}
        -- Migration 0013: soft-deleted engagements stay in the FTS
        -- index (we don't rewrite triggers) but the global search
        -- modal should not surface them. /settings → Recently deleted
        -- is the only path back to a soft-deleted engagement.
        AND e.deleted_at IS NULL
      ORDER BY rank ASC
      LIMIT ${limit}
    `,
  );

  return (rows as RawHit[]).map((r) => ({
    engagementId: Number(r.engagement_id),
    engagementName: String(r.engagement_name),
    kind: r.kind as SearchKind,
    refId: Number(r.ref_id),
    title: String(r.title ?? ""),
    snippet: String(r.snippet ?? ""),
    rank: Number(r.rank),
    hostLabel: r.host_label != null ? String(r.host_label) : null,
  }));
}

interface RawHit {
  engagement_id: number | bigint;
  engagement_name: string;
  kind: string;
  ref_id: number | bigint;
  title: string | null;
  snippet: string | null;
  rank: number;
  host_label: string | null;
}
