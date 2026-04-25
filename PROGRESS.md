# recon-deck v2 Roadmap — Progress & Resume

> Bu dosya, "evidence + findings + cross-engagement search + reporting bridge" yönündeki strateji değişikliğinin kanlı canlı durumunu tutar. Bir oturum kesilirse buradan devam edilir.
>
> Son güncelleme: 2026-04-26 (P0 + P1-E + P1-F + P1-G + P1-H + GlobalSearch host context + AR multi-IP importer + P2 searchsploit MVP bitti). Geriye kalanlar: nmap-text/greppable multi-host (defer — XML kapsıyor), target_ip deprecate (opsiyonel schema temizliği), Docker UX iyileştirmeleri (install one-liner + compose). **DIST/Bun binary roadmap'ten çıkarıldı** — Docker yeterli, Bun + Next.js bleeding edge ve maliyet/fayda düşük.
>
> Test durumu: **397/397 yeşil**, TypeScript: 0 hata.

---

## Strateji özeti

**Eski tanım:** "nmap parser + port-aware checklist UI"
**Yeni tanım:** "AutoRecon-aware reconnaissance & findings inventory bridge for solo pentesters who report in SysReptor/Pwndoc/Markdown vault"

Bu yön, topluluk araştırmasının gerçek pentester acılarına göre belirlendi:
- Topluluk #1 acısı: **rapor yazımı** → recon-deck reporting yapmıyor ama temiz veri besler
- Topluluk #2: **search zayıflığı** → FTS5 ile çözüldü (P0-A ✅)
- Topluluk #3: **screenshot integration** → P0-B
- Topluluk #4: **600+ sayfa not yığılması, finding tracking** → P0-C

---

## Doğrulama komutları (her görev sonu)

```bash
npx tsc --noEmit                     # → "TypeScript: No errors found"
npm test                              # → 355+/355+ passed
nohup npx next dev -p 3030 > /tmp/nextdev.log 2>&1 &   # Chrome doğrulama
```

---

## ✅ Tamamlananlar

