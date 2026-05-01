<div align="center">

# 🛰️ recon-deck

**From `nmap` output to an actionable, port-aware recon checklist in under 30 seconds.**
Offline. Self-hosted. Every engagement export-ready as Markdown.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.1.0-blue)](CHANGELOG.md)
[![Schema](https://img.shields.io/badge/schema-0018-orange)](src/lib/db/migrations/)
[![GHCR](https://img.shields.io/badge/ghcr.io-kocaemre%2Frecon--deck-2496ED?logo=docker&logoColor=white)](https://github.com/kocaemre/recon-deck/pkgs/container/recon-deck)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org)
[![Offline-first](https://img.shields.io/badge/network-offline_by_default-success)](SECURITY.md)

</div>

---

Paste nmap text / XML / greppable output — or drag in an AutoRecon `results/` zip — and every open port becomes a card with pre-filled commands (IP interpolated), HackTricks links, tickable checks, evidence screenshots, and a notes field.

Built for **OSCP / HTB students and solo pentesters** who currently juggle 8 browser tabs and a scratch Obsidian file per box.

<div align="center">
  <img src="docs/screenshots/02-engagement-heatmap.png" alt="recon-deck heatmap — 28 ports across one host, KB-driven risk + check counts on each card" width="1100">
  <br>
  <sub><i>An engagement view: 28 open ports, KB-matched risk colors, per-port check completion. <a href="docs/screenshots/">More screenshots →</a></i></sub>
</div>

<br>

```bash
# 30-second smoke test — pulls the image, starts on http://localhost:13337
curl -sSL https://raw.githubusercontent.com/kocaemre/recon-deck/main/install.sh | sh
```

---

## Why recon-deck

| Without it | With it |
|---|---|
| 8 browser tabs per box (HackTricks, payloadsallthethings, gtfobins, …) | One page per port, prefilled commands ready to copy |
| Hand-typing `nmap -p- -sV` boilerplate per service | KB-driven commands with `{IP}` / `{HOST}` / `{PORT}` / `{WORDLIST_*}` placeholders |
| Lost track of which checks you ran on box #7 | Tickable checklist + per-port notes saved in SQLite |
| Markdown report = manual copy-paste from notes | One-click export: Markdown / HTML / JSON / SysReptor / PwnDoc / PDF |
| AutoRecon dump → folder spelunking | Drop the zip, every per-port file routed to the right card |

---

## Feature highlights

<details>
<summary><b>📥 Ingest</b> — nmap text / XML / greppable + AutoRecon zip + manual ports</summary>

- **Multi-format nmap parser** — `-oN`, `-oX`, `-oG`. Multi-host scans become a host-selector chip in the header
- **AutoRecon zip import** — drag the `results/` folder zipped; per-port service files, `_manual_commands.txt`, gowitness screenshots, patterns / errors logs all routed automatically
- **Re-import + diff** — re-paste a fresh nmap output and the heatmap badges new ports `NEW` and previously-open ports `CLOSED`. Header `scans: N` chip tracks how many imports you've done
- **Manual ports** — heatmap `+ Add port` for services nmap missed (DNS zone transfer, alt banners, etc.)

</details>

<details>
<summary><b>🎯 Triage</b> — KB-driven port cards, known-vulns, searchsploit, findings catalog</summary>

- **KB-driven cards** — port + service + product/version match shipped YAML KB → tickable checks, prefilled commands, HackTricks links
- **Active Directory toolkit** — `nxc` (netexec), impacket (`GetNPUsers`, `GetUserSPNs`, `secretsdump`), kerbrute, bloodhound-python, PetitPotam, pyWhisker — all wired to the right DC ports (88/135/389/445/464/636/3268/3389/5985)
- **Known-vulns auto-match** — `vsFTPd 2.3.4` and friends → vuln + CVE + ref link surfaces on the port card
- **searchsploit lookup** — one-click `searchsploit -t "<product>"` per port, cached
- **Findings catalog** — severity / title / description / CVE / evidence refs. One-click `+ finding` button on KB rows pre-populates the modal

</details>

<details>
<summary><b>🖼️ Evidence</b> — per-port screenshots, AutoRecon gowitness import, native annotation</summary>

- **Drag-drop / clipboard-paste** screenshots into a per-port evidence pane
- **Native HTML5 canvas annotation** — Box / Arrow / Pencil / Text tools, 5-color palette, undo stack. Save chains a new evidence row via `parent_evidence_id` so the original always survives
- **AutoRecon gowitness / aquatone PNGs** auto-import into the matching port's evidence list

</details>

<details>
<summary><b>📤 Export</b> — Markdown, JSON, HTML, CSV, SysReptor, PwnDoc, print-to-PDF</summary>

- **Six export formats** plus a print-optimised PDF route
- **Markdown** ships with Obsidian-compatible frontmatter
- **SysReptor JSON** + **PwnDoc YAML** for reporting-tool feeds
- **Findings CSV** for spreadsheet triage
- **Multi-host aware** — SysReptor scope and PwnDoc scope list every host; markdown / HTML render one section per host

</details>

<details>
<summary><b>⌨️ Workflow</b> — command palette, FTS5 search, keyboard shortcuts, sidebar actions</summary>

- **Command palette** (`⌘K`) — every UI action lives in the palette: add finding, re-import, settings, delete, exports, print
- **Cross-engagement search** (`⌃⇧F`) — FTS5 + BM25, hit rows show host context
- **Sidebar engagement actions** — hover-kebab with rename / duplicate (deep-copy) / delete (shadcn AlertDialog)
- **Custom commands** + **wordlist overrides** at `/settings/commands` and `/settings/wordlists` — your snippets surface alongside KB commands

</details>

<details>
<summary><b>📚 Knowledge base</b> — YAML KB, in-app editor, hot-reload</summary>

- **YAML KB** — drop entries in `/kb` (or wherever you point `kb_user_dir`); shipped KB lives under `knowledge/`
- **In-app editor** at `/settings/kb` — paste, validate against the Zod `KbEntrySchema`, save under a strict filename allowlist
- **Hot reload** — `fs.watch` on shipped + user dirs flips a dirty flag, next request rebuilds. Edit a YAML in your editor, refresh, see your change
- **In-app editor** at `/settings/kb` — paste, validate, save (atomic write under a strict `[A-Za-z0-9_-]` filename allowlist)

</details>

<details>
<summary><b>🛡️ Safety</b> — migration backup, host-header allowlist, rate limiter, offline-by-default</summary>

- **Pre-migration snapshots** via `VACUUM INTO` — boot writes `data/recon-deck.db.backup-pre-NNNN` before any new migration runs. Failure logs surface a copy-pasteable `cp` rollback line
- **Post-migration `PRAGMA integrity_check` + `foreign_key_check`** — either failing aborts boot
- **Host-header allowlist middleware** — defends DNS-rebinding when the app is reachable on `0.0.0.0`
- **Per-IP rate limiter** on `/api/*` — defense-in-depth for the LAN-exposure case
- **Offline by default** — zero outbound HTTP unless the operator opts in to the GitHub release check

</details>

<details>
<summary><b>🚀 First-run</b> (v2.1.0) — onboarding, sample engagement, update toast</summary>

- **`/welcome` 4-step onboarding** — scope · tour · local paths · updates. Seeds the `app_state` singleton with your `local_export_dir`, `kb_user_dir`, `wordlist_base`, and the release-check toggle
- **Replay onboarding** from `/settings → First-run` — paths preserved
- **Sample engagement** — "Try sample" on the paste panel inserts a canned 10-port HTB-easy box marked `is_sample = true`. Header surfaces a `SAMPLE` chip + single-click Discard
- **Notify-only update check** (opt-in) — pings `api.github.com/repos/kocaemre/recon-deck/releases/latest` once per session, toasts a "Release notes" link if a newer tag exists. Installs stay manual
- **Desktop-only viewport guard** — `< 1280px` shows a clean "needs a wider screen" explainer

</details>

---

## Quick Start

Three ways to run, pick one. All bind to `127.0.0.1:13337` (port picked to dodge the dev-server crowd on 3000/8080), so nothing leaks to your LAN by default; see [Exposing to LAN](#exposing-to-lan) if you need otherwise.

**1. One-liner (auto-pulls + starts + opens browser):**

```bash
curl -sSL https://raw.githubusercontent.com/kocaemre/recon-deck/main/install.sh | sh
```

**2. Docker Compose (recommended for persistent setups):**

```bash
curl -O https://raw.githubusercontent.com/kocaemre/recon-deck/main/docker-compose.yml
docker compose up -d
```

**3. Manual `docker run`:**

```bash
docker run -d --name recon-deck -p 127.0.0.1:13337:13337 \
  -v recondeck-data:/data \
  -v recondeck-kb:/kb \
  -e HOSTNAME=0.0.0.0 \
  ghcr.io/kocaemre/recon-deck
```

Open <http://localhost:13337>, paste nmap output, see cards.

**What `-e HOSTNAME=0.0.0.0` does:** the image binds to `127.0.0.1` inside the container by default. For Docker's `-p` port mapping to reach the app, the container must bind all interfaces internally. The `-p 127.0.0.1:13337:13337` form on the host side then restricts external visibility to the loopback interface — only your local machine can reach the app. See [Exposing to LAN](#exposing-to-lan) if you need LAN reachability.

---

## What it is / What it is NOT

**For OSCP/HTB students and solo pentesters.** Offline. No LLM. Does not run scans — it complements AutoRecon and HackTricks. Think of it as the OSCP-flavored Obsidian for recon: same category as Obsidian, focused on post-scan workflow.

**It is NOT** a reporting platform, a team tool, a scanner, an AI assistant, or a mobile app. The intent is deliberate and narrow — see [ROADMAP.md](ROADMAP.md) for the out-of-scope list.

---

## Exposing to LAN

By default, the Quick Start binds to `127.0.0.1` on the host — only your local machine can reach the app. To make recon-deck reachable from another machine on your LAN:

```bash
docker run -p 13337:13337 \
  -v recondeck-data:/data \
  -v recondeck-kb:/kb \
  -e HOSTNAME=0.0.0.0 \
  -e RECON_DECK_TRUSTED_HOSTS=192.168.1.10:13337 \
  ghcr.io/kocaemre/recon-deck
```

Replace `192.168.1.10:13337` with the host:port your LAN clients will use. `RECON_DECK_TRUSTED_HOSTS` is comma-separated — expand it for every additional host you want to reach the app from.

This activates the host-header allowlist (mitigates DNS rebinding). Requests whose `Host:` header is not in the allowlist are rejected with HTTP 421 Misdirected Request. See [SECURITY.md](SECURITY.md) for the full threat model.

---

## Customizing the Knowledge Base

recon-deck ships a curated knowledge base under `/app/knowledge` inside the image. To extend or override it, drop YAML files into the `/kb` volume:

```bash
# One-off override: add a custom entry for port 445/smb
docker run ... -v $(pwd)/my-kb:/kb ... ghcr.io/kocaemre/recon-deck
```

Your YAML files in `/kb/ports/*.yaml` are loaded at startup and take precedence over shipped entries with the same port/service. See [CONTRIBUTING.md](CONTRIBUTING.md) for the schema, denylist rules, and placeholder syntax.

**UID ownership note:** the container runs as UID 1000 (`USER node`). If you bind-mount a host directory, make sure it's readable by UID 1000:

```bash
chown 1000:1000 /path/to/my-kb
```

Or use a Docker named volume (`-v recondeck-kb:/kb`), which inherits container ownership automatically on first write.

---

## AutoRecon Import

1. Run AutoRecon: `autorecon <target>` — produces `results/<ip>/`.
2. Zip the folder: `cd results && zip -r my-target.zip <ip>/`.
3. Drag the `.zip` onto the import panel in recon-deck.

The importer unpacks server-side, parses the full / quick TCP XML scan, and seeds port cards with everything it finds:

- per-port files (`tcp80/...`, `tcp_22_ssh_*`) → port detail pane
- `_manual_commands.txt` → "Manual commands" section per port
- `_patterns.log`, `_errors.log`, `_commands.log` → engagement-level warning panel
- `report/screenshots/*.png` (gowitness / aquatone) → port_evidence rows, filename-matched to the right port
- `loot/`, `report/`, `exploit/` → engagement artifacts

Multi-IP zips (`results/<ip1>/`, `results/<ip2>/`) are detected — primary host inherits AR data, secondary hosts get ports + scripts only (a warning surfaces on import).

---

## Multi-host engagements

A single engagement holds N hosts (DC + workstations during an AD pentest, two related boxes, etc.). The engagement header surfaces a **Hosts** row with switchable chips; the heatmap, command palette, and per-port commands all rescope to the active host. Use `?host=<id>` in the URL or the keyboard palette (`⌘K` → host name).

Multi-host arrives via three paths:

- **XML upload** — every `<host>` in the scan becomes its own host row.
- **Text / greppable upload** — every `Nmap scan report for ...` block (or distinct `Host:` IP in greppable) becomes its own host row.
- **AutoRecon multi-IP zip** — every `results/<ip>/` directory becomes a host row.

---

## Re-import + scan diff

Hit **Re-import** in the engagement header and paste a fresh nmap output. The reconciler:

- Adds new ports (`NEW` chip on the heatmap)
- Refreshes `last_seen_scan_id` for re-observed ports
- Marks ports the new scan didn't see as `closed` (`CLOSED` chip, dim tile)
- Surfaces a `scans: N` chip in the header so you know multi-import diff context applies
- Toast: `1 new · 1 closed · 2 unchanged` after import

---

## Cross-engagement search

Press `⌃⇧F` (or `⌘⇧F` on Mac, or click "Search all engagements" in the sidebar). Searches port services / products / versions, NSE script output, port notes, finding titles + descriptions, and engagement names across every engagement in your local DB. Results are FTS5 + BM25 ranked, port hits show a host-context chip when the engagement has multiple hosts.

---

## Settings

Open `/settings` (footer link in the sidebar) for:

- **Engagement list** — every engagement with an inline **Delete** button (cascades through ports, scripts, evidence, findings, scan history). Confirms with the host / port count so you know what you're nuking.
- **Wordlist library** (`/settings/wordlists`) — override `{WORDLIST_*}` placeholders to your own SecLists / dirb paths.
- **Custom command library** (`/settings/commands`) — personal command snippets surfaced alongside KB commands. Scope by service / port (or leave blank for global).
- **KB editor** (`/settings/kb`) — paste a YAML KB entry, validate against `KbEntrySchema`, and (with `RECON_KB_USER_DIR` configured) save it to your user dir. Save invalidates the in-memory KB cache so the new entry surfaces in subsequent renders without a server restart.

Engagement renames live in two places: the **inline edit on the engagement header** (click the IP or hostname field, type, blur) for target identity, and the **sidebar hover-kebab → Rename** for the engagement's display label. Hover-kebab also exposes **Duplicate** (deep-copy SQL transaction — every child row gets fresh primary keys; the clone is fully independent) and **Delete** (shadcn `AlertDialog` confirmation; same destructive cascade as the settings list, no native browser dialog).

---

## Exports

Every engagement is export-ready in six formats plus a print route:

- **Markdown** — Obsidian-compatible frontmatter, one file per engagement. Paste into your vault.
- **JSON** — structured dump of hosts / ports / commands / checks / notes / findings. For scripting.
- **HTML** — single-file standalone report, opens in any browser offline.
- **Findings CSV** — flat severity / title / host / port / cve / description rows for spreadsheet triage.
- **SysReptor JSON** — generic `projects/v1` shape with multi-host scope; map onto your SysReptor design template.
- **PwnDoc YAML** — minimal `findings + scope` document; multi-host aware.
- **Print-to-PDF** — dedicated `/report` route with print-optimized CSS. Ctrl+P → Save as PDF in your browser.

Multi-host engagements export every host in `scope[]` (SysReptor / PwnDoc) and one section per host (Markdown / HTML).

---

## Backup & Restore

Everything that survives a crash lives in two named volumes (or two host paths if you bind-mounted them):

- `recondeck-data` → SQLite DB, scan history, evidence (base64-encoded inside the DB), findings, notes
- `recondeck-kb` → your YAML overrides under `/kb`

Always back both up together — restoring just one will leave you with KB matches that point at engagements that no longer exist (or vice versa).

**Snapshot to a tarball (works while the container is running, but for a fully consistent point-in-time snapshot stop the container first):**

```bash
docker stop recon-deck
docker run --rm \
  -v recondeck-data:/data \
  -v recondeck-kb:/kb \
  -v "$(pwd)":/out \
  alpine sh -c 'tar -C / -czf /out/recon-deck-$(date +%F).tar.gz data kb'
docker start recon-deck
```

The tarball is your full restore point — copy it off-host (rsync, S3, anywhere) and you can rebuild a recon-deck install identical to the moment you snapshotted.

**Restore from a tarball into fresh volumes:**

```bash
docker stop recon-deck && docker rm recon-deck
docker volume rm recondeck-data recondeck-kb
docker volume create recondeck-data
docker volume create recondeck-kb
docker run --rm \
  -v recondeck-data:/data \
  -v recondeck-kb:/kb \
  -v "$(pwd)":/in \
  alpine sh -c 'tar -C / -xzf /in/recon-deck-2026-04-26.tar.gz'
# now restart the container — migrations apply on boot, KB reload is automatic
docker start recon-deck   # or re-run the docker run command from Quick Start
```

**Schema version pins.** The DB carries Drizzle's `__drizzle_migrations` ledger so re-applying the same migration is a no-op. The current shipped version is **schema `0018`** (the v2.1.0 `app_state` singleton + `engagements.is_sample` pair). Backing up an `0018` DB and restoring it under a build that expects `≥ 0018` works — Drizzle migrations are forward-only, so restoring a snapshot under an older build will leave the runtime confused. Pin the recon-deck image tag (`ghcr.io/kocaemre/recon-deck:v2.1`) for production restores rather than rolling with `:latest`.

**Pre-migration snapshots (boot-time safety net).** When the journal lists more entries than `__drizzle_migrations` has applied, the boot sequence runs `VACUUM INTO 'data/recon-deck.db.backup-pre-NNNN'` *before* invoking `migrate()`. `NNNN` is the applied count when the snapshot was written, so `backup-pre-0017` means "captured at schema 0017, restoring puts you back there". On any migration failure the log surfaces the snapshot path with a copy-pasteable rollback command:

```bash
# Inside the container (or directly on the host if you bind-mounted /data):
cp data/recon-deck.db.backup-pre-0017 data/recon-deck.db
rm -f data/recon-deck.db-wal data/recon-deck.db-shm
# restart — boot retries from the restored state
```

After every successful migration, `PRAGMA integrity_check` + `PRAGMA foreign_key_check` run; either failing aborts boot. Snapshots accumulate on disk one per migration tier (`…-0016`, `…-0017`, `…-0018`) — recycle them manually when you trust the new schema. See [CONTRIBUTING.md](CONTRIBUTING.md) › "Migration safety and recovery" for the full procedure.

---

## Upgrading

recon-deck is **notify-only** for updates — installs are always manual so you control when and how the binary on disk changes. There is no auto-update path and no telemetry; the optional GitHub release check is opt-in (toggle in `/settings → First-run`) and only ever pings `api.github.com/repos/kocaemre/recon-deck/releases/latest`.

**Docker:**

```bash
docker pull ghcr.io/kocaemre/recon-deck:latest
docker stop recon-deck && docker rm recon-deck
# then re-run your usual `docker run …` from Quick Start above.
```

The SQLite volume (`recon-deck-data`) is mounted by name in the docs above, so it survives the stop/rm/run cycle. Migrations are applied automatically on the next boot — never edit `schema.ts` after the fact; add a new `0019_*.sql` instead.

**Local dev:**

```bash
git pull && npm install && npm run dev
```

The migration runner picks up new SQL files on boot. If a migration ever fails, the runner stops the boot — fix the migration and restart; nothing is half-applied.

**Toggling the release check:** off by default. Enable it via `/settings → First-run → Check GitHub for new releases`. When on, you'll see one toast per browser session if a newer tag exists, with a link to the release notes. Disable it any time — the toggle persists in the local SQLite, not in env.

## Tech Stack

| Layer         | Technology                                 |
| ------------- | ------------------------------------------ |
| Framework     | Next.js 15.5 (App Router)                  |
| UI            | React 19, Tailwind 4, shadcn/ui            |
| Persistence   | SQLite via Drizzle + better-sqlite3        |
| Parsers       | fast-xml-parser (XML), custom regex (text) |
| KB format     | YAML via js-yaml, validated by Zod         |
| Container     | node:22-alpine, multi-stage build          |
| License       | MIT                                        |

Full version pins live in `package.json`. The image is a single multi-stage `node:22-alpine` build — typical pulled size is under ~200 MB.

---

## Development

For local hacking outside the container:

```bash
git clone https://github.com/kocaemre/recon-deck
cd recon-deck
npm install
npm run dev
# → http://localhost:13337
```

Useful scripts:

```bash
npm test              # vitest unit tests (parsers + KB schema)
npm run lint:kb       # YAML lint (schema + denylist + URL scheme)
npm run typecheck     # tsc --noEmit
npm run build         # production build (output: "standalone")
```

---

## Configuration Reference

| Env var                     | Default                 | Purpose                                                                        |
| --------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `HOSTNAME`                  | `127.0.0.1`             | Bind address inside the container. Override to `0.0.0.0` for port-map reach.   |
| `PORT`                      | `13337`                 | Port the app listens on (also drives the host-header allowlist default).       |
| `RECON_DB_PATH`             | `/data/recon-deck.db`   | SQLite file location. Keep on a mounted volume for persistence.                |
| `RECON_KB_USER_DIR`         | `/kb`                   | **Legacy fallback** for the user KB directory. v2.1.0 onwards `app_state.kb_user_dir` (set during onboarding or `/settings`) wins; the env var is only consulted when the DB column is null. |
| `RECON_LOCAL_EXPORT_DIR`    | _(empty)_               | **Legacy fallback** for the engagement header's `vscode://file/…` link. v2.1.0 onwards `app_state.local_export_dir` wins. The older `NEXT_PUBLIC_RECON_LOCAL_EXPORT_DIR` build-time env still works as the last fallback. |
| `RECON_DECK_TRUSTED_HOSTS`  | _(empty)_               | Comma-separated extra hosts allowed by the host-header middleware.             |
| `NEXT_TELEMETRY_DISABLED`   | `1`                     | Disables Next.js telemetry. Preserves the offline guarantee.                   |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for KB rules, PR discipline, and what's in/out of scope.

## Security

See [SECURITY.md](SECURITY.md) for the threat model, offline guarantee, and default-deny postures.

## Credits

See [CREDITS.md](CREDITS.md) for upstream attribution — HackTricks, AutoRecon, PayloadsAllTheThings, SecLists.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for upcoming candidates, the v2.x future direction, and hard out-of-scope items.

## License

MIT.
