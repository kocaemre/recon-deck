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
#   4. Runs the container detached on 127.0.0.1:13337 (loopback only — solo
#      pentest tool, never exposed to LAN by default). Port 13337 was picked
#      to dodge the dev-server crowd that lives on 3000/8080.
#   5. Tries to open the browser (Linux: xdg-open, macOS: open).
#
# To uninstall: `docker rm -f recon-deck && docker volume rm recondeck-data recondeck-kb`.

set -euo pipefail

IMAGE="ghcr.io/kocaemre/recon-deck:latest"
CONTAINER_NAME="recon-deck"
PORT="13337"
URL="http://localhost:${PORT}"

# 1. Pre-flight — docker reachable?
if ! command -v docker >/dev/null 2>&1; then
  printf 'docker not found on PATH. Install Docker first:\n' >&2
  printf '  https://docs.docker.com/get-docker/\n' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  printf 'docker daemon not reachable. Start the daemon, then re-run this script:\n' >&2
  case "$(uname -s)" in
    Darwin)
      printf '  open -a Docker            # macOS: launch Docker Desktop, wait for the menubar whale to settle\n' >&2
      ;;
    Linux)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        printf '  WSL: ensure Docker Desktop is running on the Windows host with WSL integration enabled.\n' >&2
        printf '  recon-deck will not work with a WSL-internal docker daemon without that setting.\n' >&2
      else
        printf '  sudo systemctl start docker   # systemd\n' >&2
        printf '  # or:  sudo service docker start\n' >&2
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      printf '  Windows: open Docker Desktop from the Start menu, or run: start docker\n' >&2
      ;;
    *)
      printf '  (start Docker via your platforms preferred mechanism)\n' >&2
      ;;
  esac
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
  -p "127.0.0.1:${PORT}:13337" \
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
