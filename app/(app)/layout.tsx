import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { CheatSheetModal } from "@/components/CheatSheetModal";
import { GlobalSearchModal } from "@/components/GlobalSearchModal";
import { UpdateAvailableToast } from "@/components/UpdateAvailableToast";
import { db, listSummaries, effectiveAppState } from "@/lib/db";
import { ports as portsTable } from "@/lib/db/schema";
import { getKb, matchPort } from "@/lib/kb";
import { SCHEMA_VERSION_LABEL } from "@/lib/db/migration-version";

/**
 * (app) layout — every "real app" page renders inside this group:
 * landing, engagement detail, settings. The sidebar + command palette
 * + cheat sheet + global search live here.
 *
 * v1.9.0: server-component onboarding guard. If `app_state.onboarded_at`
 * is null, every (app) route redirects to /welcome before any DB-heavy
 * sidebar query runs. The welcome layout does the inverse — if the
 * operator hits /welcome already-onboarded, it bounces back here.
 *
 * `force-dynamic` ensures the sidebar re-renders on every request so
 * newly created engagements appear without client-side cache tricks.
 */

export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cfg = effectiveAppState(db);
  if (!cfg.onboardedAt) redirect("/welcome");

  const summaries = listSummaries(db);

  // KB-driven check totals can't be computed in SQL (each port matches
  // shipped KB entries dynamically). We pull only the columns the matcher
  // needs (engagement_id, port, service) instead of every row's full
  // payload. The `done` count comes pre-aggregated from listSummaries
  // (correlated COUNT subquery) so check_states never gets fully scanned.
  const portRows = db
    .select({
      engagement_id: portsTable.engagement_id,
      port: portsTable.port,
      service: portsTable.service,
    })
    .from(portsTable)
    .all();
  const portsByEngagement = new Map<number, typeof portRows>();
  for (const p of portRows) {
    const list = portsByEngagement.get(p.engagement_id) ?? [];
    list.push(p);
    portsByEngagement.set(p.engagement_id, list);
  }

  const sidebarKb = getKb();
  const engagements = summaries.map((s) => {
    const enPorts = portsByEngagement.get(s.id) ?? [];
    let total = 0;
    for (const p of enPorts) {
      const kbEntry = matchPort(sidebarKb, p.port, p.service ?? undefined);
      total += kbEntry.checks.length;
    }
    return { ...s, total, done: s.done_check_count };
  });

  return (
    <>
      <Sidebar
        engagements={engagements}
        schemaVersion={SCHEMA_VERSION_LABEL}
      />
      {/* `max-width` caps the engagement view on wide monitors. Above
          ~1800px the layout was stretching to the full viewport, leaving
          a long, hard-to-scan tail of whitespace and very long lines.
          1800px keeps the heatmap + 2-col detail pane comfortable up to
          ultrawide; the inner content is left-aligned so the sidebar
          stays glued to the left edge. */}
      <main className="flex-1 overflow-y-auto" style={{ maxWidth: 1800 }}>
        {children}
      </main>
      <CommandPalette />
      <CheatSheetModal />
      <GlobalSearchModal />
      <UpdateAvailableToast />
    </>
  );
}
