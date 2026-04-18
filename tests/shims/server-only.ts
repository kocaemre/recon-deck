// Vitest shim for the `server-only` package.
//
// The real package throws on import under non-RSC bundlers (it relies on the
// `react-server` export condition). Vitest runs in plain Node so the guard is
// meaningless here — we substitute an empty module via vitest.config.ts alias.
//
// In production builds (Next.js), the real `server-only` package is used and
// will correctly fail any client-component import of guarded modules.
export {};
