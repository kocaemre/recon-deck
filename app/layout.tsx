import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { Toaster } from "sonner";
import { db, effectiveAppState } from "@/lib/db";
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
 * Theme (v2.3.0 #3): app_state.theme is "system" / "dark" / "light".
 *   - Explicit choice → class is applied server-side.
 *   - "system" → server renders neutral, an inline pre-paint script
 *     reads prefers-color-scheme and stamps the right class before
 *     React hydrates. suppressHydrationWarning swallows the className
 *     diff that produces. The script is the smallest amount of code
 *     that prevents a flash of the wrong theme.
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
  const themePref = effectiveAppState(db).theme;
  // Server-side resolution: explicit choices stamp their class. "system"
  // renders without a theme class so the inline script below can pick
  // it up from prefers-color-scheme before paint.
  const themeClass =
    themePref === "dark" ? "dark" : themePref === "light" ? "light" : "";

  return (
    <html
      lang="en"
      className={`${themeClass} ${fontUI.variable} ${fontMono.variable}`.trim()}
      data-theme-pref={themePref}
      suppressHydrationWarning
    >
      <head>
        {/* Static bootstrap script — reads data-theme-pref and resolves
            "system" via prefers-color-scheme before paint to avoid a
            theme flash on first hydration. Lives in public/ so the
            SEC-03 ESLint guard against dangerouslySetInnerHTML stays
            clean. */}
        <Script src="/theme-bootstrap.js" strategy="beforeInteractive" />
      </head>
      <body className="flex h-screen overflow-hidden bg-background text-foreground antialiased">
        {children}
        <Toaster theme={themePref === "system" ? "system" : themePref} position="bottom-right" />
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
