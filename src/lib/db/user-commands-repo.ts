import "server-only";

/**
 * Personal command library — CRUD + match resolver.
 *
 * `matchUserCommands(service, port)` returns rows where the row's filters
 * permit a match. Filters use a strictest-wins precedence:
 *   1. (service==X, port==N) — exact match
 *   2. (service==X, port==null) — service-wide
 *   3. (service==null, port==N) — port-wide
 *   4. (service==null, port==null) — global
 *
 * Calling code (engagement page + view-model) merges the result with KB
 * commands; ordering puts user commands first so they're prominent in the
 * port detail UI.
 */

import { eq, and, isNull, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { user_commands, type UserCommand } from "./schema";
import type * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

export interface UserCommandInput {
  service?: string | null;
  port?: number | null;
  label: string;
  template: string;
}

export function listUserCommands(db: Db): UserCommand[] {
  return db
    .select()
    .from(user_commands)
    .all()
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function createUserCommand(
  db: Db,
  input: UserCommandInput,
): UserCommand {
  const now = new Date().toISOString();
  return db
    .insert(user_commands)
    .values({
      service: input.service ?? null,
      port: input.port ?? null,
      label: input.label.trim(),
      template: input.template.trim(),
      created_at: now,
      updated_at: now,
    })
    .returning()
    .get();
}

export function updateUserCommand(
  db: Db,
  id: number,
  patch: Partial<UserCommandInput>,
): UserCommand | null {
  const existing = db
    .select()
    .from(user_commands)
    .where(eq(user_commands.id, id))
    .get();
  if (!existing) return null;
  const now = new Date().toISOString();
  const next = {
    service: patch.service === undefined ? existing.service : patch.service,
    port: patch.port === undefined ? existing.port : patch.port,
    label: patch.label !== undefined ? patch.label.trim() : existing.label,
    template:
      patch.template !== undefined ? patch.template.trim() : existing.template,
    updated_at: now,
  };
  return db
    .update(user_commands)
    .set(next)
    .where(eq(user_commands.id, id))
    .returning()
    .get();
}

export function deleteUserCommand(db: Db, id: number): boolean {
  return (
    db
      .delete(user_commands)
      .where(eq(user_commands.id, id))
      .run().changes > 0
  );
}

/**
 * Resolve user commands that apply to (service, port). All four scope
 * patterns surface; ranking is left to the UI / view-model.
 */
export function matchUserCommands(
  db: Db,
  service: string | null,
  port: number | null,
): UserCommand[] {
  const conditions = [
    // global commands
    and(isNull(user_commands.service), isNull(user_commands.port)),
  ];
  if (service !== null) {
    conditions.push(
      and(eq(user_commands.service, service), isNull(user_commands.port)),
    );
  }
  if (port !== null) {
    conditions.push(
      and(isNull(user_commands.service), eq(user_commands.port, port)),
    );
  }
  if (service !== null && port !== null) {
    conditions.push(
      and(eq(user_commands.service, service), eq(user_commands.port, port)),
    );
  }
  return db
    .select()
    .from(user_commands)
    .where(or(...conditions))
    .all();
}
