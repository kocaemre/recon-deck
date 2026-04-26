import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { CheatSheetModal } from "@/components/CheatSheetModal";
import { GlobalSearchModal } from "@/components/GlobalSearchModal";
import { db, listSummaries } from "@/lib/db";
import { ports as portsTable } from "@/lib/db/schema";
import { getKb, matchPort } from "@/lib/kb";
import { SCHEMA_VERSION_LABEL } from "@/lib/db/migration-version";

const fontUI = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

/**
 * Root layout — RSC with sidebar and two-column flex layout.
 *
 * Dark-mode-only in v1.0 (UI-06) — the html element always carries `className="dark"`.
 * The layout queries the database for the engagement list and passes it to the
 * Sidebar component. `force-dynamic` ensures the sidebar re-renders on every
 * request so newly created engagements appear without client-side cache tricks.
 *
 * Per D-05: Sidebar is always visible (even with empty state).
 * Per UI-SPEC: Two-column layout — 280px sidebar + fluid main.
 */

export const metadata: Metadata = {
  title: "recon-deck",
  description: "nmap output to actionable checklist in under 30 seconds",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  // KB resolves through the cached singleton so user YAML edits picked
  // up by fs.watch surface in the sidebar without a server restart.
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
    <html lang="en" className={`dark ${fontUI.variable} ${fontMono.variable}`}>
      <body className="flex h-screen overflow-hidden bg-background text-foreground antialiased">
        <Sidebar
          engagements={engagements}
          schemaVersion={SCHEMA_VERSION_LABEL}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
        <CommandPalette />
        <CheatSheetModal />
        <GlobalSearchModal />
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
