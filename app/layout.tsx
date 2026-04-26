import type { Metadata } from "next";
import path from "node:path";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { CheatSheetModal } from "@/components/CheatSheetModal";
import { GlobalSearchModal } from "@/components/GlobalSearchModal";
import { db, listSummaries } from "@/lib/db";
import { ports as portsTable, check_states } from "@/lib/db/schema";
import { loadKnowledgeBase, matchPort } from "@/lib/kb";
import { SCHEMA_VERSION_LABEL } from "@/lib/db/migration-version";

const sidebarKb = loadKnowledgeBase({
  shippedPortsDir: path.join(process.cwd(), "knowledge", "ports"),
  shippedDefaultFile: path.join(process.cwd(), "knowledge", "default.yaml"),
  userDir: process.env.RECON_KB_USER_DIR ?? undefined,
});

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

  // Enrich each summary with KB-derived check stats. Performance-conscious:
  // 3 SELECTs total (engagements + ports + check_states) instead of N×getById,
  // then aggregate in-memory. KB lookup is in-memory (loadKnowledgeBase is
  // cached at module level via sidebarKb).
  const allPorts = db.select().from(portsTable).all();
  const allChecks = db.select().from(check_states).all();
  const portsByEngagement = new Map<number, typeof allPorts>();
  for (const p of allPorts) {
    const list = portsByEngagement.get(p.engagement_id) ?? [];
    list.push(p);
    portsByEngagement.set(p.engagement_id, list);
  }
  const checkedKeys = new Set(
    allChecks
      .filter((c) => c.checked)
      .map((c) => `${c.engagement_id}:${c.port_id}:${c.check_key}`),
  );

  const engagements = summaries.map((s) => {
    const enPorts = portsByEngagement.get(s.id) ?? [];
    let total = 0;
    let done = 0;
    for (const p of enPorts) {
      const kbEntry = matchPort(sidebarKb, p.port, p.service ?? undefined);
      total += kbEntry.checks.length;
      for (const c of kbEntry.checks) {
        if (checkedKeys.has(`${s.id}:${p.id}:${c.key}`)) done++;
      }
    }
    return { ...s, total, done };
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
