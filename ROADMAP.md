# recon-deck Roadmap

This is the public roadmap for recon-deck: what's planned for upcoming
releases, what's explicitly **not** on the path, and the short answers to the
feature requests this project receives most often. Read this before opening an
issue asking for something.

The project's scope is narrow by design. The narrowness is the product. If a
feature doesn't appear here, it is almost certainly in the [Out of Scope](#out-of-scope)
section below — check there first.

For the current feature set and status, see [`README.md`](README.md).

---

## Shipped

- **v1.1.0** (2026-04-26) — KB hot-reload, command-palette parity, sidebar hover-kebab (Rename / Duplicate / Delete), engagement clone, migration safety net, port `13337` as default.
- **v1.2.0** (2026-05-01) — Portfolio management. Engagement tags + archive (Migration 0011), bulk-filter chips (Coverage 0% / Risk ≥ high / Has findings), inline clone-name AlertDialog, port starring with heatmap ★ + sort (Migration 0012).
- **v1.3.0** (2026-05-01) — Data safety + writeup. Soft-delete recycle bin (Migration 0013) with /settings Restore + Delete forever; engagement writeup field (Migration 0014) with debounced auto-save and Markdown / SysReptor / PwnDoc export embeds.
- **v1.4.0** (2026-05-01) — Polish bundle. Findings → Markdown copy (per-row + ⇧⌘C), default credentials helper with hydra command generator, opt-in vscode:// link, search severity chip, grouped cheat-sheet, resume-here banner (Migration 0015) with 7-day window, OS chip on the heatmap toolbar.
- **v1.4.1** (2026-05-01) — Patch. `npm run kb:check-links` script, HackTricks 2026 site rebuild relink (`hacktricks.wiki/en/...html`), tag color FNV→HSL, `fast-xml-parser` 5.7.2 advisory bump.
- **v2.0.0** (2026-05-01) — Major. Screenshot annotation (#7, Migration 0016). Native HTML5 Canvas modal with Box / Arrow / Pencil / Text tools, 5-color palette, undo stack. Save chains a NEW evidence row via `parent_evidence_id` so the original always survives. Zero new dependencies.
- **v2.0.1** (2026-05-01) — Patch. Per-IP rate limiter on `/api/*` (defense-in-depth, LAN-exposure case). `listSummaries` refactored to a single JOIN query (O(1) instead of O(N) subqueries per row).
- **v2.1.0** (2026-05-01) — Minor. First-run onboarding at `/welcome` (4 steps · `app_state` singleton, Migration 0017). Sample engagement with `SAMPLE` chip + Discard button (Migration 0018). `/settings` Replay onboarding + GitHub release-check toggle. `UpdateAvailableToast` (notify-only, opt-in). Desktop-only viewport guard at `< 1280px`. KB user dir + local export dir now DB-driven (env vars are legacy fallback).

## v2.2+ Candidates

These are ideas on the short list for upcoming releases. Everything in this
section is a **candidate**, not a commitment — priorities will shift based on
user feedback. PRs against these items are welcome; please open a discussion
issue first so scope is aligned before code is written.

| Candidate                          | Why                                                                                           | Status        |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | ------------- |
| "Check all" / bulk-toggle in port checklist | Operator workflow polish — one click to mark every KB-derived check (or every unchecked one) on the active port. Should round-trip through the existing `setCheck` server action so undo / re-import behaviour stays consistent. | Scoped         |
| Collapsible sidebar                 | Toggle button in the brand row that hides the engagement list and shrinks the chrome to an icon rail. Persists in `app_state` so the layout doesn't reset between sessions. Useful on smaller laptops + when working a single engagement. | Scoped         |
| Bind-mount AutoRecon folder         | Power-user path for users who don't want to zip every engagement. Chromium-only today via File System Access API — needs a Firefox fallback. | Scoped         |
| Light mode                          | recon-deck currently ships dark-only. `next-themes` is already wired in for this exact reason. | Scoped         |
| Cosign / sigstore image signing     | Increases supply-chain trust for the GHCR image beyond `GITHUB_TOKEN` provenance.             | Scoped         |
| Nonce-based CSP                     | Replace `script-src 'unsafe-inline'` with per-request nonce in middleware. See SECURITY.md.    | Scoped         |
| Egress-blocking CI guard            | Run the container in a network-null-routed CI job, assert zero outbound packets. Enforces OPS-03 automatically. | Backlog       |
| Additional parser support (gobuster, nikto, feroxbuster) | Long-tail recon tools. Low priority — AutoRecon already orchestrates most of them. | Backlog       |
| KB contribution dashboard           | In-repo view of which ports have seeded KB entries vs. fall through to `default.yaml`, to make new-contributor targeting obvious. | Backlog       |
| Changelog generator from commit log | Powered by the Conventional-ish commit format in CONTRIBUTING.md.                             | Backlog       |

---

## v2.x Future Considerations

These are larger directions on the long horizon — not scoped, not committed,
deferred until current feature work settles. Listed here so users know
the maintainer is aware of the request and has a view on it.

| Direction                                            | What it might look like                                                                                                                                                                                                                                                                                                                                       | Constraints that must hold                                                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local-LLM-assisted enrichment (opt-in, offline)       | A small, user-supplied local model (Ollama, llama.cpp, or a self-hosted endpoint the user explicitly configures) suggesting commands, summarising NSE script output, or proposing checklist items derived from the existing KB entries. Default off. Surfaced only when the user enables it and points the app at a model endpoint they control. | Must preserve OPS-03 (no outbound HTTP from the recon-deck process — model lives on user's machine or LAN). Must not bundle a model into the Docker image. Must surface clearly when an inference is AI-derived vs. KB-derived. Must not auto-execute suggestions. |

If a clean, bounded design for this emerges (small local model, opt-in,
offline, well-labelled outputs), it becomes a real v2 candidate. Until then
this is a direction, not a plan.

---

## Out of Scope

These are items recon-deck will **not** add. The exclusion is deliberate and
predates any specific request — scope discipline is how a solo-maintainer tool
stays shippable.

| Request                                  | Decision                | Rationale                                                                                                              |
| ---------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Running scans (nmap, gobuster, etc.)     | **Won't add.**          | recon-deck is post-scan workflow only. It competes with nothing, complements AutoRecon/HackTricks. Running scans would duplicate AutoRecon's job, expand the threat model, and force long-running background processes into a tool designed around synchronous render. |
| Multi-user / team collaboration          | **Won't add.**          | Single-user self-hosted tool by design. Multi-user requires auth, RBAC, per-user state scoping, share links, conflict resolution — every one of those items expands the maintenance surface 10x and violates the "runs locally in a container" core posture. |
| Authentication / login / users           | **Won't add.**          | Local tool. Auth adds friction and threat surface for no benefit. If you need multi-user, run multiple containers behind a reverse proxy you control. |
| AI / LLM / exploit suggestions           | **Not in v2.x today.** Direction noted — see [v2.x Future Considerations](#v2x-future-considerations). | The product is deterministic and offline on purpose. A future path may exist via a user-supplied local model (Ollama / self-hosted endpoint), opt-in, with AI-derived output clearly labelled — but this is a design problem, not a backlog item. |
| Mobile app / mobile-first UI             | **Won't add.**          | Pentesting happens on laptops. Mobile recon is rare, the UI wouldn't fit, and the browsers-in-scope targeting (Chromium + Firefox last 2 majors) excludes mobile Safari anyway. |
| Cloud-hosted / SaaS version              | **Won't add.**          | Self-hosted is the entire distribution model. A hosted offering would require auth, billing, multi-tenant isolation, and a separate threat model — an entirely different project. |
| PostgreSQL or non-SQLite DB              | **Won't add.**          | Would kill self-host simplicity. SQLite is the whole reason the Docker image is one file, one process, one volume. |
| Split frontend/backend services          | **Won't add.**          | Next.js App Router handles both in one process. Splitting would double the deploy surface for zero user benefit. |
| Obsidian plugin                          | **Won't add.**          | Niche audience, doesn't replace a browser-based workflow. The Markdown export (Obsidian-compatible frontmatter) covers the interop need. |
| Plugin / scripting API                   | **Not planned.**        | The extensibility surface is the KB YAML. A programmatic plugin API would open a sandboxing and security-review burden that a solo-maintainer project cannot sustain responsibly. _Note: this row replaced the old "in-UI KB editor — won't add" entry; that one shipped in v1.x as `/settings/kb`._ |
| Reporting platform (PDF styling, client branding, issue tracker) | **Won't add.**          | recon-deck is a recon-workflow tool, not a reporting platform. The existing Markdown / JSON / HTML / print-to-PDF exports exist to feed _your_ reporting tool of choice. |
| Live collaboration / real-time sync      | **Won't add.**          | Requires multi-user (already declined) and a server-push architecture that doesn't fit the single-process, offline-by-default posture. |
| Telemetry / usage analytics              | **Won't add.**          | Violates OPS-03 (zero outbound HTTP from the app). The offline guarantee is a feature, not an oversight. |
| Auto-update install path                  | **Won't add.**          | Updates stay user-initiated via `docker pull` / `git pull` so you decide when the binary on disk changes. v2.1.0 added an _opt-in, off-by-default_ GitHub release-check toast (notify-only — surfaces a new tag, never installs anything). The toggle lives in `/settings → First-run`. |

---

## Canned Responses to Common Requests

These are the short answers to the four feature requests this project receives
most often. They're repeated here (and in [`CONTRIBUTING.md`](CONTRIBUTING.md))
because the questions are predictable and the answers are terse by design.

### "Can recon-deck run scans?"

**No.** recon-deck is post-scan workflow only. Run [AutoRecon](https://github.com/Tib3rius/AutoRecon)
(or plain `nmap -sCV -oX scan.xml <target>`) to generate the scan, then paste
or import the output. The design intent is "AutoRecon scans, HackTricks informs,
recon-deck manages the workflow between them" — a scanner in the loop would
compete with AutoRecon, not complement it, and would bloat a tool built around
synchronous rendering into a job-queue-and-daemon architecture.

### "Can this be multi-user / team?"

**No.** recon-deck is a single-user, local, self-hosted tool. Multi-user support
would require user authentication, per-user state scoping, role-based access
control, share permissions, and a conflict-resolution model for concurrent edits
of the same engagement — each of which expands the maintenance surface by an
order of magnitude. If you need a shared engagement, export the engagement as
Markdown or JSON and commit it to your team's repo of choice.

If you want recon-deck's UX for a team, run one container per user. Each
container has its own `/data` volume and its own state. There is no central
server because there is no central-server design.

### "Can you add AI / LLM / exploit suggestions?"

**Not in v1.x — but on the v2 horizon.** recon-deck v1 is deterministic and
fully offline by design: the server process makes zero outbound HTTP requests
(see OPS-03 in [`SECURITY.md`](SECURITY.md)). For v1.x, that posture is firm.

For v2.x, the direction is open under strict constraints. A viable design
looks like this: the user supplies their own local model (Ollama, llama.cpp,
or a self-hosted endpoint they configure), opt-in by default, with every
AI-derived suggestion clearly labelled and never auto-executed. The recon-deck
process itself never reaches a third-party API and never bundles a model into
the Docker image — the offline guarantee survives. See
[v2.x Future Considerations](#v2x-future-considerations) for the constraint
list this design would have to satisfy.

If you want to influence what this looks like, open a discussion issue with a
concrete workflow you'd want enriched (e.g. "summarise NSE script output for
this port", "propose checklist items for this service banner") rather than a
generic "add AI" request.

### "Is there a mobile version / mobile app?"

**No.** Pentesting happens on laptops. The UI (multi-pane layout, dense
command templates, chord-based keyboard shortcuts) is desktop-optimized. The
officially supported browsers are Chromium and Firefox (last two major
versions) on desktop — Safari is best-effort only, and mobile browsers are
not tested against.

---

## How Priorities Get Set

The roadmap is reorganized after each release based on:

1. **Real user reports** from the issue tracker. Bug reports backed by a
   reproduction outrank feature requests every time.
2. **Quality-gate regressions** (bundle size, render performance, Docker image
   growth). These can bump hardening items forward without discussion.
3. **Security posture.** Anything on the SECURITY.md "tech debt" list (current:
   nonce-based CSP, cosign signing, egress-blocking CI guard) gets priority
   over feature work.
4. **Author bandwidth.** This is a nights-and-weekends project. Slow weeks
   happen.

There is no SLA, no release cadence commitment, no "we'll get to it soon."
Everything here is a best-effort plan subject to reality.

---

## Contributing to the Roadmap

To propose moving an item off the Out-of-Scope list or onto the Candidates
list, open a discussion issue — **not a PR**. Describe:

1. **The user problem** in one sentence. (If the problem is "I want feature X,"
   rewrite it until it describes a workflow friction.)
2. **Why the current tool doesn't address it.** Point at specific export
   paths, KB overrides, or keyboard shortcuts that fall short.
3. **Scope boundary.** If the request is "add X," define what X does _not_
   include, to prevent scope creep during design.

PRs against out-of-scope items are closed without a merge, regardless of code
quality. Please save your own time and open the discussion first.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full PR discipline and the
knowledge-base contribution path (the highest-leverage way to help the
project).
