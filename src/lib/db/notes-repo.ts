import "server-only";

/**
 * Port notes repository — Phase 3 CRUD layer for the port_notes table.
 *
 * Each port in an engagement gets at most one notes record.
 * Upsert semantics: first write creates, subsequent writes update body.
 * Empty string body is valid (user cleared the field).
 *
 * Composite primary key: (engagement_id, port_id).
 *
 * `import "server-only"` prevents accidental client-side imports.
 */

import { eq } from "drizzle-orm";
import { port_notes } from "./schema";
import type { Db } from "./engagement-repo";
import type { PortNote } from "./schema";

/**
 * Upsert a note for a specific port in an engagement.
 *
 * Uses onConflictDoUpdate with composite key (engagement_id, port_id).
 * Empty string body is valid — user may clear the notes field (CD-04).
 * The upsert is atomic: no race window between read and write.
 *
 * @param db           - Drizzle database instance
 * @param engagementId - Parent engagement primary key
 * @param portId       - Parent port primary key
 * @param body         - Note text (empty string clears the note)
 */
export function upsertNote(
  db: Db,
  engagementId: number,
  portId: number,
  body: string,
): void {
  const now = new Date().toISOString();
  db.insert(port_notes)
    .values({
      engagement_id: engagementId,
      port_id: portId,
      body,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [port_notes.engagement_id, port_notes.port_id],
      set: { body, updated_at: now },
    })
    .run();
}

/**
 * Get all notes for an engagement.
 *
 * Returns all port notes — one per port that has been annotated.
 * Callers filter by port_id at the call site.
 *
 * @param db           - Drizzle database instance
 * @param engagementId - Parent engagement primary key
 * @returns Array of PortNote rows (may be empty)
 */
export function getNotesByEngagement(
  db: Db,
  engagementId: number,
): PortNote[] {
  return db
    .select()
    .from(port_notes)
    .where(eq(port_notes.engagement_id, engagementId))
    .all();
}
