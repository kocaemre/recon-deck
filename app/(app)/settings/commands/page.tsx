/**
 * Settings → Custom Commands page.
 *
 * RSC shell that loads the user_commands table and hands it to the client
 * editor (CommandsEditor). Mutations go through the existing
 * `/api/user-commands*` routes; the page revalidates via router.refresh().
 */

import { db, listUserCommands } from "@/lib/db";
import { CommandsEditor } from "@/components/CommandsEditor";

export const dynamic = "force-dynamic";

export default function CommandsSettingsPage() {
  const commands = listUserCommands(db);
  return (
    <div className="px-8 py-8" style={{ maxWidth: 900, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <div
          className="mono uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          SETTINGS · CUSTOM COMMANDS
        </div>
        <h1
          className="font-semibold"
          style={{
            fontSize: 24,
            letterSpacing: "-0.02em",
            margin: "4px 0 8px",
          }}
        >
          Personal command library
        </h1>
        <p style={{ color: "var(--fg-muted)", fontSize: 13 }}>
          Snippets you save here surface alongside the shipped KB commands on
          every port card. Use{" "}
          <code className="mono">{"{IP}"}</code>,{" "}
          <code className="mono">{"{PORT}"}</code> and{" "}
          <code className="mono">{"{HOST}"}</code> placeholders — they&apos;ll
          be interpolated with each engagement&apos;s target.
        </p>
      </header>
      <CommandsEditor initialCommands={commands} />
    </div>
  );
}
