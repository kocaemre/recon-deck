/**
 * Settings → Wordlists page (P1-E).
 *
 * Surfaces the shipped DEFAULT_WORDLISTS table next to any operator
 * overrides stored in `wordlist_overrides`. Mutations go through
 * `/api/wordlists*`; the page revalidates via router.refresh().
 */

import { db, listWordlistOverrides } from "@/lib/db";
import { DEFAULT_WORDLISTS } from "@/lib/kb/wordlists";
import { WordlistsEditor } from "@/components/WordlistsEditor";

export const dynamic = "force-dynamic";

export default function WordlistsSettingsPage() {
  const overrides = listWordlistOverrides(db);
  // Snapshot the shipped table once on the server so the client editor knows
  // which keys are "known defaults" vs operator-only entries.
  const shipped = Object.entries(DEFAULT_WORDLISTS).map(([key, path]) => ({
    key,
    path,
  }));

  return (
    <div className="px-8 py-8" style={{ maxWidth: 900, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <div
          className="mono uppercase tracking-[0.08em] font-medium"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          SETTINGS · WORDLISTS
        </div>
        <h1
          className="font-semibold"
          style={{
            fontSize: 24,
            letterSpacing: "-0.02em",
            margin: "4px 0 8px",
          }}
        >
          Wordlist paths
        </h1>
        <p style={{ color: "var(--fg-muted)", fontSize: 13 }}>
          Command templates can include{" "}
          <code className="mono">{"{WORDLIST_*}"}</code> placeholders. The
          shipped table targets a Kali default install — override any row
          below if your SecLists / dirb / rockyou paths live elsewhere. Custom
          keys (e.g. <code className="mono">{"{WORDLIST_MY_CUSTOM}"}</code>)
          are also welcome — just add them and reference them from your
          personal commands.
        </p>
      </header>
      <WordlistsEditor shipped={shipped} initialOverrides={overrides} />
    </div>
  );
}