### UI Redesign (claude design handoff'undan)
1. globals.css token'ları (Modern IDE palette)
2. Inter + JetBrains Mono fontları
3. EngagementHeader (ENGAGEMENT label + chips + targets + ports + progress)
4. Sidebar (260px, brand row, filter, active highlight, footer)
5. Landing (paste with chrome + AR drop)
6. EngagementHeatmap + PortDetailPane (collapsible cards yerine attack-surface grid)
7. CommandPalette restyle (gruplar + risk dot'lar + footer kbd)

Ek iyileştirmeler:
- Sidebar `{done}/{total}` + 2px progress line + ✓ glyph
- Sidebar SQL aggregate optimization (3 sabit query, N×getById değil)
- Notes empty state italic fg-subtle
- Eski PortCard.tsx silindi (XSS testleri PortDetailPane'e taşındı)
- ChecklistItem 14×14 redesign

### Parser/Importer Enrichment (sprint 1-4)
- ParsedScan tipi: `cpe`, `reason`, `reasonTtl`, `serviceFp`, `os.matches[].classes[]`, `os.fingerprint`, `traceroute`, `preScripts`, `postScripts`, `extraPorts`, `scanner`, `runstats`, `target.{state, addresses[], hostnames[]}`
- nmap-xml.ts hepsini doldurur
- nmap-text.ts: extraports + ssl/svc + OS details + Aggressive OS guesses + TRACEROUTE block
- nmap-greppable.ts (yeni): `-oG` parser yolu, `parseAny`'de 3. dal
- AutoRecon importer: UDP scan + quick fallback + udp{port}/ subdirs + per-service XML + binary screenshots (base64) + _patterns.log + _errors.log + _commands.log + loot/ + report/ + exploit/
- DB persistence: port_scripts.source enum'a 7 AR artifact tipi (additive, no migration)
- AR raw_input fix: import sırasında full TCP XML retain edilir (engagementArtifacts içinde) → re-parse ile v2 alanları AR engagement'larında da görünür
- View-model + export modülleri (Markdown/JSON/HTML + /report) tüm yeni alanları içerir

### P0-A — Cross-engagement full-text search ✅
- Migration 0002: FTS5 `search_index` + 6 trigger + backfill
- `src/lib/db/search.ts`: `searchEngagements()` BM25 ranked + güvenli quoting
- `app/api/search/route.ts`: GET endpoint
- `src/components/GlobalSearchModal.tsx`: ⌃⇧F shortcut + güvenli `<mark>` highlight
- Sidebar'da "Search all engagements" butonu
- `useUIStore.globalSearchOpen` slice eklendi

### P0-B — Screenshot/evidence integration ✅
- Migration 0003: `port_evidence` tablosu (base64 TEXT, 4MB cap)
- `src/lib/db/evidence-repo.ts`: createEvidence/list/delete + mimeFromFilename
- AR importer: `autorecon-screenshot` artifact'lar otomatik `port_evidence`'a kopyalanır (filename'den port match'i — `tcp80/...png`, `tcp_443_https_*.png`)
- `port_id` lookup için `portIdByKey: Map<"proto:port", id>` (createFromScan içinde)
- `app/api/engagements/[id]/evidence/route.ts` POST + `[evidenceId]/route.ts` DELETE
- `src/components/EvidencePane.tsx`: drag-drop + clipboard paste (hover-scoped) + thumbnail gallery + lightbox modal + delete
- PortDetailPane "Evidence" section
- FullEngagement.evidence + getById yükler

### P0-C — Findings tracker ✅
- Migration 0004: `findings` tablosu + FTS5 trigger ek (kind='finding')
- `src/lib/db/findings-repo.ts`: list/create/update/delete; evidence_refs JSON encode/decode
- `app/api/engagements/[id]/findings/route.ts` GET+POST + `[findingId]/route.ts` PATCH+DELETE
- `src/components/FindingsPanel.tsx`: severity-grouped list + count chips + form modal (severity/scope/CVE/description)
- Engagement page'de heatmap altında render edilir
- FullEngagement.findings + getById yükler

### P1-E — Wordlist/payload references ✅
- Migration 0006: `wordlist_overrides(key, path, updated_at)` tablosu
- `src/lib/kb/wordlists.ts`: `DEFAULT_WORDLISTS` (14 Kali path), `interpolateWordlists(template, overrides?)`, `isValidWordlistKey`
- `src/lib/db/wordlists-repo.ts`: list/upsert/delete + `getWordlistOverridesMap`
- `app/api/wordlists/route.ts` GET+POST + `[key]/route.ts` DELETE
- `app/settings/wordlists/page.tsx` + `src/components/WordlistsEditor.tsx` (shipped/custom merged tablo, inline edit, reset/delete)
- `scripts/lint-kb.ts` PLACEHOLDER_ALLOWLIST artık `WORDLIST_[A-Z0-9_]+` kabul ediyor
- `interpolateCommand` (view-model + page) `wordlistOverrides` parametresi alıyor — KB/AR/user komutlarının üçü de aynı resolution geçiyor
- `report/page.tsx` + export `[format]` route — DB'den override map çekip `loadEngagementForExport`'a pass ediyor (print/PDF + MD/JSON/HTML export aynı resolved komutu görür)
- Resolution sırası: override → shipped default → token verbatim
- Test: 10 yeni unit test (interpolateWordlists + isValidWordlistKey) + 2 lint test case + route mock'u + base-table assertion 11→12

### P2 searchsploit MVP ✅
- `src/lib/exploits/searchsploit.ts` — argv-array `spawn` (no shell), 5 s timeout, 10 MB stdout cap, ENOENT → friendly "install via apt install exploitdb" mesajı, query sanitisation (`[A-Za-z0-9._-\s]`)
- `POST /api/exploits/lookup` — body `{ query }`, hits[] veya 400 (caller bug) / 503 (env) döner
- `PortDetailPane` Exploits section — button-driven (auto-fire yok), her port için `key` ile state reset; section auto-suppress (product/service yoksa)
- Engagement page `exploitQuery` deriviation: `${product} ${version}` → product → service → suppress
- searchsploit yoksa graceful: section render olur, butonu tıklayınca friendly error toast/inline

### AR multi-IP zip import ✅ (P1-F follow-up)
- Importer artık tüm `_full_tcp_nmap.xml` (veya `_quick_*`) entry'lerini topluyor; primary mevcut akışı sürdürür, secondary'ler `scan.hosts[]`'a eklenir
- Per-host AR file / manual command merge dışı (warning ile bilgilendirilir): "Multi-IP AR zip detected — N secondary host(s) imported (ports + scripts only; per-host AR data not merged)"
- Single-IP zips davranış değişikliği YOK

### P1-G — Diff between scans ✅ (2 PR)

**PR 1 — Schema + persistence (`9099f12`):**
- Migration 0008: `scan_history` tablosu (engagement_id, raw_input, source, scanned_at, created_at) + ports'a `first_seen_scan_id`/`last_seen_scan_id`/`closed_at_scan_id` nullable kolonlar
- Backfill: her engagement için inaugural scan_history row + tüm ports onun id'sine link
- `createFromScan` artık inaugural scan_history insert + portları link ediyor
- `scan-history-repo.ts`: `listScanHistory` + `rescanEngagement(db, id, scan, raw)` — host reconciliation (yeni IP → yeni non-primary host) + port lifecycle update (re-observed = last_seen advance + closed clear; absent = closed_at stamp; new = insert)
- API: `POST /api/engagements/[id]/rescan` — paste raw nmap → parseAny → rescanEngagement → result summary
- UI: `RescanModal` (textarea + submit + result toast) + `EngagementHeader` "Re-import" butonu (RotateCw icon)
- 4 yeni rescan repo testi (inaugural insert, last_seen advance, close+reopen, new host)

**PR 2 — Heatmap lifecycle chips:**
- Engagement page'de portData'ya `isClosed`/`isNew` flag ekle (`first_seen_scan_id == latestScanId && hasMultipleScans` koşullu)
- EngagementHeatmap PortTile: closed tile dim'lendirir + "closed" risk-crit chip; new tile accent-bordered "new" chip
- "Show N closed" toolbar toggle — default'ta closed'lar gizli; multi-scan engagement'larda görünür
- Tek scan engagement'larda lifecycle chip yok (golden behavior korunmuş)

### P1-H — Reporting tool exports ✅ (`8b6cc81` ya da yakın)
- `findings-csv.ts`: RFC 4180 flat CSV — severity/title/host/port/protocol/service/cve/description/created_at sütunları + CRLF + quote escape
- `sysreptor.ts`: jenerik `format: "projects/v1"` JSON shape — engagement scope + per-finding affected_components ("<host>:<port>/<proto>") + recon_deck_finding_id + opsiyonel CVE
- `pwndoc.ts`: hand-rolled minimal YAML serializer (byte-stable test çıktısı için js-yaml dep yok); title-cased severity
- Export route'a 3 yeni format (csv / sysreptor / pwndoc) + EngagementHeader Export dropdown'a 3 yeni item
- 12 yeni smoke test (4 her exporter)
- Multi-host aware: scope tüm hostları primary-first listeler; per-finding affected_components doğru host:port'a işaret

### GlobalSearch host context ✅
- `SearchHit.hostLabel` field eklendi — port-bound hit'ler için host adı (ya da IP)
- Search SQL: `kind in ('port','script','finding')` için CASE+LEFT JOIN ile host_label türet; engagement/note kind'ları null
- GlobalSearchModal hit row'da accent-bordered host chip (multi-host'ta)

### P1-F PR 4 — UI multi-host ✅ (2 atomic commit: 4-A + 4-B)

**PR 4-A (`d4967d7`):** ana UI değişikliği
- `?host=<id>` URL search param — engagement page okuyor; activeHost = `engagement.hosts.find(h => h.id === requested) ?? primary ?? hosts[0]`
- Engagement page portları aktif host'a filter ediyor (heatmap aktif host'a scope'lu)
- Command interpolation artık aktif host'un IP/hostname'ini kullanıyor (engagements.target_ip → activeHost.ip); single-host'ta aynı değer
- `EngagementHeader` multi-host'ta yeni "Hosts" satırı — her host bir Link chip (`?host=<id>`); aktif host highlight + primary için ★
- `Sidebar` engagement satırına "Nh" chip (host_count > 1 ise); single-host satır aynı
- `EngagementSummary.host_count` field eklendi; `listSummaries` correlated COUNT subquery

**PR 4-B (`0487e32`):** peripheral host context
- `CommandPalette` "Hosts" group (multi-host'ta) — ⌘K → host adı → Enter ile switch
- `FindingsPanel` finding chip'inde "host:port/proto" etiketi (multi-host'ta); finding listesi tüm engagement'ı kapsıyor
- `useUIStore.engagementContext` `hosts` + `activeHostId` slice eklendi
- `EngagementContextBridge` hosts ve activeHostId'yi store'a yazıyor

**Defer edilenler:**
- AR multi-IP importer — `results/<ip>/...` parse, fixture eksik
- GlobalSearchModal hit'lerinde host adı — cross-engagement search, host context daha geniş kapsam
- `engagements.target_ip/target_hostname` deprecate — şu an "primary host mirror" olarak retain, çalışıyor

### P1-F PR 3 — View-model + export multi-host ✅
- `EngagementViewModel.hosts: HostViewModel[]` — primary first then by IP; `vm.ports` / `vm.hostScripts` legacy mirror retain
- `HostViewModel { host, ports, hostScripts, isPrimary }`
- `loadEngagementForExport` her port'u host_id'sine göre grupluyor; primary host hostScripts'leri claim ediyor (PR 4'te `port_scripts.host_id` ile düzeltilecek)
- **Markdown:** multi-host'ta `## Host: <ip> (<hostname>) · primary` header her host için + altında ports table + port section'ları + host scripts; tek host'ta layout aynen (golden fixture byte-stable)
- **JSON:** multi-host'ta `schema_version: "2.0"` + `scan.hosts: [{target, is_primary, ports, hostScripts, os?}]`; tek host'ta `"1.0"` + `scan.hosts` omit (downstream consumer için back-compat); legacy `scan.ports` + `scan.hostScripts` her durumda primary mirror olarak retain
- **HTML:** multi-host'ta her host `<section class="host-block">` içinde + `<h2>Host: ...</h2>` + tablo/portlar/scripts; tek host'ta wrapper yok (golden HTML byte-stable)
- **`/report` page:** sub-component refactor (`HostBlock`, `PortBlock`, `PortsSummaryTable`, `HostScriptsSection`); multi-host branch `vm.hosts.map(<HostBlock />)`, tek host legacy flat
- `fixture-vm.ts`: local `EngagementViewModel/PortViewModel` shim view-model'den re-export'a dönüştü (Wave 1 cleanup); `buildMultiHostFixtureViewModel()` (2 host: dc01 primary + ws01 secondary RDP)
- **AR multi-IP importer:** PR 3 scope dışında bırakıldı — defer karar gereği. AR zip'i hâlâ tek-IP varsayıyor; multi-IP zip yapısı ileri bir PR'da
- 10 yeni smoke test: markdown (3) + json (4) + html (3) — multi-host header/schema/section assertion'ları
- Tek host davranışı **byte-for-byte korundu** — engagement.md/engagement.json/engagement.html golden fixture'ları hâlâ geçiyor

