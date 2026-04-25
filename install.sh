#!/usr/bin/env bash
#
# recon-deck — one-liner Docker installer.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/kocaemre/recon-deck/main/install.sh | sh
#
# What it does:
#   1. Verifies docker + docker daemon are reachable.
#   2. Pulls the latest ghcr.io/kocaemre/recon-deck image.
#   3. Creates persistent named volumes for the SQLite DB + user KB.
#   4. Runs the container detached on 127.0.0.1:3000 (loopback only — solo
#      pentest tool, never exposed to LAN by default).
#   5. Tries to open the browser (Linux: xdg-open, macOS: open).
#
# To uninstall: `docker rm -f recon-deck && docker volume rm recondeck-data recondeck-kb`.

set -euo pipefail

IMAGE="ghcr.io/kocaemre/recon-deck:latest"
CONTAINER_NAME="recon-deck"
PORT="3000"
URL="http://localhost:${PORT}"

# 1. Pre-flight — docker reachable?
if ! command -v docker >/dev/null 2>&1; then
  printf 'docker not found on PATH. Install Docker first:\n' >&2
  printf '  https://docs.docker.com/get-docker/\n' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  printf 'docker daemon not reachable. Start the daemon (e.g. `sudo systemctl start docker`).\n' >&2
  exit 1
fi

# 2. Pull image (latest tag).
printf 'Pulling %s …\n' "$IMAGE"
docker pull "$IMAGE"

# 3. Stop + remove any prior instance with the same name. Volumes survive.
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  printf 'Stopping prior %s container (data volumes preserved)…\n' "$CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

# 4. Run.
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "127.0.0.1:${PORT}:3000" \
  -v recondeck-data:/data \
  -v recondeck-kb:/kb \
  -e HOSTNAME=0.0.0.0 \
  "$IMAGE" >/dev/null

printf '\nrecon-deck is up at %s\n' "$URL"
printf 'Stop  : docker stop %s\n' "$CONTAINER_NAME"
printf 'Logs  : docker logs -f %s\n' "$CONTAINER_NAME"
printf 'Update: re-run this script (volumes are preserved).\n'

# 5. Try to open the browser. Failures are non-fatal — the URL above is
#    the operator-visible source of truth.
if command -v xdg-open >/dev/null 2>&1; then
  (xdg-open "$URL" >/dev/null 2>&1 &) || true
elif command -v open >/dev/null 2>&1; then
  (open "$URL" >/dev/null 2>&1 &) || true
fi
