import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

/**
 * Root layout — bare HTML shell with fonts + toaster.
 *
 * v1.9.0: split into two route groups. `(app)/layout.tsx` owns the
 * sidebar + command palette + cheat sheet — the working surface every
 * onboarded operator sees. `welcome/layout.tsx` owns the full-screen
 * onboarding chrome. The root only hands them a styled body.
 *
 * Dark-mode-only (UI-06). Light theme deferred.
 */

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

export const metadata: Metadata = {
  title: "recon-deck",
  description: "nmap output to actionable checklist in under 30 seconds",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${fontUI.variable} ${fontMono.variable}`}>
      <body className="flex h-screen overflow-hidden bg-background text-foreground antialiased">
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