### P1-F PR 2 — Parser multi-host (XML full, text/greppable deferred) ✅
- `ParsedHost` tipi eklendi (`target`, `ports`, `hostScripts`, `os?`, `extraPorts?`, `traceroute?`)
- `ParsedScan.hosts: ParsedHost[]` zorunlu alan; `target/ports/hostScripts/os/extraPorts/traceroute` üst seviyede `hosts[0]` mirror'ı olarak retain edildi (PR 4 cleanup)
- `nmap-xml.ts`: `firstHost = hosts[0]` döngüsel hale geldi — her `<host>` elementi `ParsedHost`'a dönüşür; multi-host warning kaldırıldı; `buildParsedHost` helper'ı
- `nmap-text.ts`: multi-host warning kaldırıldı; `result.hosts = [primary]` set edildi (text multi-host parsing deferred — text scan multi-host pratikte nadir)
- `nmap-greppable.ts`: aynı pattern, multi-host warning kaldırıldı, hosts[0]'a bind
- `engagement-repo.createFromScan`: `scan.hosts` döngüsü — N hosts row + her port doğru host'a bağlı; AR data sadece primary host'a uygulanır; eski `scan.ports`/`scan.hostScripts` döngüleri (mirror) kaldırıldı (duplicate insert riski yok)
- Test fixture `makeScan` factory'leri (engagement/checklist/notes-repo testleri): `overrides.target/ports/hostScripts/hosts` doğru mirror'lanır
- Multi-host test: 3 hosts (DC + 2 WS) → 3 hosts row + ports doğru host_id'lere bağlı + primary first
- 1 yeni xml multi-host test: `multi-host.xml` artık `hosts.length === 3` üretiyor; legacy "additional host" warning kaldırıldı assertion
- Davranış değişikliği: **multi-host XML upload artık hepsini parse edip yazıyor** (ama UI hâlâ primary'i gösteriyor — PR 4'e kadar)

