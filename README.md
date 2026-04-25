# recon-deck

> _From nmap output to an actionable, port-aware recon checklist in under 30 seconds — offline, single-binary self-host, every engagement export-ready as Markdown._

![GHCR](https://img.shields.io/badge/ghcr.io-recon--deck-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Next.js](https://img.shields.io/badge/Next.js-15.5-black)

Paste nmap text or XML (or import an AutoRecon `results/` folder) and every open port becomes a card with pre-filled commands (IP interpolated), HackTricks links, tickable checks, and a notes field. Built for OSCP/HTB students and solo pentesters who currently juggle 8 browser tabs and a scratch Obsidian file per box.

<!-- ![recon-deck demo](docs/demo.gif) (GIF to be added — record an 8-12 second clip of nmap paste → cards) -->

---

## Quick Start

Three ways to run, pick one. All bind to `127.0.0.1:3000` so nothing leaks to your LAN by default; see [Exposing to LAN](#exposing-to-lan) if you need otherwise.

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
docker run -d --name recon-deck -p 127.0.0.1:3000:3000 \
  -v recondeck-data:/data \
  -v recondeck-kb:/kb \
  -e HOSTNAME=0.0.0.0 \
  ghcr.io/kocaemre/recon-deck
```

Open <http://localhost:3000>, paste nmap output, see cards.

**What `-e HOSTNAME=0.0.0.0` does:** the image binds to `127.0.0.1` inside the container by default. For Docker's `-p` port mapping to reach the app, the container must bind all interfaces internally. The `-p 127.0.0.1:3000:3000` form on the host side then restricts external visibility to the loopback interface — only your local machine can reach the app. See [Exposing to LAN](#exposing-to-lan) if you need LAN reachability.

---

## What it is / What it is NOT

**For OSCP/HTB students and solo pentesters.** Offline. No LLM. Does not run scans — it complements AutoRecon and HackTricks. Think of it as the OSCP-flavored Obsidian for recon: same category as Obsidian, focused on post-scan workflow.

**It is NOT** a reporting platform, a team tool, a scanner, an AI assistant, or a mobile app. The intent is deliberate and narrow — see [ROADMAP.md](ROADMAP.md) for the out-of-scope list.

---

## Exposing to LAN

By default, the Quick Start binds to `127.0.0.1` on the host — only your local machine can reach the app. To make recon-deck reachable from another machine on your LAN:

```bash
docker run -p 3000:3000 \
  -v recondeck-data:/data \
  -v recondeck-kb:/kb \
  -e HOSTNAME=0.0.0.0 \
  -e RECON_DECK_TRUSTED_HOSTS=192.168.1.10:3000 \
  ghcr.io/kocaemre/recon-deck
```

Replace `192.168.1.10:3000` with the host:port your LAN clients will use. `RECON_DECK_TRUSTED_HOSTS` is comma-separated — expand it for every additional host you want to reach the app from.

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

The importer unpacks server-side, parses the XML scan, and seeds port cards with any NSE script output found under `scans/`. No client-side unzipping — keeps the browser bundle lean.

---

## Exports

Every engagement is export-ready in four formats:

- **Markdown** — Obsidian-compatible frontmatter, one file per engagement. Paste into your vault.
- **JSON** — structured dump of ports, commands, checks, notes. For scripting.
- **HTML** — single-file standalone report, opens in any browser offline.
- **Print-to-PDF** — dedicated `/report` route with print-optimized CSS. Ctrl+P → Save as PDF in your browser.

---

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
# → http://localhost:3000
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
| `PORT`                      | `3000`                  | Port the app listens on.                                                       |
| `RECON_DB_PATH`             | `/data/recon-deck.db`   | SQLite file location. Keep on a mounted volume for persistence.                |
| `RECON_KB_USER_DIR`         | `/kb`                   | Directory for user KB overrides. YAML files here are loaded at startup.        |
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

See [ROADMAP.md](ROADMAP.md) for v1.1 candidates and hard out-of-scope items.

## License

MIT.
