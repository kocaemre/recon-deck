# recon-deck — Work Plan (internal)

> Internal handoff doc. Not user-facing. Tracks the multi-milestone plan
> agreed on after v1.1.0 ship. Update status in place; promote shipped
> items to ROADMAP.md / CHANGELOG.md when each milestone closes.
>
> Convention: `[ ]` todo, `[~]` in-progress, `[x]` done.
> Each task carries its rough effort estimate so a future session can
> chunk a milestone into a single sitting.

## Status — `2026-04-26`

- v1.1.0 shipped (tag pushed; release.yml workflow rebuild after port migration in flight)
- 9 commits ahead of v1.0; 439/439 tests; schema 0010
- WORK-PLAN.md added so a fresh context can resume from here

---

## Milestone v1.2.0 — Portfolio management

**Goal:** make 50+ engagements manageable. Tag, archive, bulk filter, port
star — the whole sidebar refactor sits inside this one milestone so the
schema migration + filter logic land together.

**Estimated effort:** 4–5 hours.

### Tasks

- [x] **#1 + #2 — Engagement tags + archive (combined)** _(2–3 sa)_ — DONE
  - Migration `0011_add-engagement-tags-and-archive.sql`:
    - `engagements.tags TEXT NOT NULL DEFAULT '[]'` (JSON array of strings)
    - `engagements.is_archived INTEGER NOT NULL DEFAULT 0`
  - Schema.ts: add `tags`, `is_archived` to `engagements` table
  - Repo: `setEngagementTags(db, id, tags[])`, `archiveEngagement(db, id, archived)`
  - API: `PATCH /api/engagements/:id` extends with `tags` and `is_archived` fields
  - View-model: `listSummaries` returns `tags`, `is_archived`
  - Sidebar UI:
    - Tag chips next to engagement name (mono, color from hash)
    - "Active / Archived" sekme toggle at top (default Active)
    - Archive count chip next to toggle
  - Engagement page: `EngagementHeader` gains "Archive" button (toast + sidebar refresh; reverse via the Archived view's "Unarchive")
  - CommandPalette actions: "Archive engagement", "Add tag…" (prompt → comma-separated)
  - Tests:
    - Repo: tag set/clear roundtrip, archive flag roundtrip
    - View-model: `listSummaries` exposes new fields
    - Cascade unaffected (delete still works on archived rows)

- [x] **#4 — Bulk filter chips** _(30 dk)_ — DONE
  - Sidebar above engagement list: chip group `[ All ] [ Coverage 0% ] [ Risk ≥ high ] [ Has findings ]`
  - Chips are toggles; multiple can stack (AND logic)
  - State client-side only (Zustand or local state)
  - Plays nicely with the Active/Archived toggle from #1+#2

- [x] **#3 — Clone name override UX** _(15–30 dk)_ — DONE
  - Sidebar Duplicate menu → opens shadcn AlertDialog (similar pattern to delete) with input pre-filled `${name} (copy)`
  - Submit calls existing `POST /api/engagements/:id/clone` with `{ name }` body
  - Drop the unconditional "(copy)" suffix; if user clears the field, fallback to existing default

- [x] **#11 — Port starring** _(30 dk)_ — DONE
  - Migration `0012_add-port-starred.sql`: `ports.starred INTEGER NOT NULL DEFAULT 0`
  - Schema.ts + repo: `togglePortStar(db, portId)` (returns new state)
  - API: `PATCH /api/engagements/:id/ports/:portId` accepts `{ starred: boolean }`
  - Heatmap tile: ★ icon top-right when `starred=true`; click toggles
  - Sort: starred ports first within their host group, then by port number
  - Tests: repo toggle roundtrip, sort order

### Closeout

- [x] Bump `package.json` → `1.2.0`, add CHANGELOG entry
- [x] Tag `v1.2.0`, push, watch release.yml
- [x] Update ROADMAP.md: drop "v1.1 candidates" entries that are now done; add a brief "v1.2.0 — portfolio management" line

---

## Milestone v1.3.0 — Data safety + writeup

**Goal:** stop catastrophic accidental deletes; give writeups a home.

**Estimated effort:** 3–4 hours.

### Tasks

- [x] **#6 — Recycle bin / soft delete** _(2–3 sa)_ — DONE
  - Migration `0013_add-engagement-soft-delete.sql`: `engagements.deleted_at TEXT NULL`
  - DELETE route flips `deleted_at = now()` instead of cascading; soft-deleted rows excluded from `listSummaries` by default
  - Settings adds "Recently deleted" tab listing soft-deleted engagements with **Restore** + **Delete forever** buttons
  - "Delete forever" hits the actual cascade DELETE
  - Auto-purge skipped intentionally (single-user, manual is safer)
  - FTS5 index hides soft-deleted rows (trigger update)
  - Tests: soft delete keeps row, restore brings it back, hard delete cascades

- [x] **#9 — Engagement writeup field** _(1–2 sa)_ — DONE
  - Migration `0014_add-engagement-writeup.sql`: `engagements.writeup TEXT NOT NULL DEFAULT ''`
  - Engagement page: collapsible "Writeup" section above Findings (or in EngagementExtras)
  - Plain `<textarea>` first pass (markdown preview deferred; if user complains, add `react-markdown` later)
  - PATCH route accepts `writeup` field
  - Markdown export: top of doc gets `## Writeup\n\n${writeup}\n\n---\n` block when non-empty
  - SysReptor / PwnDoc: writeup → `notes` or `executive_summary` field
  - Tests: writeup roundtrip; export embeds when populated

### Closeout

- [x] Bump → `1.3.0`, CHANGELOG entry, tag, ROADMAP update

---

## Milestone v1.4.0 — Polish bundle

**Goal:** six small UX wins in one release.

**Estimated effort:** 3–4 hours.

### Tasks

- [x] **#5 — Findings → Markdown copy** _(30 dk)_
  - In `FindingsPanel`, every finding row gets a small "copy md" icon
  - Generates `### {severity}: {title}\n\n{description}\n\n_CVE:_ {cve}\n_Port:_ {host:port}` block
  - `Cmd+Shift+C` shortcut in `KeyboardShortcutHandler` copies the FIRST finding (or all if multi-select arrives later)

- [x] **#10 — Default credentials helper** _(1 sa)_
  - KB entries already carry `default_creds[]`
  - When a port resolves to a KB entry with non-empty `default_creds`, surface an "**Try default creds**" panel under PortDetailPane
  - Each cred row shows username/password + a "Generate hydra command" button
  - Generated snippet copied to clipboard: `hydra -l {user} -p {pass} {host} {service}` with `{host}` / `{service}` interpolated
  - Toast on copy

- [x] **#12 — Open in editor** _(45 dk)_
  - Settings adds opt-in toggle: "Enable 'Open in editor' links" (default off)
  - When on, every evidence row + engagement page header shows a small `vscode://file/{path}` link
  - Path resolves to a hypothetical local export dir (configurable via `RECON_LOCAL_EXPORT_DIR` env)
  - Doc the protocol + caveat: only works if VS Code is installed and protocol is registered

- [x] **#13 — Search severity filter chip** _(30 dk)_
  - GlobalSearchModal: chip group `[ all ] [ critical ] [ high ] [ medium+ ]`
  - When chip active, FTS5 query joins on `findings` and filters by `severity >= chosen`
  - Default = all (current behavior)

- [x] **#14 — Cheat-sheet enrichment** _(20 dk)_
  - `CheatSheetModal` currently lists Cmd+K, ?
  - Expand to: `n`, `/`, `j`, `k`, `x`, `c`, `Cmd+K`, `Cmd+Shift+F`, `Cmd+Shift+C` (after #5 lands)
  - Group by scope (Global / Engagement / Findings)

- [x] **#15 — Last-active "resume here" banner** _(1 sa)_
  - Migration `0015_add-engagement-last-visited.sql`: `engagements.last_visited_at TEXT`, `engagements.last_visited_port_id INTEGER NULL`
  - Engagement page server component bumps these on every render
  - Landing page (`/`) shows a banner above the paste form: `Resume {engagement} → {port} (2h ago)` — links to `/engagements/:id?host=…&port=…`
  - Hide banner if last visit > 7 days ago

### Closeout

- [x] Bump → `1.4.0`, CHANGELOG entry, tag, ROADMAP update

---

## Milestone v1.9.0 — First-run onboarding

**Goal:** new operators land in recon-deck and have a self-explanatory
first 60 seconds. No more "where do I paste nmap?" → "what's a KB?" →
"why is `/settings/wordlists` empty?" friction.

**Estimated effort:** TBD — depends on Claude Design's flow. Pencil in
3-5 hours; revisit once the design lands.

**Status:** parked. Awaiting Claude Design output. Operator (you) will
hand back a flow / wireframe / layout spec; this section gets fleshed
into concrete tasks at that point.

### Scope (proposed — confirm after design)

- **First-run detection.** Boot path checks an `app_state.onboarded_at`
  row (new `app_state` k/v table) — null → show onboarding overlay,
  non-null → skip. Migration ~0017 (or whatever the next slot is at
  ship time).
- **Tour content.** Walk the operator through the four primary surfaces:
  1. Paste panel + `/api/import/autorecon` zip drop
  2. Engagement detail (heatmap, port detail, findings, writeup)
  3. Settings (KB editor, recycle bin, editor integration toggle)
  4. Command palette (⌘K) + `?` cheat sheet
- **Configurable paths.** Onboarding offers to set:
  - `RECON_LOCAL_EXPORT_DIR` (#12 vscode link) — surfaced as a friendly
    field instead of a build-time env. Persisted to `app_state` so it
    survives container restarts.
  - Wordlist override base path (existing `/settings/wordlists` flow,
    but introduced inline).
  - Optional: KB user dir (`RECON_KB_USER_DIR`).
- **Update check.** One-shot fetch against the GitHub Releases API
  (`/repos/0xemrek/recon-deck/releases/latest`) at first-run end.
  Compare `tag_name` against `process.env.npm_package_version`. Show
  a non-blocking toast if behind. Strictly opt-in — surface a checkbox
  on the onboarding's last step. **Important:** outbound HTTP, so the
  check must be opt-in (OPS-03 offline-by-default posture).
- **Skip / replay.** A "Skip onboarding" link on every step, plus a
  `/settings → Replay onboarding` button that wipes `onboarded_at`.

### Open questions for design

- Modal-overlay tour (highlight + arrow) vs dedicated `/welcome` route?
- Should we ship a sample engagement (a fixture nmap file the user
  can import in one click) so the tour has real data to point at?
- "Skip" affordance in plain view, or buried behind a confirm so
  operators don't blow past the path-config step by accident?

### Closeout (TBD)

- Bump → `1.9.0`, CHANGELOG entry, tag, ROADMAP "Shipped" line.

---

## Milestone v2.0.0 — Screenshot annotation

**Goal:** PoC-quality screenshots without leaving recon-deck.

**Estimated effort:** 3–4 hours. Major version bump because UI surface
expands meaningfully (new modal, new component dependency).

### Tasks

- [x] **#7 — Screenshot annotation** _(3–4 sa)_ — DONE (native Canvas, zero-dep)
  - Add `tldraw` (or fabric.js if tldraw is too heavy — measure bundle delta first)
  - Evidence pane gets an "**Annotate**" button per row
  - Click opens fullscreen modal with the image loaded onto the canvas
  - Save button exports new PNG → POST a NEW evidence row (don't overwrite the original; chain with `parent_evidence_id`)
  - Migration `0016_add-evidence-parent-link.sql`: `port_evidence.parent_evidence_id INTEGER NULL` (FK self-reference)
  - Tests: parent linkage roundtrip, original survives, annotated child renders

### Closeout

- Bump → `2.0.0`, CHANGELOG entry, tag, ROADMAP major-version note

---

## Out-of-band ideas (not on the milestones above)

Things that came up but aren't on a numbered list yet — capture so they
don't leak away:

- **v2 — Popup checklist editor** _(user request, 2026-05-01)_ — operator
  wants to spawn a quick popup against an active port to add a custom
  one-shot checklist item (vs. editing the YAML KB). Live alongside the
  existing kebab actions; persist to a per-port `custom_checks` table.
- ~~**KB hacktricks link audit + sweep**~~ — DONE (commit `d4f9…`,
  2026-05-01). 33 YAML files + 3 fixtures rewritten against the
  HackTricks-wiki/hacktricks master tree (folder slugs →
  `/<slug>/index.html`, single .md slugs → `/<slug>.html`). 27/27
  unique URLs return real titles. Follow-up: still want the
  `npm run kb:check-links` CI guard so we don't re-discover this from
  scratch the next time HackTricks moves.

- ~~**API rate limit middleware**~~ — DONE in v2.0.1 (token bucket,
  per-IP, localhost-bypass-by-default, `RECON_RATE_LIMIT` env knobs).
- ~~**`npm audit fix` for `fast-xml-parser`**~~ — DONE in v1.4.1.
- ~~**`listSummaries` N+1**~~ — DONE in v2.0.1 (single SELECT with 6
  pre-aggregated derived tables; O(1) queries instead of O(N)).
- **Tag color from hash function** — use the same hash → HSL pattern
  the heatmap uses for risk colors so chips stay readable in dark mode.

## Already done (v1.1.0 highlights — do NOT redo)

Quick reference so a fresh session can grep and avoid re-implementing:

- Sidebar hover-kebab (Rename / Duplicate / Delete)
- shadcn `AlertDialog` for delete confirmations
- Engagement clone (deep-copy SQL transaction)
- Migration safety (VACUUM INTO snapshot + integrity_check + foreign_key_check)
- KB hot-reload (cached singleton + fs.watch)
- `/settings/kb` validation editor
- "Add as finding" buttons on KB known_vulns + searchsploit hits
- Command palette parity (Settings, Add finding, Re-import, Delete, 6 export formats)
- Sidebar `n` and `/` shortcuts (post-v1.1.0 fix)
- Default port `3000` → `13337` migration
- Schema `0010` (`port_scripts.host_id` for multi-host attribution)