### P1-F PR 1 — Multi-host schema foundation ✅
- Migration 0007: `hosts` tablosu (engagement_id, ip, hostname, state, os_name, os_accuracy, is_primary, scanned_at) + `ports.host_id` ALTER + backfill (her engagement için 1 primary host satırı, tüm portlar primary'e bağlanır)
- `src/lib/db/hosts-repo.ts`: `listHostsForEngagement` + `getPrimaryHost` (read-side helper'lar)
- `schema.ts`: `hosts` table def + `ports.host_id` + `Host` tipi
- `types.ts`: `FullEngagement.hosts: Host[]` + `PortWithDetails` artık `host_id` taşıyor
- `engagement-repo.ts`:
  - `createFromScan` — primary host insert + her port'a `host_id` set
  - `getById` — host listesini hydrate (primary önce, sonra IP)
  - `updateTarget` — transaction içinde `engagements` + `hosts` (primary) dual-write (PR 4'te tek kaynağa indirilecek)
- `engagements.target_ip` / `target_hostname` retain edildi — UI hâlâ buradan okuyor; PR 4 cleanup
- Davranış değişikliği yok — UI tıpa tıp aynı, parsers/importer hâlâ tek host
- Test: 3 yeni test (primary insert, ports.host_id linking, getById hydration) + base-table 12→12 (hosts eklendi assertion)

### P0-D — Manual port + custom commands ✅
- Migration 0005: `user_commands` tablosu (service/port nullable filtreler)
- `src/lib/db/user-commands-repo.ts`: list/create/update/delete + `matchUserCommands(service, port)`
- `src/lib/db/ports-repo.ts`: `addManualPort` (engagement içinde duplicate dedupe), `deletePort`
- `app/api/engagements/[id]/ports/route.ts` POST + `[portId]/route.ts` DELETE
- `app/api/user-commands/route.ts` GET+POST + `[commandId]/route.ts` PATCH+DELETE
- `src/components/AddPortButton.tsx`: heatmap toolbar'da "Add port" + modal (port/proto/service/version/SSL tunnel)
- `src/components/CommandsEditor.tsx`: `/settings/commands` sayfasında inline-edit table CRUD
- `app/settings/commands/page.tsx`: settings shell
- Engagement page: KB commands'in yanına `userCommands` (matchUserCommands) merge
- PortDetailPane: yeni "My Commands" section (KB commands'in üzerinde)
- EngagementHeatmap: `showAddPort` prop; Add Port butonu attack-surface header sağına

---

## ⏳ Yapılacaklar — Sıralı Plan

Her görev: schema/DB → repo/server → API → UI → typecheck + test. Her görev sonu: `npx tsc --noEmit && npm test`.

### P1-F — Multi-host engagement (4 PR'a bölündü)

PR 1 + PR 2 + PR 3 + PR 4 ✅ bitti. Kalan ufak işler:

**Defer edilen P1-F işleri (ayrı küçük PR'lar):**
- AR multi-IP importer (`results/<ip>/...`)
- GlobalSearchModal hit'lerinde host adı
- `engagements.target_ip/target_hostname` deprecate (PR 4 retain etti, dual-write çalışıyor)
- nmap-text + greppable parser multi-host (XML zaten tam multi-host)

### P0-B — Screenshot/evidence integration

**Amaç:** Pentester'ın delillerini saklayabileceği per-port evidence sistemi. AR gowitness PNG'leri zaten import ediliyor — onları evidence olarak işaretle. Yeni screenshot'lar drag-drop / clipboard paste ile.

**Schema (yeni tablo + migration 0003):**
```sql
CREATE TABLE port_evidence (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id INTEGER NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  port_id       INTEGER REFERENCES ports(id) ON DELETE CASCADE,    -- nullable: host-level evidence
  filename      TEXT NOT NULL,
  mime          TEXT NOT NULL,    -- 'image/png' | 'image/jpeg' | ...
  data_b64      TEXT NOT NULL,    -- base64-encoded binary
  caption       TEXT,
  source        TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'autorecon-import'
  created_at    TEXT NOT NULL
);
CREATE INDEX port_evidence_port_id_idx ON port_evidence(port_id);
CREATE INDEX port_evidence_engagement_id_idx ON port_evidence(engagement_id);
```

**Backfill:** AR import'tan gelen `autorecon-screenshot` artifact'ları otomatik olarak port_evidence'a kopyalansın (filename üzerinden port match'i: `tcp80/...png` → port 80).

**API:**
- `POST /api/engagements/[id]/evidence` — multipart upload (file + portId? + caption?)
- `DELETE /api/engagements/[id]/evidence/[evidenceId]`

**Components:**
- `src/components/EvidencePane.tsx` — per-port evidence gallery (thumbnails + click-to-zoom modal)
- `src/components/EvidenceUploader.tsx` — drag-drop zone + clipboard paste handler (`document.addEventListener('paste', ...)` when port focused)
- PortDetailPane'e "Evidence" sağ kolon section'ı eklenmeli

**Tehlike:** Base64 row'lar büyük (1-5 MB). DB row size kapasitesi var — `MAX_FILE_SIZE` 4 MB cap koy.

---

### P0-C — Findings tracker

**Amaç:** Pentester'ın keşfettiği bulguları (severity + title + description + CVE + evidence ref) açıkça kaydet. Reporting tool'larına temiz JSON akıt.

**Schema (yeni tablo + migration 0004):**
```sql
CREATE TABLE findings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id INTEGER NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  port_id       INTEGER REFERENCES ports(id) ON DELETE SET NULL,   -- nullable: engagement-level finding
  severity      TEXT NOT NULL CHECK(severity IN ('info','low','medium','high','critical')),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  cve           TEXT,                                                -- comma-separated CVE list
  evidence_refs TEXT NOT NULL DEFAULT '[]',                          -- JSON array of port_evidence.id
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX findings_engagement_id_idx ON findings(engagement_id);
```

**FTS5 trigger güncellemesi:** Findings'in title + description'ını search_index'e ekle (kind='finding').

**Components:**
- `src/components/FindingsPanel.tsx` — engagement view'da yeni "Findings" sekmesi/paneli
- `src/components/FindingForm.tsx` — quick-add form (port detail pane'de "Add finding" butonu)
- `src/components/FindingCard.tsx` — severity badge + title + description + evidence thumbnails
- Engagement header'a finding count chip ekle ("3 findings: 1 crit, 2 high")

**API:**
- `POST/PATCH/DELETE /api/engagements/[id]/findings`

---

### P0-D — Manual port + custom commands

**Amaç:** Pentester nmap'in görmediği bir servisi keşfederse elle port ekleyebilsin. Kişisel command snippet'lerini saklasın.

**Schema:**
- `ports` tablosuna kolon eklemeye gerek yok (manual eklenenler `service` field'ı dolu, normal kayıt gibi)
- Yeni tablo `user_commands`:
```sql
CREATE TABLE user_commands (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  service       TEXT,         -- nullable: global commands
  port          INTEGER,      -- nullable: service-only filter
  label         TEXT NOT NULL,
  template      TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
```

**UI:**
- Heatmap'te "Add port" butonu → modal (port + protocol + service + version + risk override)
- Settings sayfası `/settings/commands` → personal command bank CRUD
- KB matchPort()'a `userCommands` arg'ı ekle, KB komutlarının yanında render edilsin

---

### P1-E — Wordlist/payload references

**Amaç:** KB komutlarında `{WORDLIST_DIRB}` gibi placeholder → SecLists path otomatik dolar.

**Implementation:**
- `src/lib/kb/wordlists.ts`: lookup tablosu (`WORDLIST_DIRB → /usr/share/wordlists/dirb/common.txt`)
- `interpolateCommand` fonksiyonunu (engagement page + view-model'de iki yerde) genişlet, `{WORDLIST_*}` placeholder'larını da çözsün
- Settings sayfasında custom override (kullanıcı kendi path'ini set edebilsin)
- Settings yeni tablo `app_settings (key, value)` veya environment variable

**KB YAML şemasına etki:** Mevcut `{IP}/{PORT}/{HOST}` listesinin yanına `{WORDLIST_*}` prefix'i — Zod schema'ya validation kuralı.

---

### P1-F — Multi-host engagement

**Amaç:** AD environment için tek engagement = N host (DC + workstations). Şu anki "first host only" gerçek bir AD pentest'inde saçma kalıyor.

**Büyük schema değişikliği (migration 0005):**
```sql
CREATE TABLE hosts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id INTEGER NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  ip            TEXT NOT NULL,
  hostname      TEXT,
  state         TEXT,
  os_name       TEXT,
  os_accuracy   INTEGER,
  is_primary    INTEGER NOT NULL DEFAULT 0,
  scanned_at    TEXT
);
ALTER TABLE ports ADD COLUMN host_id INTEGER REFERENCES hosts(id);
-- migration: every existing port gets a backfilled host_id pointing to a
-- newly-created hosts row (one per engagement, is_primary=1, ip=engagement.target_ip)
```

**Parser:** XML parser'ın multi-host warning'ini kaldır, tüm host'ları gerçekten parse et.

**UI:**
- EngagementHeader'da host selector (DC, WS01, WS02 dropdown veya tab'lar)
- Heatmap aktif host'a scope'lanır
- Sidebar'da host count chip ("3 hosts")
- ⌘K palette'inde host jump

**Risk:** Mevcut tek-host engagement'larda hiç görünür değişiklik olmamalı (backfill ile). Tüm sample data + testler güncellenmeli.

---

### P1-G — Diff between scans

**Amaç:** Aynı hedefi tekrar tara → "21/tcp şimdi closed", "yeni 8080 açıldı" diff göster.

**Schema (migration 0006):**
```sql
CREATE TABLE scan_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id INTEGER NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  raw_input     TEXT NOT NULL,
  source        TEXT NOT NULL,
  scanned_at    TEXT,
  created_at    TEXT NOT NULL
);
ALTER TABLE ports ADD COLUMN first_seen_scan_id INTEGER;
ALTER TABLE ports ADD COLUMN last_seen_scan_id  INTEGER;
ALTER TABLE ports ADD COLUMN closed_at_scan_id  INTEGER;
```

**Implementation:**
- "Re-import nmap" butonu (engagement header'da)
- Yeni scan tarihinde port set'i diff'le (mevcutta var/yeni/eksik)
- Diff view: "Compare to scan X (2 weeks ago)"

---

### P2 candidate — Local exploit lookup (searchsploit/CVE)

**Fikir kaynağı:** Kullanıcı, 2026-04-25 oturumunda önerdi.

**Amaç:** Bir port'un servisi/sürümü veya engagement'in OS bilgisi tespit edildiğinde, **local kaynaklara** sorgu atıp eşleşen exploit / CVE varsa otomatik göstermek. Manuel "her servis için searchsploit aç" döngüsünü kaldırır.

**Veri kaynakları (sıralı tercih):**
1. **searchsploit (exploit-db local DB)** — Kali default, `/usr/share/exploitdb/files_exploits.csv` üzerinden okunabilir veya `searchsploit -j --json "<query>"` shell-out
2. **NVD CVE local mirror** — opsiyonel; v2'de "official Anthropic API" benzeri ayrı bir bileşen
3. **vulners local DB** — opsiyonel; ek paket
4. **KB known_vulns** — zaten KB YAML'da var; önce buradan eşleşmeyi göster

**Implementation iskeleti:**
- `src/lib/exploits/searchsploit.ts`: shell-out helper (path autodetect + timeout + sandbox), `lookupBy({ product, version, os })` → `{ id, title, type, path, date }[]`
- Tetikleme yerleri:
  - PortDetailPane: port'un product/version/cpe'sine göre lookup; sonuçlar yeni "Exploits" section'da listelenir
  - EngagementHeader: engagement.os_name'e göre OS-level lookup; chip + popover
  - Findings panel "Add finding from exploit" shortcut: tek tıkla searchsploit hit'i → finding (severity heuristic + auto-fill title/CVE)
- Cache: SQLite tablo `exploit_cache(query_hash, results_json, fetched_at)` — searchsploit shell-out maliyetli olduğundan invalidate'e kadar sakla
- Settings: `/settings/exploits` — searchsploit binary path override + cache TTL + enable/disable

**Tehlike alanları:**
- Shell injection: `searchsploit` argümanları **mutlaka argv array** ile geçirilmeli (`spawn`, asla `exec` veya template string)
- Yanlış pozitif: nginx 1.18 → "nginx 1.18.x DoS" gibi geniş eşleşmeler. Version constraint'i strict tut, fallback widen sadece manuel tetiklenince
- Performance: bir engagement'ta 30 port = 30 lookup. Per-port lookup async + cache + dedup
- Privacy: tamamen local — searchsploit shell-out internet'e çıkmaz, network beacon yok (bu **temel istisna**: NVD mirror seçilirse internet erişimi opt-in olmalı)

**Bağımlılık:** P1-F (multi-host) bittikten sonra anlamlı — multi-host engagement'ta her host'un OS'i ayrı lookup gerektirir.

---

### P1-H — Reporting tool exports

**Amaç:** SysReptor, PwnDoc, generic CSV ekstra export formatları.

**Implementation:**
- `src/lib/export/sysreptor.ts`: SysReptor JSON template'ine uygun shape (findings → report sections)
- `src/lib/export/pwndoc.ts`: PwnDoc YAML
- `src/lib/export/findings-csv.ts`: severity, title, port, cve, description (CSV)
- `app/api/engagements/[id]/export/[format]/route.ts`'e yeni format'lar ekle
- EngagementHeader Export dropdown'a ekle

---

### DIST — Docker UX iyileştirmeleri

**Amaç:** Docker zaten çalışıyor (`ghcr.io/kocaemre/recon-deck`). Pentester onboarding sürtünmesini düşürmek için keşfedilebilirlik + tek-komut kurulum.

**Adımlar:**
1. `install.sh` repo root'una — `docker run -d -v ~/.recon-deck/data:/data -p 3000:3000 ghcr.io/kocaemre/recon-deck:latest` arka planda çalıştırır + browser açar
2. `docker-compose.yml` repo root'una — persistent volume + port mapping + restart policy
3. README quickstart section: "Kali'de 30 saniyede" başlıklı, üç yol (one-liner, compose, manuel docker run)
4. GitHub Releases'da version'lanmış image tag'i (latest yanında v2.0, v2.1 gibi)

**Out of scope (artık):** Bun binary build pipeline. Docker + Compose pentester ihtiyacını fazlasıyla karşılıyor; Bun + Next.js bleeding edge ve maintenance yükü değer önerisini aşıyordu.

---

## Resume noktası

**Şu an nerede:** P0 + P1-E + P1-F + P1-G + P1-H + GlobalSearch host context tamam. Tüm büyük v2 hedefleri yerleşmiş durumda. Manuel Chrome doğrulaması önerilir — multi-host scan upload + Re-import + Export menü'den 3 yeni format + GlobalSearch ⌃⇧F.

**Son commit'ler (origin/main):**
- (yeni) P1-G PR 2 (heatmap lifecycle chips + closed toggle)
- (yeni) P1-G PR 1 (scan_history + rescan API + RescanModal)
- (yeni) P1-H exports (CSV + SysReptor + PwnDoc)
- (yeni) GlobalSearch host context
- `0487e32` P1-F PR 4-B (palette + findings host context)
- `d4967d7` P1-F PR 4-A (header selector + sidebar host count)
- `1972040` P1-F PR 3 (view-model + 3 export + report page)
- `a5e89aa` v2 batch (P0 + P1-E + P1-F PR 1+2)

**Sıradaki seçenekler (kalanlar):**
1. **nmap-text/greppable multi-host parser** — defer'd. XML zaten tam multi-host. Pentester'lar genelde XML upload eder. Düşük öncelik.
2. **target_ip deprecate** — `engagements.target_ip/target_hostname` retain edilmiş (primary host mirror, dual-write çalışıyor). Schema temizliği için migration 0009 + cascade gerekir; pragmatik retain.
3. **DIST — Docker UX** — install.sh + docker-compose.yml + README quickstart. Küçük iş, ~30 dk.
4. **searchsploit cache** — şu an her tıkta shell-out. Per-port cache (memory veya DB) eklenebilir; minor.
5. **P2 ek lookup'lar** — NVD CVE local mirror, vulners local DB, KB known_vulns auto-match. searchsploit'a benzer pattern.

**P1-G (diff between scans) ve P1-H (SysReptor exports) görece izole, sırayla yapılabilir — P1-F PR'ları bittikten sonra.**

**DIST (Docker UX) — küçük iş: install.sh + docker-compose.yml + README quickstart. Bun binary roadmap'ten çıkarıldı.**

**Test komutları (her görev sonu):**
```bash
cd /Users/0xemrek/Desktop/recon
npx tsc --noEmit              # 0 hata bekleniyor
npm test                       # 397+/397+
nohup npx next dev -p 3030 > /tmp/nextdev.log 2>&1 &
```

**Git:** `a5e89aa` (origin/main'de) PR 1+2 dahil tüm v2 P0+P1-E+P1-F PR 1-2'yi içerir. PR 3 ayrı commit alınmalı (mantıklı kapsam: importer + view-model + 3 export generator + report page + testler).
- 7 yeni UI component (GlobalSearchModal, EvidencePane, FindingsPanel, AddPortButton, CommandsEditor, ...)
- Engagement page integration + Sidebar global search

**Yapılan testler:**
- 17 yeni parser test (P0 öncesi v2 enrichment)
- Sınıflar: client-boot (10 base table), parser, importer, export, security, KB
- Yeni P0 görevleri için unit test eklenmedi (UI heavy + zaman) — manuel test Chrome'da yapılabilir.

---

## Açık Kararlar / Düşünülecekler

- **PR 3 — AR multi-IP importer scope:** AutoRecon zip'i `results/<ip>/...` yapısında multi-IP olabilir. PR 3'te tam destek mi (zip'i her IP için ayrı host olarak parse), yoksa **defer** edip PR 3'ü sadece view-model + export'a indirgeyip AR multi-IP'i ayrı küçük PR'a mı bırakalım? Defer daha güvenli çünkü AR multi-IP fixture'ı yok, yeni edge-case'ler çıkar; tam destek daha "tam" hisseder. Önerim: **defer.** PR 3 kapsamı = sadece view-model + 3 export + report page + testler.
- **PR 3 — JSON export shape breaking change:** Mevcut JSON export `ports: [...]` top-level. Multi-host shape'inde `hosts: [{ports: [...]}]` olmalı. SysReptor/PwnDoc gibi downstream tüketici varsa breaking change. Önerim: `export_version: 2` field'ı ekle + eski `ports` field'ını compat için **bilinçli olarak retain et** (= `hosts.flatMap(h => h.ports)`).
- **PR 4 — `engagements.target_ip/target_hostname` sonu:** PR 4'te UI host selector eklenince bu kolonlar deprecate. Tamamen kaldır mı (migration 0008 + cascade), yoksa retain edip "primary host'un mirror'ı" olarak documente et mi? Kaldırmak temiz ama migration cost'u var; retain etmek dual-write ile kalır (createFromScan + updateTarget zaten yazıyor).
- ~~**better-sqlite3 → bun:sqlite migration'ı**~~ — Bun binary roadmap'ten çıkarıldığı için artık gerekli değil; better-sqlite3 ile kalınıyor.
- **port_evidence MAX_FILE_SIZE:** 4 MB mı 8 MB mı? Pentester clipboard paste'i 1-2 MB olur genelde, 4 MB cap mantıklı.
- **Scan history vs raw_input:** P1-G mevcut `engagement.raw_input`'u koruyor mu, yoksa scan_history'ye taşıyıp engagement'tan kolonu kaldırıyor mu?
- **searchsploit cache TTL:** P2 candidate — exploit lookup cache invalidate süresi (1 hafta? manual refresh?). exploitdb haftalık update.

---

## Geri planda kalanlar (yapılmadı, scope dışı tutuldu)

- **Density toggle** (Comfortable/Compact/Ultra) — design handoff'ta opsiyonel
- **AR UDP scan ek varyantları** (`_top_100_udp_nmap.xml` vb.) — şimdilik sadece `_top_20_udp_nmap.xml`
- **Plugin/scripting API** — `Out of Scope`'ta açıkça reddedilmiş
- **Multi-user** — `Out of Scope`'ta açıkça reddedilmiş
- **AI/LLM önerileri** — v2 candidate ama v1.x'te yok
