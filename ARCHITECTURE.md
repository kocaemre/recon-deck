## Project

**recon-deck**

Self-hosted, open-source web app that turns nmap output into an interactive, port-aware recon checklist. Paste nmap text/XML (or import an AutoRecon `results/` folder) and every open port becomes a card with pre-filled commands (IP interpolated), HackTricks links, tickable checks, and a notes field. Built for OSCP/HTB students and solo pentesters who currently juggle 8 browser tabs and a scratch Obsidian file per box.

**Core Value:** **From nmap output to an actionable, port-aware checklist in under 30 seconds — offline, single-binary self-host, every engagement export-ready as Markdown.**

If everything else fails, this must work: paste nmap → see cards → copy commands → tick checks → export.

### Constraints

- **Tech stack**: Next.js 15 (App Router) + React + Tailwind + shadcn/ui — single deploy target, hackable, modern.
- **Backend**: Next.js API routes — no separate service; one container, one process.
- **DB**: SQLite + Drizzle ORM — zero-config, file-based, volume-mountable for self-host.
- **Parser**: `fast-xml-parser` for XML, custom regex for nmap text output.
- **KB format**: YAML via `js-yaml` — human-readable, PR-friendly.
- **Container**: Docker single image, `node:alpine` base.
- **License**: MIT.
- **Performance**: 50-port scan must render in ≤1 second.
- **Bundle size**: total assets < 2 MB.
- **Browsers**: Chromium + Firefox (last 2 major versions). Safari best-effort.
- **Offline**: zero outbound HTTP from the app. Resource links open externally but the tool never phones home.
- **Security**: default bind `127.0.0.1`. No auth (local tool).
- **Language**: all user-facing copy and docs in English. Commit messages, code comments, everything in English.
- **Pace**: no deadline; quality over speed. Phases sized for nights-and-weekends feasibility.

## Technology Stack

