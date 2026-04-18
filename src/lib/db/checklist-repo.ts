import "server-only";

/**
 * Check state repository — Phase 3 CRUD layer for the check_states table.
 *
 * D-12: check_key is the KB's CheckSchema.key value — a stable string like
 * "smb-null-session", never a positional index. KB edits do not corrupt
 * historical check states because the key is content-addressed, not positional.
 *
 * Composite primary key: (engagement_id, port_id, check_key).
 * Upsert semantics: toggling a check is a single atomic operation.
 *
 * `import "server-only"` prevents accidental client-side imports.
 */

import { eq } from "drizzle-orm";
import { check_states } from "./schema";
import type { Db } from "./engagement-repo";
import type { CheckState } from "./schema";

/**
 * Upsert a check state by composite key (engagement_id, port_id, check_key).
 *
 * Uses onConflictDoUpdate so toggling a check is a single atomic operation
 * (no race window from DELETE+INSERT). Idempotent: calling with the same
 * arguments twice produces the same result (CD-04).
 *
 * @param db           - Drizzle database instance
 * @param engagementId - Parent engagement primary key
 * @param portId       - Parent port primary key
 * @param checkKey     - Stable KB string identifier, e.g. "smb-null-session" (D-12)
 * @param checked      - New checked state
 */
export function upsertCheck(
  db: Db,
  engagementId: number,
  portId: number,
  checkKey: string,
  checked: boolean,
): void {
  const now = new Date().toISOString();
  db.insert(check_states)
    .values({
      engagement_id: engagementId,
      port_id: portId,
      check_key: checkKey,
      checked,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [
        check_states.engagement_id,
        check_states.port_id,
        check_states.check_key,
      ],
      set: { checked, updated_at: now },
    })
    .run();
}

/**
 * Get all check states for an engagement.
 *
 * Returns all (check_key, checked) pairs across all ports in the engagement.
 * Callers group by port_id at the call site (e.g. in getById's assembly step).
 *
 * @param db           - Drizzle database instance
 * @param engagementId - Parent engagement primary key
 * @returns Array of CheckState rows (may be empty)
 */
export function getChecksByEngagement(
  db: Db,
  engagementId: number,
): CheckState[] {
  return db
    .select()
    .from(check_states)
    .where(eq(check_states.engagement_id, engagementId))
    .all();
}
