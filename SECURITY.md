# Security Policy

recon-deck is a single-user, self-hosted, offline tool. This document describes the threat model it defends against, the guarantees it provides, and the hardening postures that are turned on by default. It is intentionally explicit — pentesters need to know exactly what they're running.

---

## Reporting Vulnerabilities

If you find a security issue, please report it through one of these channels:

- **Email:** 0xemrek@proton.me
- **GitHub Security Advisories:** <https://github.com/kocaemre/recon-deck/security/advisories/new>

This is a solo-maintainer project, not an enterprise offering. Expected response is best-effort within 7 days. Please do not disclose publicly before the maintainer has had a chance to respond.

---

## Threat Model — What We Defend Against

### DNS rebinding

**Threat.** An attacker controls a DNS name that resolves to `127.0.0.1`. A victim with recon-deck running locally visits the attacker's site; JavaScript on that site issues `fetch("http://attacker-controlled-name:13337/api/...")`. Because the browser's same-origin policy is keyed on hostname, the attacker's origin can exfiltrate or tamper with recon-deck's state.

**Mitigation.** Host-header allowlist middleware (`middleware.ts`, SEC-01) rejects any request whose `Host:` header is not in the allowlist. Default allowlist: `localhost:13337`, `127.0.0.1:13337`, `[::1]:13337` (with the port auto-derived from `PORT`). Mismatch returns HTTP 421 Misdirected Request with no response body (avoiding information leakage to the attacker).

Users who expose recon-deck on a LAN or mDNS hostname opt in explicitly via the `RECON_DECK_TRUSTED_HOSTS` environment variable (comma-separated host:port list). This keeps the attack surface tight by default.

### XSS via attacker-controlled scan data

**Threat.** nmap output — especially NSE script output, hostnames, service banners — may contain attacker-controlled strings. Rendering those strings as raw HTML would execute attacker-chosen JavaScript in the context of recon-deck's origin, bypassing host-header protection entirely.

**Mitigation.**

- No `dangerouslySetInnerHTML` anywhere in the codebase (ESLint-enforced, SEC-03).
- All NSE output, banners, service names, and user notes rendered as React text nodes — React escapes them automatically.
- Content-Security-Policy: `default-src 'self'; script-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'` (SEC-02).
- External links carry `rel="noopener noreferrer"` and a scheme allowlist (`http:` / `https:` only).

### XXE in nmap XML

**Threat.** A pasted nmap XML containing `<!DOCTYPE>` declarations or external entity references could exfiltrate files from the container filesystem or cause a denial-of-service via entity expansion ("billion laughs").

**Mitigation.** The XML parser (`fast-xml-parser`) is configured with `processEntities: false`, and the parser module detects DOCTYPE declarations in the input and rejects the whole document outright (SEC-05). The XML is always parsed server-side — never in the browser.

### KB poisoning (malicious YAML in the user-override volume)

**Threat.** A user drops a malicious YAML file at `/kb/foo.yaml` — either unknowingly (copy-pasted from an untrusted source) or mistakenly. That file could contain dangerous commands, schema violations, or `resources[]` URLs pointing at attacker-controlled destinations.

**Mitigation.**

- Loader soft-fails per-file: one bad YAML doesn't break the whole KB (KB-03).
- Zod-validates every entry against the canonical schema — `schema_version: 1` + command structure + resource URL format (KB-02, KB-11).
- Command denylist enforced at lint time: `rm -rf`, `curl | sh`, `wget | sh`, `/dev/tcp`, shell-injection patterns, etc.
- URL scheme allowlist for `resources[]`: only `http://` and `https://` are accepted.
- All KB is loaded at startup and held in memory — no runtime eval, no dynamic import.

**Caveat — user KB is trusted.** A user who intentionally drops their own YAML is exercising their own judgment. recon-deck treats user-supplied KB as trusted input, same posture as Obsidian plugins or Vim rc files. We protect against accidental corruption and obvious-footgun patterns, not against a user who intentionally writes `rm -rf /` into their own KB.

### Mounted-volume trust

**Threat.** The `/data` (SQLite DB) and `/kb` (user KB overrides) volumes are user-mounted on container startup. A user who mounts a shared directory from an untrusted source — a mounted network share, a directory populated by another tenant on the host — would import whatever contents live there.

**Mitigation.** Out of scope. recon-deck treats the mounted-volume contents as trusted input. Mounting a shared or attacker-controlled directory is explicitly not defended against — it would violate the single-user, local-tool posture.

---

## What We Do NOT Defend Against

Stated explicitly to avoid unearned trust:

