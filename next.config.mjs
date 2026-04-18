// TECH DEBT: script-src uses 'unsafe-inline' because Next.js injects inline
// <script> tags for hydration data (__NEXT_DATA__, RSC payload, chunk preloads).
// Without it, CSP violations break every "use client" component in production.
// In development, 'unsafe-eval' is also required because webpack uses eval()
// for hot module replacement (react-refresh-utils). Without it, client
// components fail to hydrate and all onClick/onChange handlers are dead.
// The correct long-term fix is nonce-based CSP via middleware (Next.js 15.5
// supports this), but that requires per-request nonce generation and propagation
// through the RSC render tree. Deferred to a future hardening phase.
import bundleAnalyzer from "@next/bundle-analyzer";

const isDev = process.env.NODE_ENV === "development";
const cspHeader = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

// Bundle-analyzer wrapper (OPS-07). Enabled when ANALYZE=true; produces a
// static HTML report under .next/analyze/. Wraps existing nextConfig — every
// other property (output, serverExternalPackages, headers) is preserved.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false, // never open browser in CI
  analyzerMode: "static", // emit static HTML
});

export default withBundleAnalyzer(nextConfig);
