import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { CheatSheetModal } from "@/components/CheatSheetModal";
import { db, listSummaries } from "@/lib/db";

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
  const engagements = listSummaries(db);

  return (
    <html lang="en" className="dark">
      <body className="flex h-screen overflow-hidden bg-background text-foreground antialiased">
        <Sidebar engagements={engagements} />
        <main className="flex-1 overflow-y-auto">{children}</main>
        <CommandPalette />
        <CheatSheetModal />
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
