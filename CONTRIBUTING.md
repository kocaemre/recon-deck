# Contributing to recon-deck

Thanks for considering a contribution. recon-deck is a solo-maintainer project with
a deliberately narrow scope — that shapes both what gets merged and how review is
conducted. This document sets expectations before you open a PR so nobody's time
is wasted.

If you're new here, start by reading [`README.md`](README.md) for the product
pitch, [`ROADMAP.md`](ROADMAP.md) for what's in and out of scope, and
[`SECURITY.md`](SECURITY.md) for the threat model.

---

## What Kind of Contributions Land

In decreasing order of likelihood to get merged:

1. **New or improved knowledge-base entries** (`knowledge/ports/*.yaml`). High
   signal, low review friction — see [KB Contribution Rules](#kb-contribution-rules)
   below.
2. **Bug fixes** against an existing plan's acceptance criteria or a reproducible
   behavioural defect. Include a failing test when feasible.
3. **Parser edge-case fixtures** under `tests/fixtures/`. Real-world nmap output
   that breaks the parser is gold — attach the raw paste (sanitized) and describe
   the failure mode.
4. **Documentation fixes** — typos, broken links, unclear wording, missing env-var
   docs. Small PRs, fast turn-around.
5. **Feature work** against items explicitly listed on [`ROADMAP.md`](ROADMAP.md)
   as "candidates." For anything not on the roadmap, open a discussion issue
   **first** — don't sink hours into code that won't be merged. See
   [Out-of-Scope Requests](#out-of-scope-requests).

---

## KB Contribution Rules

The knowledge base is the heart of recon-deck. Every port card renders from one
YAML file. Contributing KB entries is the highest-leverage way to help the
project, and it's also where the schema and license discipline is strictest.

### Schema

Every KB file is a YAML document validated against `KbEntrySchema` in
[`src/lib/kb/schema.ts`](src/lib/kb/schema.ts). The canonical shape:

```yaml
schema_version: 1
port: 445
service: smb
protocol: tcp           # tcp | udp
risk: medium            # info | low | medium | high | critical
aliases:                # alternate service names nmap may emit
  - microsoft-ds
  - netbios-ssn
quick_facts:
  - "SMB enumeration starts with null-session checks and share listing"
checks:
  - key: smb-null-session           # stable key — NEVER change once shipped
    label: "Tested null-session authentication"
  - key: smb-signing-check
    label: "Checked SMB signing requirement"
commands:
  - label: "Null-session enum"
    template: "smbclient -L {IP} -N"
  - label: "SMB scan"
    template: "nmap --script smb-enum-shares,smb-os-discovery -p{PORT} {IP}"
resources:
  - title: "SMB Pentesting"
    url: "https://book.hacktricks.wiki/en/network-services-pentesting/pentesting-smb.html"
    author: HackTricks
```

### Hard Rules (CI enforces all of these)

1. **`schema_version: 1`** must be present. See [Schema Versioning](#schema-versioning).
2. **Command placeholders are limited to `{IP}`, `{PORT}`, `{HOST}`.** Anything
   else (`{TARGET}`, `{RHOST}`, `{FOO}`) is rejected by `scripts/lint-kb.ts`.
3. **URLs in `resources[]` must be `http://` or `https://`.** No `file://`,
   `data:`, `javascript:`, etc.
4. **Denylisted command patterns are rejected.** No `rm -rf`, no `curl | sh`, no
   `wget | sh`, no `/dev/tcp`, no `base64 -d | sh`, no generic `| sh`/`| bash`.
   If your command genuinely needs one of these patterns, it's almost certainly
   better suited to a user's own `/kb` override — not the shipped KB.
5. **`check.key` values must be stable strings**, never positional. Engagement
   state in SQLite is keyed on `check_key`; changing or removing a key
   **corrupts existing users' checklists**. Add new keys freely, but never
   rename or delete one that has shipped.
6. **Unknown fields are rejected.** Zod's `.strict()` mode is on every object
   schema — adding ad-hoc fields (`description`, `content`, `body`, etc.) to
   `resources[]` will fail lint. See [Links-Only Policy](#links-only-policy)
   for why.
7. **No prose copied from upstream sources.** See the next section.

Run the lint locally before opening the PR:

```bash
npm run lint:kb
```

It exits non-zero with the rule that failed and the file that caused it.

### Links-Only Policy (CC-BY-SA Discipline)

recon-deck's knowledge base **links to** upstream sources — it never copies prose
from them. This is a deliberate design constraint, not a stylistic preference.

**Why.** The primary upstream source for port methodology is
[HackTricks](https://book.hacktricks.wiki/), licensed under
[CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). CC-BY-SA is
copyleft: any work that incorporates CC-BY-SA prose inherits the CC-BY-SA
obligation, including attribution requirements and the "share-alike" clause that
would require recon-deck's own KB to ship under CC-BY-SA rather than MIT.

**The rule.** `resources[]` entries carry `title`, `url`, and `author` only. The
schema explicitly rejects `description`, `content`, `body`, or any other prose
field via Zod's `.strict()` mode. The user's browser fetches the linked page
directly at read time — recon-deck never proxies, mirrors, or caches upstream
content.

**What this means in practice.**

- Do **not** paste a HackTricks paragraph as a `quick_fact`.
- Do **not** paraphrase a HackTricks paragraph as a `quick_fact` — paraphrase
  still derives from the original and still triggers the share-alike clause in
  most legal reads.
- `quick_facts[]` entries must be your own observations or widely-known
  protocol facts that exist in many independent sources (RFCs, vendor docs,
  Wikipedia). When in doubt, link it in `resources[]` instead of quoting it in
  `quick_facts[]`.
- If a new upstream source appears, add it to [`CREDITS.md`](CREDITS.md) with
  the same "links only — no prose copied" clause.

**What's explicitly fine.** Links to upstream content, command templates you
wrote yourself, stable check labels, and URLs pointing at MIT/BSD-licensed
wordlists or payload repos (PayloadsAllTheThings, SecLists) are all welcome.
The restriction is on _prose_ — not on _pointers to prose_.

### Schema Versioning

`schema_version: 1` is required on every KB file. The field exists so the KB
format can evolve without silently breaking the loader.

**Current contract.**

- Version `1` is the only accepted value today.
- Any YAML with `schema_version: 2` (or missing the field, or a non-integer
  value) will be rejected by the Zod schema at load time. For the shipped KB
  this is a CI failure; for user overrides it's a per-file skip with a warning
  logged to stderr (see [`src/lib/kb/loader.ts`](src/lib/kb/loader.ts)).

**How a bump would work.** If the KB shape ever needs a breaking change
(e.g. `commands[].template` becomes structured instead of a string), the
procedure is:

1. Ship a new `schema_version: 2` alongside `schema_version: 1` support in the
   loader. Both versions coexist for at least one minor release.
2. Bump all shipped KB files to the new version in a single atomic PR.
3. Document the migration in `ROADMAP.md` and `CREDITS.md` (upstream notes).
4. Deprecate `schema_version: 1` support in a later major release, with a
   clearly advertised deprecation window.

**Today:** don't invent new schema_version values in your PR. If you need a
new field that the current schema doesn't allow, open a discussion issue first.

### Testing Your KB Entry

Before opening the PR:

```bash
npm run lint:kb      # schema + placeholder + denylist + URL scheme checks
npm test             # runs vitest — includes KB roundtrip test
npm run dev          # then visit the port manually in the UI
```

For a port with service aliases (e.g. nmap may emit `microsoft-ds` for SMB),
add each alias to `aliases[]` so the matcher resolves them to your entry — and
add an assertion for the mapping in `src/lib/kb/__tests__/matcher.test.ts` if
one doesn't already exist.

---

## Local Development

### Setup

```bash
git clone https://github.com/kocaemre/recon-deck
cd recon-deck
npm install
npm run dev          # → http://localhost:13337
```

The dev server hot-reloads on file changes and auto-runs Drizzle migrations
on every cold boot (see `src/lib/db/client.ts`).

### Quality gate

Run all four locally before opening a PR — CI fails on any of them:

```bash
npm run lint:kb      # KB schema + denylist + URL scheme + placeholder allowlist
npm run typecheck    # tsc --noEmit (0 errors expected)
npm test             # vitest (470+ tests across parsers, repo, export, search, KB)
npm run build        # Next.js production build (output: standalone)
```

### Test suite layout

Tests live next to the code they cover under `__tests__/` directories. The
main groups:

- `src/lib/parser/__tests__/` — XML / text / greppable parsers, plus the
  `parseAny` dispatcher. Fixtures under `tests/fixtures/parser/`.
- `src/lib/db/__tests__/` — repo functions (`createFromScan`, `getById`,
  `listSummaries`, `updateTarget`, `deleteEngagement`), client-boot
  migration smoke test, search, scan-history reconciliation, hosts.
- `src/lib/export/__tests__/` — markdown / json / html / sysreptor / pwndoc
  / findings-csv golden output + per-format multi-host assertions, plus the
  shared `loadEngagementForExport` view-model. Route-level dispatch tests
  live in the same directory.
- `src/lib/kb/__tests__/` — Zod schema, matcher (port + alias resolution),
  known-vulns substring match, wordlist placeholder interpolation.
- `tests/` — top-level fixtures + the `createTestDb` helper used by every
  repo test (in-memory SQLite + migrations applied at boot).

Run a single file with `npx vitest run <path>`; watch mode is `npx vitest`.

### Adding a Drizzle migration

The DB schema lives in `src/lib/db/schema.ts`. Migrations are hand-written
under `src/lib/db/migrations/NNNN_description.sql` and tracked in
`migrations/meta/_journal.json`. To add one (using the recent
"drop engagements.target_ip" migration as the worked example):

1. Decide the next sequential number — look at the highest `NNNN_*.sql`
   file. Don't reuse a number even after a rebase / branch reset.
2. Write the SQL file with one statement per `--> statement-breakpoint`
   marker. Drizzle's runner splits on this.
3. If the migration drops or renames a column referenced by an existing
   trigger (e.g. the FTS5 triggers in `0002_add-search-index.sql`),
   `DROP TRIGGER` and `CREATE TRIGGER` first, then `ALTER TABLE DROP COLUMN`.
   SQLite refuses the ALTER otherwise.
4. Append a new entry to `migrations/meta/_journal.json` — copy the latest
   entry's shape, increment `idx`, set a fresh `when` (any monotonically
   increasing integer works; the existing entries use `1777Nxxxxxxxx`).
5. Update `schema.ts` to reflect the new shape — the file is the source of
   truth for application-side types. Drop fields you removed; add fields
   you added.
6. Run `npm test` and `npm run typecheck`. Repos / view-models / fixtures
   that referenced the removed columns will fail loudly — update them
   together in the same PR.
7. The first dev-server boot after pulling the migration applies it
   automatically; you can sanity-check with `sqlite3 data/recon-deck.db
   ".schema engagements"`. Boot also takes a `VACUUM INTO` snapshot to
   `data/recon-deck.db.backup-pre-NNNN` before applying anything new
   — see "Migration safety and recovery" below.

### Migration safety and recovery

Every dev-server boot runs through `src/lib/db/client.ts`, which wraps
drizzle's `migrate()` with three guard rails:

- **Pre-migration snapshot.** When the journal lists more entries than
  `__drizzle_migrations` has applied, the boot sequence runs `VACUUM
  INTO 'data/recon-deck.db.backup-pre-NNNN'` first. `NNNN` is the
  applied count *before* migrating, so `backup-pre-0009` means
  "captured at schema 0009". Existing snapshots are reused, never
  overwritten — the operator decides when to recycle them.
- **Try/catch around `migrate()`.** Any failure logs the error and
  the snapshot path with a copy-pasteable rollback command, then
  re-throws so the process exits instead of serving requests against
  a half-migrated DB.
- **Post-migration integrity check.** When at least one new migration
  applied, `PRAGMA integrity_check` and `PRAGMA foreign_key_check`
  run; either failing aborts boot. A clean boot emits
  `[recon-deck] Applied N migration(s); now at M.` so you can confirm
  what actually changed.

If a migration fails, the recovery path is:

```bash
# 1. Stop the dev server.
# 2. Copy the snapshot back over the live DB and clear the WAL/SHM
#    side-cars so SQLite reads from the restored file, not stale WAL.
cp data/recon-deck.db.backup-pre-0009 data/recon-deck.db
rm -f data/recon-deck.db-wal data/recon-deck.db-shm

# 3. Fix the migration SQL (and any schema.ts / repo code that
#    referenced the broken shape).
# 4. Restart the dev server. Boot will retry from the restored state.
```

If you'd rather start over from an empty DB instead of restoring,
"Resetting local state" below works the same way — it just discards
your data along with the broken migration. Snapshots written under
`data/` are gitignored (they're large, and per-machine).

The helpers (`countAppliedMigrations`, `takePreMigrationSnapshot`,
`verifyDbIntegrity`) live in `src/lib/db/migration-safety.ts` and have
unit coverage in `src/lib/db/__tests__/migration-safety.test.ts` —
add cases there if you change the boot logic.

### Resetting local state

```bash
rm -rf data/recon-deck.db data/recon-deck.db-shm data/recon-deck.db-wal
```

The next dev-server boot recreates the file and re-applies every migration
from scratch. Useful when iterating on a migration or chasing a "this
worked yesterday" bug.

### Testing in a real browser

For UI changes, `npm run dev` (binds to `127.0.0.1:13337`) and then
exercise the feature manually. There is no Playwright / e2e suite — golden-path manual checks
plus the unit tests are the contract. When the change touches:

- the engagement page → re-import flow, multi-host host switch, evidence
  drag-drop, KB known-vulns hits
- the export menu → all six formats round-trip cleanly
- the search modal → `⌃⇧F` finds expected hits across engagements
- settings → engagement delete actually wipes child rows (verify with
  `sqlite3 data/recon-deck.db "SELECT count(*) FROM ports WHERE engagement_id=N"`)

---

## PR Discipline

recon-deck is a solo-maintainer project. The review queue depth is proportional
to how much context each PR drags in. Keep PRs small, focused, and easy to read.

### Before You Open a PR

- [ ] **Read [`ROADMAP.md`](ROADMAP.md) first.** If your change lands in an
      out-of-scope area (scanners, multi-user, AI, mobile), don't open a PR —
      open a discussion issue instead.
- [ ] **One concern per PR.** Don't bundle a KB fix with a parser refactor with
      a Dockerfile tweak. Three PRs is three fast reviews; one kitchen-sink PR
      is a multi-week review.
- [ ] **Run the full quality gate locally:**
      ```bash
      npm run lint:kb
      npm test
      npm run typecheck
      npm run build
      ```
      All four must pass before the PR is opened. CI runs the same commands and
      will fail loudly if any of them regress.
- [ ] **No formatting-only noise.** Prettier is enforced in CI. Don't open a PR
      that reformats 40 files — if something looks malformatted, fix the root
      cause (usually a missing Prettier run locally).

### PR Title and Description

- **Title format:** `kind(scope): short imperative summary`, e.g.
  `feat(kb): add 5985-winrm entry`, `fix(parser): handle CDATA in nse output`,
  `docs(readme): clarify HOSTNAME env var`.
- **Description:** state the user-facing effect first, then the technical shape.
  If the PR references an issue, include `Closes #N`.
- **Screenshots or asciinema** for any UI change — even "small" ones. Review
  latency drops dramatically when reviewers don't have to `git checkout` and
  `npm run dev` to see what changed.

### Review Expectations

- Response is best-effort. This is a nights-and-weekends project with no SLA.
- Review comments are directive — "change X to Y" means change it, not "consider
  changing it." If you disagree, push back explicitly in the thread; silence
  reads as consent.
- A PR that sits for more than two weeks without a response from the author
  may be closed. Re-open it when you're ready to engage with the review.
- Draft PRs are welcome for early feedback — mark them `Draft` explicitly.

### Commit Discipline

- **Commit messages in English.** Commit-message language is not subject to
  preference — the project is English-only per
  [`ARCHITECTURE.md`](ARCHITECTURE.md) constraints.
- **Conventional-ish format:** `kind(scope): message` is strongly preferred
  (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`). This keeps the log
  grep-able and powers future changelog generation.
- **Atomic commits** — one logical change per commit. Rebase and squash noise
  before opening the PR.
- **Never commit secrets.** `.env`, API keys, tokens, private certificates —
  nothing with credentials lands in the repo, ever. Use `.env.example` for
  shape documentation.

---

## Out-of-Scope Requests

See [`ROADMAP.md`](ROADMAP.md) for the canonical out-of-scope table and the
reasoning behind each exclusion. PRs that add out-of-scope functionality will
be closed without a merge, regardless of quality.

The four most common requests the project receives, and the short answer:

- **"Can recon-deck run scans?"** No. recon-deck is post-scan workflow only.
  Run AutoRecon (or nmap directly) to generate the scan, then import.
- **"Can this be multi-user?"** No. It's a single-user local tool by design.
- **"Can you add AI / exploit suggestions?"** Not currently. The KB stays human-curated by design.
- **"Is there a mobile app?"** No. Desktop-only — pentesting happens on laptops.

Each of these has a longer rationale in [`ROADMAP.md`](ROADMAP.md).

---

## Security Issues

Do **not** open a public issue or PR for a security vulnerability. Follow the
coordinated-disclosure steps in [`SECURITY.md`](SECURITY.md):

- Email: `0xemrek@proton.me`
- GitHub Security Advisories: <https://github.com/kocaemre/recon-deck/security/advisories/new>

Expected response is best-effort within 7 days. Please wait for a response
before disclosing publicly.

---

## License

By contributing, you agree that your contribution is licensed under the MIT
License, matching the rest of the project. Knowledge-base YAML files are MIT
for structure and metadata — the linked external content at the URLs retains
its upstream license (CC-BY-SA for HackTricks, MIT for PayloadsAllTheThings
and SecLists, etc.). See [`CREDITS.md`](CREDITS.md) for the full attribution
map.

---

Thank you for taking the time to read this before opening a PR. The bar is
deliberate, not hostile — it keeps the project small, shippable, and
maintainable by one person on nights and weekends.
