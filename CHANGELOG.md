# Changelog

All notable changes to recon-deck. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] — 2026-05-07

Minor. Light theme arrives, plus three operator-facing fixes: smarter
searchsploit fallback, Docker-aware tool detection, and an honest
update-check error story instead of "Could not reach api.github.com"
on every transient blip.

### Added

- **Light mode.** Tri-state Display toggle in `/settings` —
  `system` (default, follows `prefers-color-scheme`), `dark`, and
  `light`. Tokens flip via `:root.light` overrides on the `<html>`
  class so component code never branches. Server-side resolution +
  pre-paint bootstrap script eliminates the theme-flash on hydration.
  Persisted in `app_state.theme` (migration 0020). Print stylesheet
  remains light-only regardless of choice. (#3)
- **searchsploit auto-fallback to service-only query.** When the
  versioned query (e.g. `vsftpd 2.3.4`) returns zero hits AND has
  more than one token, recon-deck re-runs with just the first token
  and surfaces matches under a "Broader matches · no version filter"
  header. Catches version-range exploits the strict query was
  silently dropping. (#12)

### Changed

- **`/api/update-check` failure modes are no longer collapsed.** The
  route now returns `{ ok: false, reason: rate_limited |
  github_unavailable | network_error }` so the settings "Check now"
  toast can name the actual problem (rate limit / GitHub side issue)
  instead of always pointing at the user's network. Failure responses
  are no longer cached for an hour — the next call always re-attempts
  so a transient blip can't poison the cache. (#16)
- **`/settings → Detected tools` is Docker-aware.** Probe `/.dockerenv`
  and surface a "Container detected" callout with a copy-pasteable
  `-v /usr/share/wordlists:/host/wordlists:ro` snippet when running
  inside the recon-deck image with no host mount — instead of the
  silent all-rows-Not-found that #18 reported. SecLists / dirb /
  dirbuster candidate lists also probe `/host/...` mount points. (#18)

## [2.2.0] — 2026-05-03

Minor. Workflow ergonomics: bulk-tick the per-port checklist, collapse
the sidebar to a thin rail on small screens, see at a glance which
external tools recon-deck found on the host, and stop fighting
searchsploit's overly strict query allowlist. Also clears a UX
papercut on engagement creation.

### Added

- **Bulk `Check all` / `Uncheck all` toggle** on the per-port checklist
  header. Wraps every check in a single transaction so toggling 12
  items fires one revalidate, not twelve. Per-row toggle still uses
  the existing optimistic path. (#1)
- **Collapsible sidebar.** New 52-px icon rail replaces the 260-px
  engagement list when collapsed; flip with the brand-row chevron or
  `Cmd+B` / `Ctrl+B`. State persists in `app_state.sidebar_collapsed`
  (migration 0019) so SSR returns the right width with no hydration
  flash. Rail keeps RadarMark home, expand button, plus/settings
  icons. (#2)
- **`/settings → Detected tools` panel.** Probes common install paths
  for `searchsploit`, SecLists, dirb, dirbuster on the live host and
  surfaces what was found with the source label (`apt`, `Docker
  bundle`, `PATH`, …). Read-only; overrides still go through
  `/settings/wordlists`. (#9)

### Changed

- **Searchsploit query validation rewritten.** Replaced the allowlist
  regex (`[A-Za-z0-9._-\s]`) with a denylist of shell metacharacters.
  Real banners like `Apache/2.4.49`, `OpenSSH 7.2p2`,
  `Samba 3.0.20-Debian`, and `Server (Ubuntu)` were being rejected.
  `spawn(argv)` is the actual injection boundary; the regex is
  defense-in-depth. (#8)

### Fixed

- **Sidebar engagement list refreshes after creating a new
  engagement.** `router.push()` alone wasn't invalidating the
  client-side RSC cache for the layout segment, so the freshly
  created engagement only appeared after a hard reload. Added the
  matching `router.refresh()` to `PastePanel` and `ImportPanel`. (#7)

## [2.1.3] — 2026-05-02

Patch. Settings polish: manual "Check now" button + visible current
version, sidebar drops the static version chip, update toast no
longer self-suppresses on no-update sessions.

### Added

- **`/settings → First-run` "Check now" button.** Bypasses both the
  auto-check toggle and the 1-hour process-level cache via a new
  `?force=1` query on `/api/update-check`. Toasts the result —
  "v2.1.4 available" with a Release notes action, or
  "You're on the latest version (v2.1.3)" success when current.
- **Currently-running version line** under the toggle description so
  operators always know what build they're on without diffing
  CHANGELOG.

### Changed

- Sidebar brand row drops the static `v2.0` chip — the version
  belongs in `/settings`, not the global chrome.

### Fixed

- **Update toast dedupe key was set up-front**, before the fetch
  resolved. So if the auto-check toggle was off, the key was still
  set — meaning if the operator later flipped the toggle on in the
  same session, the toast was silently swallowed. Now we only mark
  "shown" inside the branch that actually fires the toast.
- **Auto-create GitHub Release on tag push** (`release.yml`). The
  in-app update toast queries `api.github.com/.../releases/latest`;
  without a Release row, even a built+pushed image returned 404 and
  the toast never fired. `softprops/action-gh-release` now runs at
  the end of the multi-arch publish.

## [2.1.2] — 2026-05-02

Patch. Bundle searchsploit into the Docker image so the "Lookup
exploits" port action works out of the box, fix a misleading error
that referenced a non-existent settings route.

### Added

- **searchsploit (exploit-database) inside the Docker image.** A new
  multi-stage `exploitdb` build pulls the upstream
  `gitlab.com/exploit-database/exploitdb` repo (depth 1, ~150 MB), the
  runner installs `bash`, `coreutils`, `gawk`, `python3` and symlinks
  the script at `/usr/local/bin/searchsploit`. The "Lookup exploits"
  button in the port detail pane now resolves directly against the
  bundled CSV index — fully offline, no host install required.

### Fixed

- ENOENT error from `searchsploit` previously pointed users at a
  `/settings/exploits` route that doesn't exist. Updated the message
  to mention the bundled image, the Kali/Debian apt path, and the
  upstream GitLab clone alternative.

## [2.1.1] — 2026-05-02

Patch. Public-release polish: radar identity mark in the sidebar,
package.json metadata for npm/GitHub side-panel, stale "v1.0" phrasing
removed from public docs, and a Dockerfile fix so multi-arch CI builds
succeed.

### Added

- **Radar identity mark** — replaces the green `rd` square in `Sidebar`. New `src/components/RadarMark.tsx` (static SVG, phosphor-green oklch palette, scales cleanly for future favicon/social-card use).

### Changed

- `package.json` now ships `author`, `repository`, `homepage`, `bugs`, `description`, `keywords`.
- `ARCHITECTURE.md`, `CONTRIBUTING.md`, `ROADMAP.md` rephrased to drop "in v1.0" / "before v1.x" wording — those files were authored pre-launch and never updated past v1.

### Fixed

- **Dockerfile multi-arch CI**: `public/.gitkeep` stub so the directory survives `git clone` on the runner. Without it, `COPY --from=builder /app/public ./public` failed with `not found` and the GHCR publish never ran.

## [2.1.0] — 2026-05-01

Minor. First-run onboarding flow + sample engagement + desktop-only viewport guard.

### Added

- **First-run onboarding** at `/welcome` — 4-step flow (Scope · Tour · Local paths · Updates). New `app_state` singleton table (Migration 0017) persists `onboarded_at`, `local_export_dir`, `kb_user_dir`, `wordlist_base`, `update_check`. Layout guards bounce un-onboarded operators to `/welcome` and onboarded operators away from it. Animated `BootTerminal` honours `prefers-reduced-motion`.
- **Sample engagement** (Migration 0018 adds `engagements.is_sample`). The existing "Try sample" button now stamps `is_sample = true`; the engagement header surfaces a `SAMPLE` accent chip + "Discard sample" hard-delete button (single-click, no confirm — sample data is signposted).
- **Settings → First-run section.** `Replay onboarding` clears `onboarded_at` (paths preserved) and bounces back to `/welcome`. `Check GitHub for new releases` toggles `app_state.update_check`.
- **`UpdateAvailableToast`** — when the GitHub release-check toggle is on, recon-deck pings `api.github.com/repos/kocaemre/recon-deck/releases/latest` once per browser session and toasts the new tag with a "Release notes" link. Notify-only — installs are still manual (`docker pull` / `git pull`). Process-level 1-hour cache. Honours OPS-03 — when the toggle is off, the route short-circuits server-side and no outbound fetch happens.
- **Desktop-only viewport guard** at `< 1280px`. Hides the cramped mobile rendering and shows a clean explainer instead.

### Changed

- **`createFromScan`** accepts an `opts.isSample` flag (defaults `false`).
- **`getKb()` / `effectiveAppState()`** — KB user directory now resolves from `app_state.kb_user_dir` first, falling back to `RECON_KB_USER_DIR` env (legacy).
- **`OpenInEditorLink`** accepts a `localExportDir` prop forwarded by `EngagementHeader` from the server. Wins over `NEXT_PUBLIC_RECON_LOCAL_EXPORT_DIR` build-time env so the path can be changed in `/settings` without a rebuild.

### Tests

- 471 / 471 passing. New: 7 `app_state` repo cases (singleton seeding, partial UPDATE, `markOnboarded`, `replayOnboarding` preserves paths, DB→env precedence, env fallback, both-null).

## [2.0.1] — 2026-05-01

Patch.

### Added

- **Per-IP rate limiter** on `/api/*` (defense-in-depth). Token bucket: default 60-burst + 600/min steady-state. Localhost bypassed by default; LAN clients get a bucket. Toggles: `RECON_RATE_LIMIT=off|on|force`, `RECON_RATE_LIMIT_BURST`, `RECON_RATE_LIMIT_PER_MIN`. Rejected requests get HTTP 429 + `Retry-After`. The host-allowlist (SEC-01) still runs first; this layers underneath for the `0.0.0.0:13337` LAN-exposure case.

### Changed

- **`listSummaries` / `listDeletedSummaries`** refactored from "engagement row + 7 correlated subqueries" to a single SELECT with six pre-aggregated derived tables. O(1) queries instead of O(N) subqueries per row. Wire shape unchanged. Measurable on 200+ engagements; harmless at single-user scale.

### Tests

- 464 / 464 passing. New: 6 rate-limit cases (per-IP scope, env toggles, localhost bypass, x-forwarded-for parsing).

## [2.0.0] — 2026-05-01

Major version bump because the UI surface expands meaningfully (full-screen annotation modal, new schema column, new evidence flow). Underlying data model is fully backwards-compatible.

### Added

- **Screenshot annotation (#7) (Migration 0016).** New `port_evidence.parent_evidence_id INTEGER NULL` column. Every image evidence row in `EvidencePane` gains a per-tile **Annotate** button. Click opens a full-screen `AnnotatorModal` that loads the source PNG onto an HTML5 canvas and exposes four tools: **Box**, **Arrow**, **Pencil**, **Text**. Five-color palette (red / green / blue / yellow / white). Undo stack. Save exports a PNG via `canvas.toBlob()` and POSTs a NEW evidence row with `parentEvidenceId` set to the source — the original always survives. Annotated rows render a `GitFork` chip in the gallery so provenance is visible at a glance.
- **Zero new dependencies.** Plan called for `tldraw` or `fabric.js`; native canvas turned out small enough to keep the bundle delta at zero. Re-evaluate if the operator asks for shapes/layers we don't currently support.
- **`evidence-repo` test coverage.** First test file for the evidence repo; pins the parent linkage roundtrip and the legacy default-null behaviour.

### Migrations

- **0016** `port_evidence.parent_evidence_id INTEGER NULL`. Additive — no FK constraint (SQLite limitation), no index. Application invariant: parent rows are scoped to the same engagement; stale ids degrade silently to "no chip".

### Tests

- 458 / 458 passing.

## [1.4.1] — 2026-05-01

Patch bundle.

### Added

- **`npm run kb:check-links`** — CLI tool that walks every `knowledge/**.yaml` and verifies every `url:` / `link:` field returns a real page (not a redirect-to-404 mdbook stub). Use `--quick` for HEAD-only. Caught the HackTricks site rebuild after-the-fact; now any future site move surfaces immediately.

### Changed

- **HackTricks links rewritten** to the new `hacktricks.wiki/en/...html` canonical (33 KB files + 3 fixtures). The old `book.hacktricks.xyz/...` paths now redirect to a generic 404 page that returns HTTP 200 — easy to miss with a naive HEAD check, hence the new `kb:check-links` script.
- **3268-gc.yaml** Microsoft Learn link replaced with the actual reachable Server 2003 docs page (the Server 2025 ad-ds/component-updates path was 404).
- **Tag chips** in the sidebar now ride a deterministic FNV-hash → HSL color so the same tag keeps the same hue across renders. Same pattern the heatmap uses for risk colors; tints are dark-mode-friendly (low saturation bg + light fg).
- **`fast-xml-parser`** bumped 5.5.12 → 5.7.2 (npm advisory: XMLBuilder comment/CDATA injection — moderate). Caret range now `^5.7.2`.

## [1.4.0] — 2026-05-01

Polish bundle. Six small UX wins, plus the OS-detection chip lifted into the heatmap toolbar after a user pointed out it was buried at the bottom of the page.

### Added

- **Findings → Markdown copy (#5).** Every finding row in `FindingsPanel` gets a clipboard icon that emits a `### {severity}: {title}` block with description, CVE, and `_Port:_ host:port/proto`. `Cmd+Shift+C` / `Ctrl+Shift+C` on the engagement page copies the highest-severity finding via the same formatter (`findingToMarkdown`). Stays out of the form-input early-return so the shortcut works mid-typing.
- **Default credentials helper (#10).** When a port resolves to a KB entry with `default_creds[]`, `PortDetailPane` surfaces a **Default Credentials** panel under known vulns. Each row shows `user / pass` plus a per-row **hydra** button that copies an interpolated invocation (`hydra -l … -p … -s {port} {host} {service}`). Hydra service detection covers the common 17 service slugs; unknown services fall back to a `<service>` placeholder.
- **Open in editor (#12).** Opt-in `vscode://file/…` link on the engagement header. Toggle lives in `/settings → Editor integration`; persisted per-machine via `localStorage`. Path resolves to `${NEXT_PUBLIC_RECON_LOCAL_EXPORT_DIR}/${slug}` where the slug is a lowercase-alnum-hyphen rewrite of the engagement name. Off by default — caveat (only works if VS Code is installed) called out in the toggle description.
- **Search severity filter chip (#13).** `GlobalSearchModal` gains a chip group `[ all ] [ critical ] [ high ] [ medium+ ]` between the input and the results. Active chip narrows hits to finding-kind rows at or above the chosen level via `searchEngagements(db, q, limit, severity)`. Default `all` preserves v1.3 behaviour.
- **Cheat-sheet enrichment (#14).** `CheatSheetModal` shortcuts grouped by scope (Global / Engagement page / Findings) and expanded to cover `n`, `/`, `⇧ ⌘ F`, `⇧ ⌘ C` alongside the original four port-context bindings.
- **Resume-here banner (#15) (Migration 0015).** Two new columns on `engagements`: `last_visited_at TEXT NULL`, `last_visited_port_id INTEGER NULL`. Engagement page stamps both on every render via `touchEngagementVisit`; the landing page reads the most recent visit (≤ 7 days, soft-deleted excluded) and renders a `ResumeBanner` above the paste form with a deep-link to `/engagements/:id?port={portId}`.
- **OS chip on the heatmap toolbar.** Active host's OS + accuracy now rides the "Attack Surface" header so operators don't have to scroll to the OS Detection panel to know whether they're hitting Windows or Linux.

### Changed

- **Heatmap tile click no longer scrolls the viewport.** Selecting a port just flips the active id; the detail pane is already onscreen and yanking the scroll position fights muscle memory.
- **Notes textarea placeholder.** Dropped the misleading "press N to add" hint — the `n` shortcut focuses the sidebar filter, not the active port's notes.
- **Sidebar version chip** flipped from `v1.3` → `v1.4`.

### Migrations

- **0015** `engagements.last_visited_at TEXT NULL` + `engagements.last_visited_port_id INTEGER NULL`. Additive — no backfill, no index.

### Tests

- 456 / 456 passing.

## [1.3.0] — 2026-05-01

Data safety + writeup release. Engagement deletion is no longer a one-shot cascade — it goes to a recycle bin in `/settings` and only the explicit "Delete forever" affordance there hits the destructive path. Engagements gain a free-form writeup body that lands in every export.

### Added

- **Recycle bin / soft delete (Migration 0013).** `engagements.deleted_at TEXT NULL`. Sidebar / palette **Delete** now sets `deleted_at = now()` instead of cascading; the row drops out of `listSummaries`, `getById`, and the global FTS5 search modal but every child row stays intact. New `/settings → Recently deleted` section lists soft-deleted engagements with **Restore** (reversible) and **Delete forever** (cascade). New routes: `POST /api/engagements/:id/restore`, `DELETE /api/engagements/:id?force=true`. Default DELETE behaviour changed from hard cascade to soft delete.
- **Engagement writeup field (Migration 0014).** `engagements.writeup TEXT NOT NULL DEFAULT ''`. Collapsible "Writeup" section above Findings on the engagement page; plain `<textarea>` with debounced auto-save (~600ms after typing stops) plus a manual **Save now** button. PATCH route extends to accept `writeup` (max 100 KB). Markdown export prepends `## Writeup\n\n${writeup}\n\n---` between the H1 and the per-host blocks. SysReptor adds `data.notes`; PwnDoc adds `executive_summary` (block scalar so newlines survive). All export embeds are gated on the writeup being non-empty so legacy round-trips stay byte-identical.

### Changed

- **Sidebar / palette delete copy** updated to reflect the new behaviour ("Move to recycle bin" instead of "Delete permanently"; description points operators at /settings → Recently deleted).
- **Sidebar version chip** flipped from `v1.2` → `v1.3`.

### Migrations

- **0013** `engagements.deleted_at TEXT NULL`. Additive — no backfill, no index.
- **0014** `engagements.writeup TEXT NOT NULL DEFAULT ''`. Additive — no backfill.

### Tests

- 456 / 456 passing. New: soft-delete + restore + listDeletedSummaries contracts; getById hides soft-deleted rows; hard delete still cascades; writeup roundtrip; markdown emits `## Writeup` only when non-empty; markdown omits the section on empty writeup.

## [1.2.0] — 2026-05-01

Portfolio management release. The sidebar gains tags, archive, bulk-filter chips, and a friendly clone dialog. The heatmap learns to pin operator-flagged ports.

### Added

- **Engagement tags + archive (Migration 0011).** Free-form lowercase tags (max 16 per engagement, ≤32 chars each, dedup) render as monospace chips in the sidebar and feed a stackable filter strip. The Active/Archived sekme toggle hides archived engagements by default; archived rows still cascade-delete and stay in FTS. Kebab gains **Edit tags…** and **Archive/Restore from archive**. `PATCH /api/engagements/:id` accepts `tags`, `is_archived`, and `name` with per-field validation.
- **Bulk-filter chips.** A new chip strip above the engagement list — **Coverage 0%**, **Risk ≥ high**, **Has findings** — stacks (AND) with the sekme toggle, tag chips, and text query. `listSummaries` now pre-aggregates `findings_count` and `high_findings_count` so the chips render without a per-row JOIN.
- **Clone name override (`CloneEngagementDialog`).** Sidebar **Duplicate** opens a shadcn AlertDialog with the input pre-filled `${name} (copy)` so the operator picks the new name up-front instead of a follow-up rename. Submitting clears to fall back to the API default; Enter submits.
- **Port starring (Migration 0012).** Every heatmap tile gains a ★ toggle. Starred ports lift to the top of their host group, sort stable thereafter; idle ★ stays subtle (faint outline) until hover. `PATCH /api/engagements/:id/ports/:portId` accepts `{ starred: boolean }`. UI state is optimistic; failure reverts and toasts.

### Changed

- **Sidebar version chip** flipped from `v1.0` → `v1.2`.

### Migrations

- **0011** `engagements.tags TEXT NOT NULL DEFAULT '[]'` + `engagements.is_archived INTEGER NOT NULL DEFAULT 0` + index `engagements_is_archived_idx`. Additive — no backfill required.
- **0012** `ports.starred INTEGER NOT NULL DEFAULT 0`. Additive — no backfill, no index (sort already runs over all open ports).

### Tests

- 449 / 449 passing. New: `togglePortStar` / `setPortStar` engagement-scope guard; `listSummaries` aggregates `findings_count` + `high_findings_count`.

## [1.1.0] — 2026-04-26

### Added

- **One-click "Add as finding" from KB known_vulns and searchsploit hits.** Every known-vuln row and every exploit-db lookup result now exposes a `+ finding` button. Clicking stages a prefill in the UI store (severity from the KB risk tier, CVE auto-extracted from the note/title, port scope locked to the active port) and `FindingsPanel` auto-opens its modal pre-populated.
- **Sidebar engagement actions (hover-kebab).** Every sidebar row reveals a kebab on hover with **Rename** (free-form label override via `PATCH /api/engagements/:id`), **Duplicate** (deep-copy SQL transaction — every child row gets fresh primary keys; the clone is fully independent), and **Delete** (shadcn `AlertDialog` confirmation, no native `confirm()`). Active row keeps the kebab visible at all times.
- **Command palette parity** (`⌘K`). Settings (Navigation), plus Add finding, Re-import, Export findings as CSV, Export as SysReptor, Export as PwnDoc, and Delete engagement (Actions). Footer counter now reads `10 actions` on engagement pages.
- **Engagement clone** — `POST /api/engagements/:id/clone` (also wired into the sidebar Duplicate menu). Single transaction copies engagements, hosts, ports, port_scripts, port_commands, check_states, port_notes, port_evidence, findings, and scan_history with six per-table id maps remapping foreign keys. `findings.evidence_refs` JSON is rewritten through the evidence id map. The clone is fully independent — deleting the source no longer reaches it.
- **`/settings/kb` validation editor** — paste a YAML KB entry, validate against `KbEntrySchema`, and (with `RECON_KB_USER_DIR` configured) save it to the user dir. Field-level Zod issues surface inline; save uses a strict alnum/`-`/`_` filename allowlist.
- **KB hot-reload** — `getKb()` cached singleton with `fs.watch` on the shipped + user KB directories. A burst of editor saves flips a "dirty" flag that the next `getKb()` call rebuilds, so user YAML edits surface without a dev-server restart. `invalidateKb()` exposes a manual hook so the validate route's save path makes the operator's own request see their new entry immediately.
- **Migration safety net.** Boot snapshots the live DB to `data/recon-deck.db.backup-pre-NNNN` via `VACUUM INTO` whenever the journal lists more entries than `__drizzle_migrations` has applied, wraps `migrate()` in try/catch with a copy-pasteable rollback message, and runs `PRAGMA integrity_check` + `PRAGMA foreign_key_check` after a real migration so a partially applied schema fails boot loudly instead of serving requests against a half-migrated DB. Helpers (`countAppliedMigrations`, `takePreMigrationSnapshot`, `verifyDbIntegrity`) live in `src/lib/db/migration-safety.ts`.
- **shadcn `AlertDialog`** for engagement deletion. Replaces native `window.confirm()` in both the sidebar hover-kebab and the command palette so MCP browser tooling can drive it, focus stays trapped, and the dark-mode theme covers it.
- **CHANGELOG.md** (this file).

### Changed

- **Migration 0010 — `port_scripts.host_id`.** Multi-host engagements no longer collapse host scripts onto the engagement: each row now carries a `host_id` (FK → `hosts.id`, ON DELETE CASCADE) so `smb-os-discovery` on DC01 stays distinct from `smb-os-discovery` on ws01. Port-level scripts mirror the owning port's `host_id`; engagement-level AutoRecon artifacts keep `host_id` NULL because they're not host-scoped. Existing rows backfilled at migration time. The engagement page now filters `hostScripts` by `activeHostId` so the Host-Level Findings card scopes to whichever host the operator activated.
- **KB consumers migrated to `getKb()`** — `app/layout.tsx`, `app/engagements/[id]/page.tsx`, `app/engagements/[id]/report/page.tsx`, and `app/api/engagements/[id]/export/[format]/route.ts` no longer call `loadKnowledgeBase()` at module scope; they go through the cached singleton so user YAML edits picked up by `fs.watch` surface in every render path.
- **Sidebar / palette delete handlers** now call `router.refresh()` after a successful DELETE so the RSC tree drops the row immediately. `router.push('/')` alone kept the cached layout segment.
- **`engagementContext`** gained a required `engagementName` field (drives the destructive Delete dialog copy in the command palette).

### Fixed

- **Stale sidebar after engagement delete from the command palette.** Previously the deleted row stayed visible until manual reload; now `router.refresh()` forces the layout to re-fetch.

### Tests

- 410 → **439** unit tests (+29).
  - Sidebar rename (2): label override + unknown-id 404.
  - Migration safety (10): apply count, journal count, snapshot idempotency, label padding, integrity check happy path + FK-violation failure.
  - Multi-host attribution (2): host scripts + port-level scripts attributed to owning host on `createFromScan`.
  - Engagement clone (3): deep-copy multi-host with isolated ids, post-delete isolation, default name format.
  - KB cached singleton (3): shipped resolution, `invalidateKb` rebuild, override path bypasses cache.
  - `/api/kb/validate` (8): missing yaml field, invalid YAML, schema mismatch, dry-run summary, save without env, traversal-prone filename, save + invalidate, `.yaml` suffix stripping.

### Database

- Schema version `0009` → `0010` (`port_scripts.host_id` migration). Pre-migration snapshot at `data/recon-deck.db.backup-pre-0010` is automatic.

### Breaking

- **Default port `3000` → `13337`.** Picked to dodge the dev-server crowd on 3000/8080 (Next.js / React / Grafana / etc.). Container image, install.sh, docker-compose.yml, smoke-test.sh, the host-header allowlist default in `host-validation.ts`, and all docs migrated together. Existing users running on `:3000` should add `-e PORT=3000` (and adjust their `-p` mapping) on their next pull, or just open `http://localhost:13337` after a rebuild. `npm run dev` and `npm run start` both bind `13337` now too. Lint-fix for `app/settings/commands/page.tsx` apostrophes (production build was failing on `react/no-unescaped-entities`).

## [1.0.0] — 2026-04-26

Initial public release. Multi-host engagements, AutoRecon import, KB-driven port cards, AD tooling, six export formats, FTS5 cross-engagement search, evidence pane, findings catalog. See git history for the v1.0 commit log.
