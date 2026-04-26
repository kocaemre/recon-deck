# Changelog

All notable changes to recon-deck. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
