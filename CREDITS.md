# Credits

recon-deck stands on the shoulders of the open-source security community. This file
attributes the upstream knowledge sources, tech-stack projects, and inspirations that
make the tool possible.

---

## Upstream Knowledge Sources

### HackTricks

- **Author:** Carlos Polop
- **URL:** <https://book.hacktricks.wiki/>
- **License:** CC-BY-SA 4.0
- **Use in recon-deck:** Many `resources[]` entries in the shipped knowledge base link
  to HackTricks pages. **No prose is copied** from HackTricks — recon-deck links only,
  preserving the CC-BY-SA attribution requirement at the link target. The user's
  browser fetches the HackTricks page directly; recon-deck never proxies, mirrors, or
  caches HackTricks content.

### AutoRecon

- **Author:** Tib3rius
- **URL:** <https://github.com/Tib3rius/AutoRecon>
- **License:** MIT
- **Use in recon-deck:** The AutoRecon import feature parses AutoRecon's
  `results/<ip>/` zip output format to seed port cards with NSE script data. No
  AutoRecon source code is vendored — recon-deck's importer is an independent parser
  of the result-folder layout.

### PayloadsAllTheThings

- **Author:** swisskyrepo
- **URL:** <https://github.com/swisskyrepo/PayloadsAllTheThings>
- **License:** MIT
- **Use in recon-deck:** Linked from `resources[]` entries on port cards where
  payload references are applicable (e.g., SQL injection, command injection,
  XSS payloads). Links only — no prose or payloads are copied.

### SecLists

- **Author:** Daniel Miessler (and contributors)
- **URL:** <https://github.com/danielmiessler/SecLists>
- **License:** MIT
- **Use in recon-deck:** Linked from `resources[]` entries where wordlist or
  fuzzing-dictionary references are applicable. Links only — no wordlist content
  is bundled into the image.

---

## Tech Stack Credits

Brief acknowledgment of the open-source projects the application is built on. No
source code from any of these projects is vendored beyond their published npm
packages.

- **Next.js** (Vercel) — React framework, App Router, API routes.
- **React** (Meta) — UI runtime.
- **Tailwind CSS** (Tailwind Labs) — utility-first styling.
- **shadcn/ui** (shadcn) — copy-in component generator. Components are copied into
  the repo at generate time, not imported as a runtime dependency.
- **Drizzle ORM** (Drizzle Team) — SQL-first, type-safe SQLite access.
- **better-sqlite3** (Joshua Wise) — synchronous SQLite driver.
- **fast-xml-parser** (Naveen Saigaonkar) — nmap XML parsing.
- **js-yaml** (Vitaly Puzrin) — YAML loader for the knowledge base.
- **Zod** (Colin McDonnell) — runtime schema validation.
- **lucide-react** (Lucide contributors) — icon set.
- **@radix-ui** primitives — accessibility under shadcn/ui components.

---

## Inspiration Credits

- **Obsidian** — for the extensibility-via-files posture that makes recon-deck
  the "OSCP-flavored Obsidian for recon." Obsidian showed that file-based,
  Markdown-first, no-cloud tools are what technical users want.
- **OSCP / HackTheBox community** — for validating that the problem is real:
  8 browser tabs, a scratch Obsidian file, and a wall of tmux panes per box.
  Every time someone on a Discord server or lab forum shared their
  "recon workflow," they were describing the gap recon-deck fills.

---

## License Summary

- **recon-deck source code:** MIT. See `LICENSE`.
- **Knowledge base YAML files** (`knowledge/ports/*.yaml`): MIT — the structure and
  metadata only. The linked content at the URLs retains its own upstream license
  (for HackTricks pages, that means CC-BY-SA 4.0).
- **Linked third-party content:** retains its respective upstream license at the
  link target. recon-deck does not copy, mirror, or proxy third-party content.

---

## How to Add New Attribution

When you open a PR that adds a new KB entry citing an upstream source:

1. Append the source to this file under a new `### Source Name` heading following
   the existing format (Author, URL, License, Use in recon-deck).
2. State the "links only — no prose copied" stance if the source is under a
   copyleft license (e.g., CC-BY-SA).
3. If the source is already listed, you do not need to edit this file again —
   one entry per source, regardless of how many KB entries link to it.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full PR discipline.
