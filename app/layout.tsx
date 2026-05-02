import type { Metadata } from "next";
import localFont from "next/font/local";
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
 * Fonts are bundled locally (`app/fonts/`) instead of pulled from
 * Google at build time — recon-deck claims an offline-by-default
 * posture and `next/font/google` violated that with a build-step HTTP
 * fetch. Local variable fonts also stop arm64 CI builds from flaking
 * on Google Fonts ETIMEDOUT under QEMU emulation.
 *
 * Dark-mode-only (UI-06). Light theme deferred.
 */

const fontUI = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-ui",
  display: "swap",
  weight: "100 900",
});

const fontMono = localFont({
  src: "./fonts/JetBrainsMono.ttf",
  variable: "--font-mono",
  display: "swap",
  weight: "100 800",
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
        {/* v2.1.0: desktop-only fallback. CSS shows this block + hides
            everything else when the viewport is < 1280px. recon-deck's
            heatmap layout assumes desktop space — mobile/tablet would
            render an unusable cramped UI. */}
        <div
          id="recon-mobile-block"
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--bg-0)",
            color: "var(--fg)",
            zIndex: 9999,
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 24px",
            textAlign: "center",
          }}
        >
          <div
            className="mono uppercase tracking-[0.08em]"
            style={{ fontSize: 11, color: "var(--fg-subtle)", marginBottom: 14 }}
          >
            DESKTOP ONLY
          </div>
          <h1
            className="font-semibold"
            style={{
              fontSize: 22,
              letterSpacing: "-0.01em",
              margin: "0 0 10px",
              maxWidth: 480,
            }}
          >
            recon-deck needs a wider screen.
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--fg-muted)",
              maxWidth: 440,
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            The heatmap + per-port detail layout is designed for ≥ 1280px
            viewports. Open this on a desktop or laptop to continue.
          </p>
        </div>
      </body>
    </html>
  );
}