- **Authentication / authorization.** recon-deck has no login, no users, no roles. It is a single-user local tool by design. Multi-user or multi-tenant threats are out of scope.
- **Network sniffing on the loopback interface.** If another process on your machine is tapping `lo`, that's your host's problem.
- **A physically compromised host.** If the attacker has local filesystem access, game over.
- **A malicious browser.** If your browser is running attacker-controlled extensions or a malicious profile, it can steal anything rendered in recon-deck.
- **Supply-chain attacks on transitive dependencies.** Mitigated indirectly by version pinning and CI, but not actively audited.

---

## Offline Guarantee (OPS-03)

**recon-deck's server process makes zero outbound HTTP requests.**

- `NEXT_TELEMETRY_DISABLED=1` is set in the Dockerfile.
- The codebase contains no `fetch(...)` / `axios.get(...)` / `https.request(...)` calls to external hosts from server code.
- Resource links in cards open in the user's browser (which the user already trusts) — never from the container.
- No auto-update check, no "new version available" notification, no usage pings, no crash reports. Updates are user-initiated via `docker pull`.

This invariant is verified today by code review. A network-sniff CI guard (running the container with an egress-blocking iptables rule and asserting zero outbound packets) is a future hardening item.

---

## Default-Deny Postures

| Posture               | How it's enforced                                                                  | Requirement |
| --------------------- | ---------------------------------------------------------------------------------- | ----------- |
| Loopback bind         | Default Docker Quick Start uses `-p 127.0.0.1:13337:13337`; host port only reachable from the host's loopback interface | OPS-02      |
| Non-root container    | `USER node` (UID 1000) in Dockerfile; entire Node process runs as non-root         | SEC-06      |
| CSP object + frames   | `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`                   | SEC-02      |
| External link safety  | All external `<a>` carry `rel="noopener noreferrer"`; scheme allowlist `http:`/`https:` only | SEC-04      |
| Host-header allowlist | `middleware.ts` rejects requests with Host mismatched against the allowlist        | SEC-01      |
| XSS prevention        | No `dangerouslySetInnerHTML`; React text-node rendering; ESLint-enforced           | SEC-03      |
| XXE prevention        | `fast-xml-parser` with `processEntities: false`; DOCTYPE rejection                 | SEC-05      |

---

## Known Tech Debt

### `script-src 'unsafe-inline'` is currently required

The CSP ships with `script-src 'self' 'unsafe-inline'` because Next.js injects inline `<script>` tags for hydration data (`__NEXT_DATA__`, RSC payload, chunk preloads). Without `'unsafe-inline'`, CSP violations break every `"use client"` component in production.

In development mode, `'unsafe-eval'` is also required because webpack uses `eval()` for hot module replacement (react-refresh-utils). Without it, client components fail to hydrate and every `onClick`/`onChange` handler is dead.

The correct long-term fix is nonce-based CSP via middleware — Next.js 15.5 supports this — but it requires per-request nonce generation and propagation through the RSC render tree. Deferred to a future hardening phase.

This verbatim rationale is pinned at the top of `next.config.mjs` so it stays visible to anyone reviewing the CSP.

---

## Container Supply-Chain Posture

- Image is published to `ghcr.io/kocaemre/recon-deck` via tag-triggered GitHub Actions (`.github/workflows/release.yml`).
- Multi-arch manifest (`linux/amd64`, `linux/arm64`) built with `docker/build-push-action@v6`.
- Authentication uses the ambient `GITHUB_TOKEN` with `packages: write` — no long-lived PAT.
- OCI label `org.opencontainers.image.source=https://github.com/kocaemre/recon-deck` auto-links the image to the source repo on GitHub for provenance verification.
- Cosign / sigstore signing is a future hardening item — see ROADMAP.md.

---

## Verifications You Can Run Yourself

Once you've pulled the image, these commands confirm the default-deny postures:

```bash
# Runs as non-root (UID 1000, USER node)
docker inspect ghcr.io/kocaemre/recon-deck:2.1.0 | jq '.[0].Config.User'
# → "node"

docker run --rm ghcr.io/kocaemre/recon-deck:2.1.0 id -u
# → 1000

# Host-header middleware rejects a bad Host header with HTTP 421
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: evil.example.com" http://127.0.0.1:13337/
# → 421

# The liveness endpoint responds only on allowed hosts
curl -s http://127.0.0.1:13337/api/health
# → {"ok":true,...}
```

---

## Summary

recon-deck is offline, single-user, self-hosted, and non-root. Its threat model is narrow because its scope is narrow: a local tool that turns nmap output into a checklist. It is not a multi-tenant service, a public-facing web app, or a cloud platform, and its defenses are tuned accordingly. If your deployment deviates from the "single user on their laptop" model, you are responsible for the incremental controls that scenario requires.