## Scope & Constraint Recap
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | **15.5.15** (pin to `15.5.x`) | Full-stack React framework (App Router + API routes) | Author committed to 15; 15.5.x is the final 15-line stable, Turbopack-stable, React 19 compatible, fully supports `output: "standalone"` which is mandatory for the slim Docker image. Next.js 16 (16.2.3) is current but the 15.5 line has more community Docker/Drizzle baking — stay on 15.5 for v1.0, upgrade post-launch. |
| React | **19.1.x** (pair with Next 15.5) | UI runtime | Next.js 15.5 ships with React 19.1 as the canonical pairing. React 19.2 is out (19.2.5) but tie it to whatever Next 15.5.15 pulls in — don't pin a newer React independently. |
| TypeScript | **5.9.x** | Type safety | Next 15.5 supports TS 5.x. Do NOT jump to TypeScript 6.0.2 yet — it was released recently and has breaking changes (stricter `unknown` in catch, removed deprecated flags) that several Next/Drizzle plugins haven't caught up on. 5.9 is the safe stable. |
| Tailwind CSS | **4.2.2** | Styling | Tailwind 4 is the current major. Uses the new Oxide engine (Rust-based), zero-config via `@import "tailwindcss"`, no `tailwind.config.js` needed in most cases. Tree-shakes aggressively — critical for the < 2 MB bundle. |
| shadcn/ui | CLI **4.2.0** (components are copied in, no runtime version) | UI component library | Not a dependency — a code generator. Every component is copy-paste into `/components/ui/` so you only ship what you use. Perfect for the < 2 MB target. |
| SQLite via **better-sqlite3** | **12.9.0** | Persistence | Synchronous API (simpler than node-sqlite3 callbacks), fastest in the ecosystem, single-file DB, works seamlessly with Drizzle. See "Alpine Gotchas" below — this needs native compilation. |
| Drizzle ORM | **0.45.2** | Type-safe SQL | Lightweight (adds ~50 KB to bundle, way less than Prisma's ~5 MB runtime), SQL-first, migrations via `drizzle-kit`. SQLite driver is first-class. |
| drizzle-kit | **0.31.10** | Migrations / schema introspection | Dev-only. Runs `drizzle-kit generate` and `drizzle-kit migrate`. |
| fast-xml-parser | **5.5.12** | Parse nmap `-oX` output | Pure JS, zero native deps, handles nmap XML cleanly. v5 has a stricter API than v4 — use `XMLParser` class with `{ ignoreAttributes: false, attributeNamePrefix: "@_" }`. |
| js-yaml | **4.1.1** | Load KB YAML files | De facto standard. Use `yaml.load()` with the default `FAILSAFE_SCHEMA` upgrade (`DEFAULT_SCHEMA`) — avoid `load` without schema on untrusted input, but since your KB is in-repo this is fine. |
### Supporting Libraries (recommended additions)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **zod** | **4.3.6** | Runtime schema validation | Validate parsed YAML KB entries at load time, validate API route inputs, derive TypeScript types. Zod 4 has 60% smaller bundle than 3.x and is the 2026 default. |
| **class-variance-authority** | **0.7.1** | Variant styling for shadcn components | Required by shadcn/ui generator output. Tiny (~2 KB). |
| **clsx** + **tailwind-merge** | 2.1.1 / 3.5.0 | Conditional className composition | Used by shadcn `cn()` helper. Both < 1 KB. |
| **lucide-react** | **1.8.0** | Icons | shadcn's default icon set. Tree-shakes per-icon — import only the glyphs you use. |
| **sonner** | **2.0.7** | Toast notifications (e.g., "Copied!") | shadcn's recommended toast lib. ~3 KB. |
| **cmdk** | **1.1.1** | Command palette (optional, for keyboard shortcuts UX) | If you want a `Ctrl+K` launcher. Skip for v1.0 if bundle budget is tight. |
| **next-themes** | **0.4.6** | Dark mode (even though default is dark) | Lets you future-proof for v1.1 light mode without a rewrite. ~2 KB. |
| **zustand** | **5.0.12** | Client state (per-engagement UI state) | Use instead of Context for port-card open/closed, active engagement, keyboard shortcut registry. 1 KB, no provider needed. **Preferred over Redux/Jotai** for this scope. Server state (checklist persistence) goes through API routes → SQLite, no React Query needed. |
| **react-markdown** + **remark-gfm** | 10.1.0 / 4.0.1 | Render KB `resources[]` descriptions if they contain markdown | Optional; skip if KB stays plain-text. |
| **jszip** | **3.10.1** | Unpack AutoRecon `.zip` uploads server-side | See "AutoRecon Import Approach" below — the recommended path is zip upload, and this is the canonical JS zip lib. |
| **@radix-ui/react-*** | as pulled in by shadcn | A11y primitives under shadcn components | Installed automatically by shadcn CLI per-component. Each primitive ~3–8 KB. |
### File / Directory Picker Libraries
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| **react-dropzone** | **15.0.0** | Drag-and-drop file upload UI | Cross-browser, no File System Access API dependency. Handles multi-file and directory (via `webkitdirectory`) on Chromium. Use this. |
### Export Stack
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| **Hand-rolled Markdown generator** | — | `.md` export with Obsidian frontmatter | Just template strings. Do NOT pull in `marked` or `unified` — unnecessary weight for generating (vs parsing) markdown. |
| **Native `JSON.stringify`** | — | JSON export | No library. |
| **Print CSS + browser print-to-PDF** | — | HTML/PDF report (recommended path for v1.0) | Ship a dedicated `/engagements/[id]/report` route with print-optimized Tailwind classes (`print:` variants) and instruct users to Ctrl+P → Save as PDF. **Zero extra dependencies, zero bundle cost, zero native deps in Docker.** |
| ~~`@react-pdf/renderer` 4.4.1~~ | — | Server-side PDF generation | Fallback only if print CSS is insufficient. Adds ~800 KB to the bundle. Avoid for v1.0. |
| ~~`puppeteer` 24.40.0~~ | — | Headless Chromium PDF | **Do NOT use.** Bundles Chromium (~300 MB), breaks the single-image-slim Docker goal, and violates offline constraint at install time on alpine. |
### Development Tools
| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| **vitest** | **4.1.4** | Unit tests for parsers and KB schema | Fast, Vite-based, Jest-compatible API. Required by the v1.0 quality bar. |
| **@vitejs/plugin-react** | **6.0.1** | Vitest JSX support if you add component tests | Optional; parser tests are pure TS so this may be unneeded. |
| **happy-dom** | **20.9.0** | DOM environment for vitest (if testing components) | Lighter than jsdom. Optional. |
| **tsx** | **4.21.0** | Run one-off TS scripts (KB validation, seed scripts) | For `scripts/validate-kb.ts` etc. |
| **ESLint** | **9.x** (via `eslint-config-next@15.5.x`) | Linting | Pin eslint to the version that `eslint-config-next@15.5` supports — NOT ESLint 10 yet. |
| **Prettier** | **3.8.2** | Formatting | Pair with `prettier-plugin-tailwindcss`. |
| **@types/node** | **22.x LTS** | Node types | Match the Node LTS that the Docker base image runs. Do NOT use @types/node 25.x — that tracks Node 25 current, not LTS. |
| **@types/better-sqlite3** | **7.6.13** | DB types | Even though better-sqlite3 itself is at v12, the types package stayed on 7.x numbering. |
| **@types/js-yaml** | **4.0.9** | YAML types | — |
## Installation
# Initialize
# Core runtime
# shadcn/ui + its deps
# Then add components on demand, e.g.:
# Dev
## Alpine + Native SQLite: Gotchas and Fixes (CRITICAL)
# ---------- deps / build ----------
# ---------- runtime ----------
# Only libstdc++ is needed at runtime for the compiled .node binary
- **`output: "standalone"` in `next.config.mjs` is MANDATORY** — otherwise you ship full `node_modules` and the image bloats 10×. Confirmed in current Next.js docs (Context7, `/vercel/next.js`).
- **Copy `.next/static` and `public/` manually.** `output: "standalone"` does NOT copy them automatically. The Next.js docs are explicit about this.
- **Copy the compiled `.node` binary manually** (as shown above). Next.js output tracing sometimes misses native `.node` files built against musl. Verify by shelling into the image and checking `require('better-sqlite3')` works before tagging a release.
- **Pin Node major version** (e.g. `node:22-alpine`). Upgrading Node across majors may require rebuilding better-sqlite3 against a new ABI. Node 22 LTS is the sweet spot for April 2026 — supported until April 2027, Next.js 15.5 fully compatible.
- **Bind to `127.0.0.1` inside the container** via `HOSTNAME=127.0.0.1`. Users who want to expose publicly must pass `-e HOSTNAME=0.0.0.0` AND map the port — deliberate two-step opt-in, matching your security posture.
- **Do NOT use `npm install --omit=dev` in the runtime stage.** The better-sqlite3 `.node` is under `dependencies`, but copying just the build artifact (as above) is cleaner and smaller than `npm prune`-ing.
- **Alternative considered**: `@libsql/client` (0.17.2) bundles a prebuilt musl binary. If alpine compilation becomes a pain, swap drivers — Drizzle supports both. For v1.0, stick with better-sqlite3 for the synchronous API and broader community patterns. **Recorded as a known escape hatch.**
## Bundle Size Strategy (< 2 MB target)
| Threat | Mitigation |
|--------|------------|
| Importing `react-markdown` for trivial text | Render as plain text unless KB actually uses markdown. Saves ~40 KB. |
| `@react-pdf/renderer` for PDF | Use print CSS instead (0 KB). |
| `jszip` on client | Do AutoRecon unzip **server-side only** — keep jszip out of client bundle. |
| `js-yaml` on client | Same — KB loads server-side at startup. Zero client cost. |
| `fast-xml-parser` on client | Parse nmap XML server-side via API route. Keep out of client. |
| Icon-explosion (importing `* as Icons from 'lucide-react'`) | Always named-import individual icons. |
## AutoRecon Import Approach (RECOMMENDED: Zip Upload)
| Approach | Chromium | Firefox | Safari | Verdict |
|----------|----------|---------|--------|---------|
| **File System Access API** (`showDirectoryPicker`) | Yes | **No** (not implemented, no plans) | **No** | Fails your "Chromium + Firefox" requirement. |
| **`<input type="file" webkitdirectory>`** | Yes | Yes | Partial | Works but sends hundreds of individual files — awkward, rate-limit risk on API route. |
| **Drag-and-drop directory with `DataTransferItem.webkitGetAsEntry`** | Yes | Yes | Partial | Works but complex client code, same file-count issue. |
| **Zip upload** (user zips `results/<ip>/` and drags the .zip) | Yes | Yes | Yes | Single POST, server unzips with `jszip`, cross-browser, works offline, trivial to test. **Winner.** |
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Next.js 15.5** | Next.js 16.2.3 | Post-v1.0 upgrade. 16 works but forces a Turbopack-only build and some middleware API changes — not worth the churn mid-project. |
| **better-sqlite3** | `@libsql/client` (libSQL) | If alpine native compile breaks or you later want replication. Drizzle supports both drivers with minimal code change. |
| **Drizzle** | Prisma | Prisma adds 5 MB+ runtime, a separate engine binary, and generates a client at install — overkill for single-file SQLite and fights the slim-Docker goal. |
| **zustand** | React Context + useReducer | For a 2-3 slice store, Context is fine. zustand wins when you need cross-tree state without prop drilling. |
| **zustand** | Jotai, Redux Toolkit | Both viable; zustand has smallest footprint (1 KB vs Jotai's 3 KB, RTK's 12 KB+) and simplest API for single-user tools. |
| **vitest** | Jest | Jest is slower, needs babel/swc config. Vitest reads the Next.js TS setup with zero config. |
| **Zod** | Valibot, ArkType | Valibot is smaller (~60%) but has less documentation and fewer Drizzle integrations. Zod 4 closed most of the size gap. |
| **Print CSS PDF** | `@react-pdf/renderer`, `jspdf`, puppeteer | Only if you need programmatic layout control beyond what CSS provides. For a recon report, print CSS is sufficient. |
| **react-dropzone** | Native `<input type="file">` | Fine for minimalism. react-dropzone is 8 KB and gives you drag-highlight UX users expect. |
| **fast-xml-parser** | `xml2js`, `@xmldom/xmldom` | `xml2js` is unmaintained (last release 2023). `xmldom` is for full DOM; overkill for nmap XML. |
| **js-yaml** | `yaml` (eemeli/yaml) | `yaml` has better spec compliance but larger bundle. js-yaml is load-only, smaller, and the KB doesn't need YAML 1.2 edge cases. |
## What NOT to Use
| Don't Use | Reason |
|-----------|--------|
| **Prisma** | Heavy runtime, separate engine binary, hostile to minimal Docker. |
| **TypeORM** | Overweight, decorator-based, doesn't fit App Router's RSC model cleanly. |
| **`sqlite3` (node-sqlite3)** | Callback/async API is more complex than better-sqlite3's sync API for a single-user app. No performance advantage. |
| **Puppeteer / Playwright (for PDF export)** | Pulls ~300 MB Chromium. Kills the slim Docker goal. |
| **MUI, Chakra, Ant Design** | Runtime-heavy, conflicts with Tailwind, breaks < 2 MB budget. |
| **Styled-components, Emotion** | Adds runtime CSS-in-JS cost. Tailwind covers all styling. |
| **Redux Toolkit** | Overkill for single-user app state. |
| **React Query / SWR for mutations** | Server Actions + API routes + a `router.refresh()` are sufficient. Add React Query only if polling or optimistic updates get complex. |
| **TypeScript 6.0.x (just released)** | Ecosystem lag; wait 2-3 months for plugin compatibility. |
| **ESLint 10** | Flat-config churn; `eslint-config-next@15.5` ships for ESLint 8/9. |
| **Node 25 / `@types/node@25`** | Non-LTS; Node 22 LTS is the right runtime target. |
| **File System Access API as primary import** | Firefox does not implement it. |
| **`node:latest` Docker tag** | Unpinned major == breakage. Use `node:22-alpine` explicitly. |
## Open Decisions Flagged for Roadmap
| Decision | Default Recommendation | Confidence |
|----------|------------------------|------------|
| Next.js 15 vs 16 | **15.5.15**, upgrade post-launch | HIGH |
| Node base image version | **node:22-alpine** (LTS through Apr 2027) | HIGH |
| PDF export mechanism | **Browser print CSS**, server-side PDF only if user feedback demands it | MEDIUM — validate during phase testing |
| AutoRecon import UX | **Zip upload via react-dropzone**; bind-mount folder as v1.1 power-user path | HIGH |
| Client state lib | **zustand 5** | HIGH |
| Schema validation | **Zod 4** for both KB YAML and API input boundaries | HIGH |
| KB YAML parser mode | `yaml.load()` with default schema (trusted input since in-repo) | HIGH |
## Sources
- Next.js 15.5 standalone output docs — Context7 `/vercel/next.js`, `output.mdx` (HIGH)
- better-sqlite3 compilation / native module docs — Context7 `/wiselibs/better-sqlite3` (HIGH)
- npm registry (verified 2026-04-14) for all `version` columns (HIGH)
- Drizzle ORM SQLite driver docs — drizzle-team docs (HIGH)
- File System Access API browser compat — MDN `showDirectoryPicker` (HIGH, unchanged since 2023: Firefox "no plans")
- Node.js LTS schedule — nodejs.org release schedule for Node 22 LTS window (HIGH)
## Confidence Summary
| Area | Confidence | Notes |
|------|------------|-------|
| Core framework (Next/React/Tailwind/shadcn) | HIGH | Versions verified via npm and Context7. |
| DB layer (Drizzle + better-sqlite3) | HIGH | Alpine gotchas well-documented; escape hatch identified. |
| Parsers (fast-xml-parser, js-yaml) | HIGH | Stable, widely-used, no version risk. |
| Validation (Zod 4) | HIGH | Current major, widely adopted. |
| AutoRecon import via zip | HIGH | File System Access API definitively unavailable in Firefox; zip is the only cross-browser path. |
| PDF export via print CSS | MEDIUM | Works for 90% of cases; may need server-side render if users want automation. Flag for user testing. |
| Docker alpine multi-stage | HIGH | Pattern is battle-tested; author must verify in CI before tagging. |
| Bundle size < 2 MB | MEDIUM | Achievable with discipline; needs bundle-analyzer gating in CI (roadmap item). |

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.

