# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────
# Stage 1: deps — install node_modules (incl. better-sqlite3 musl build)
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

# Alpine needs build tooling for the better-sqlite3 native .node binary.
# libc6-compat is occasionally required by Next.js at install time.
# python3/make/g++ are needed by node-gyp.
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./

# npm ci is reproducible and refuses to resolve a lockfile drift.
# We install ALL deps (dev + prod) because `next build` needs devDeps.
RUN npm ci --no-audit --no-fund

# ─────────────────────────────────────────────────────────────────────
# Stage 2: builder — run `next build` to produce .next/standalone
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js standalone output lands in .next/standalone/ (requires
# `output: "standalone"` in next.config.mjs — already set).
RUN npm run build

# Verify the better-sqlite3 .node binary survived the build trace.
# If this fails, the runtime stage will silently break at DB init —
# much harder to debug than a build-time assertion.
RUN test -f node_modules/better-sqlite3/build/Release/better_sqlite3.node \
    || (echo "ERROR: better-sqlite3 native binary missing" && exit 1)

# ─────────────────────────────────────────────────────────────────────
# Stage 3: runner — minimal image, non-root, default bind 127.0.0.1
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# Only libstdc++ is needed at runtime for the compiled .node binary.
# No build tooling shipped — keeps the image minimal.
RUN apk add --no-cache libstdc++

# Security defaults per SEC-06 and ARCHITECTURE.md:
#   - USER node (UID 1000) — non-root
#   - HOSTNAME=127.0.0.1 — loopback-only inside container
#   - NODE_ENV=production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=127.0.0.1
ENV PORT=3000

# recon-deck runtime env vars (already honored by code — verified):
ENV RECON_DB_PATH=/data/recon-deck.db
ENV RECON_KB_USER_DIR=/kb

# ── Required standalone artifacts ──
# server.js + a minimal node_modules subtree
COPY --from=builder --chown=node:node /app/.next/standalone ./
# Static assets (CSS/JS/images) — standalone does NOT copy these automatically
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Public assets (if any) — same reason
COPY --from=builder --chown=node:node /app/public ./public

# ── Shipped knowledge base (KB-01..KB-12) ──
# KB loader uses path.join(process.cwd(), "knowledge", ...) at three call sites.
# process.cwd() inside the runtime image is /app, so KB lands at /app/knowledge.
COPY --from=builder --chown=node:node /app/knowledge ./knowledge

# ── Drizzle migrations (PERSIST-05) ──
# Migrations run at boot via src/lib/db/client.ts. They live at
# src/lib/db/migrations in source; they need to reach the standalone
# bundle. If next.js output tracing misses them, copy explicitly:
COPY --from=builder --chown=node:node /app/src/lib/db/migrations ./src/lib/db/migrations

# ── Data + KB-override volumes ──
# Create empty dirs owned by `node` so the user doesn't get a UID-mismatch
# error on first boot. Volumes mounted at these paths will overlay and
# inherit `node` ownership on most platforms.
RUN mkdir -p /data /kb && chown -R node:node /data /kb
VOLUME /data
VOLUME /kb

USER node

EXPOSE 3000

# OCI label auto-links image to GitHub repo (package-to-repo visibility,
# auto-inherits repo permissions) [CITED: GitHub Packages docs].
LABEL org.opencontainers.image.source=https://github.com/kocaemre/recon-deck
LABEL org.opencontainers.image.description="From nmap output to an actionable, port-aware recon checklist in under 30 seconds — offline, single-binary self-host."
LABEL org.opencontainers.image.licenses=MIT

# Docker HEALTHCHECK — useful for `docker ps` / orchestrators. NOT a
# substitute for the CI smoke test (HEALTHCHECK runs inside the container;
# CI smoke test runs from the host, proving the port mapping works).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
