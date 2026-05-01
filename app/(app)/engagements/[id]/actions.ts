"use server";

/**
 * Server actions for the engagement detail page (Phase 4, Plan 04-02).
 *
 * Three mutations consumed by client components on /engagements/[id]:
 *   toggleCheck            — per-port checklist item state (UI-02, D-15)
 *   saveNote               — per-port freeform notes (UI-04, D-16)
 *   updateEngagementTarget — inline target IP/hostname rename (INPUT-03, D-12/CD-06)
 *
 * Wiring: each action delegates to the repo layer (@/lib/db) and triggers
 * revalidatePath where appropriate so RSC re-renders pick up fresh state.
 *
 * Rationale for Server Actions over API routes (CD-04):
 *   These are internal mutations with a stable shape — no third-party
 *   consumers, no need for a route URL. Server Actions give us typed
 *   client→server calls with automatic CSRF handling (Next.js built-in).
 */

import { revalidatePath } from "next/cache";
import { db, upsertCheck, upsertNote, updateTarget } from "@/lib/db";

/**
 * Validate that a value is a positive integer suitable for use as a DB primary key.
 * Server actions are callable via HTTP POST, so callers can pass arbitrary values.
 * This guards against NaN, negative numbers, zero, non-integer floats, and
 * excessively large numbers.
 */
function validateId(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

/**
 * Toggle a checklist item (UI-02, D-15).
 *
 * Called by ChecklistItem component with useOptimistic. On success:
 * revalidates the engagement page so the RSC tree re-renders with the
 * persisted state. On failure the thrown error propagates to the
 * optimistic wrapper, which auto-reverts (D-15: silent revert — no toast).
 *
 * @param engagementId - Engagement primary key
 * @param portId       - Port primary key
 * @param checkKey     - Stable KB check identifier (D-12)
 * @param checked      - New checked state
 */
export async function toggleCheck(
  engagementId: number,
  portId: number,
  checkKey: string,
  checked: boolean,
): Promise<void> {
  const eid = validateId(engagementId, "engagementId");
  const pid = validateId(portId, "portId");
  if (typeof checkKey !== "string" || !checkKey.trim()) {
    throw new Error("Invalid checkKey.");
  }
  upsertCheck(db, eid, pid, checkKey.trim(), Boolean(checked));
  revalidatePath(`/engagements/${eid}`);
}

/**
 * Save per-port notes (UI-04, D-16).
 *
 * Called by NotesField component after a 600ms debounce. No revalidatePath
 * call — notes content is local to the NotesField component and changing
 * it does not invalidate any other rendered data. Empty string body is
 * valid: users may intentionally clear the field.
 *
 * @param engagementId - Engagement primary key
 * @param portId       - Port primary key
 * @param body         - Note text (empty string clears the note)
 */
export async function saveNote(
  engagementId: number,
  portId: number,
  body: string,
): Promise<void> {
  const eid = validateId(engagementId, "engagementId");
  const pid = validateId(portId, "portId");
  if (typeof body !== "string") {
    throw new Error("Invalid body.");
  }
  upsertNote(db, eid, pid, body);
  // Intentionally no revalidatePath — notes save does not need RSC re-render.
}

/**
 * Update engagement target IP/hostname (INPUT-03, D-12/CD-06).
 *
 * Called by EngagementHeader component on blur/Enter. Validates that the
 * IP is non-empty (the only hard constraint — format validation is
 * deferred; users pasting ambiguous targets are trusted). Hostname is
 * optional: an empty/whitespace-only string clears it (stored as NULL).
 *
 * Revalidates both:
 *   - `/engagements/${id}` — the detail page re-interpolates {IP}/{HOST}
 *     in command strings using the new values.
 *   - `/` with "layout" scope — the sidebar's engagement name/IP display
 *     may have changed.
 *
 * @param engagementId - Engagement primary key
 * @param ip           - New target IP (must be non-empty after trim)
 * @param hostname     - New target hostname (null or empty string clears)
 * @throws Error when ip is empty after trimming
 */
export async function updateEngagementTarget(
  engagementId: number,
  ip: string,
  hostname: string | null,
): Promise<void> {
  const eid = validateId(engagementId, "engagementId");
  const trimmedIp = ip.trim();
  if (!trimmedIp) {
    throw new Error("Target cannot be empty.");
  }
  const trimmedHost = hostname?.trim();
  updateTarget(db, eid, trimmedIp, trimmedHost ? trimmedHost : null);
  revalidatePath(`/engagements/${eid}`);
  revalidatePath("/", "layout");
}
