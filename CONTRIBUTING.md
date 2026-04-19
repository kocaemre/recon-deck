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

- Version `1` is the only accepted value in v1.0.
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
- **"Can you add AI / exploit suggestions?"** No, not in v1.x.
- **"Is there a mobile app?"** No. Desktop-only — pentesting happens on laptops.

Each of these has a longer rationale in [`ROADMAP.md`](ROADMAP.md).

---

## Security Issues

Do **not** open a public issue or PR for a security vulnerability. Follow the
coordinated-disclosure steps in [`SECURITY.md`](SECURITY.md):

- Email: `emrekoca2003@gmail.com`
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
