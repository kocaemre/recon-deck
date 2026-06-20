#!/bin/sh
#
# recon-deck — one-liner Docker installer.
#
# Usage:
#   Stable: curl -sSL https://raw.githubusercontent.com/kocaemre/recon-deck/main/install.sh | sh
#   Beta:   curl -sSL https://raw.githubusercontent.com/kocaemre/recon-deck/main/install.sh | sh -s -- --beta
#
# Channels:
#   (default)  pulls :latest — the stable release.
#   --beta     pulls :beta   — the newest pre-release build (may be unstable).
#
# What it does:
#   1. Verifies docker + docker daemon are reachable.
#   2. Pulls the selected ghcr.io/kocaemre/recon-deck image (stable or beta).
#   3. Creates persistent named volumes for the SQLite DB + user KB.
#   4. Runs the container detached on 127.0.0.1:13337 (loopback only — solo
#      pentest tool, never exposed to LAN by default). Port 13337 was picked
#      to dodge the dev-server crowd that lives on 3000/8080. Override with
#      RECON_DECK_PORT=13338 if 13337 is taken.
#   5. Tries to open the browser (Linux: xdg-open, macOS: open).
#
# To uninstall: `docker rm -f recon-deck && docker volume rm recondeck-data recondeck-kb`.

# POSIX sh — no bashisms — so the documented `curl ... | sh` works under dash
# (Debian/Ubuntu /bin/sh). `pipefail` is bash-only and would abort dash with
# "Illegal option -o pipefail" the moment the script is piped to sh.
set -eu

# Channel selection — default stable (:latest), opt into pre-releases with --beta.
CHANNEL_TAG="latest"
for arg in "$@"; do
  case "$arg" in
    --beta|--channel=beta)     CHANNEL_TAG="beta" ;;
    --stable|--channel=stable) CHANNEL_TAG="latest" ;;
    -h|--help)
      printf 'Usage: install.sh [--beta]\n  --beta   install the newest pre-release build (default: stable)\n'
      exit 0
      ;;
    *)
      printf 'Unknown option: %s (use --beta or --stable)\n' "$arg" >&2
      exit 1
      ;;
  esac
done

IMAGE="ghcr.io/kocaemre/recon-deck:${CHANNEL_TAG}"
CONTAINER_NAME="recon-deck"
# Host port — override with RECON_DECK_PORT if 13337 is already taken. The
# container always listens on 13337 internally; only the host side moves.
PORT="${RECON_DECK_PORT:-13337}"
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

# 4. Run. Capture stderr (stdout = container id, discarded) so a port clash
#    gives an actionable hint instead of a raw docker traceback.
run_failed=0
run_err="$(docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "127.0.0.1:${PORT}:13337" \
  -v recondeck-data:/data \
  -v recondeck-kb:/kb \
  -e HOSTNAME=0.0.0.0 \
  "$IMAGE" 2>&1 >/dev/null)" || run_failed=1

if [ "$run_failed" -ne 0 ]; then
  # A failed run can leave a "Created" container holding the name — clear it so
  # a re-run with a different port isn't blocked by the stale name.
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  case "$run_err" in
    *"already allocated"* | *"address already in use"* | *"port is already"*)
      printf 'Port %s is already in use.\n' "$PORT" >&2
      printf 'Re-run on a different port — note RECON_DECK_PORT goes on the sh\n' >&2
      printf 'side of the pipe, not curl (env only reaches the process it prefixes):\n' >&2
      printf '  curl -sSL https://raw.githubusercontent.com/kocaemre/recon-deck/main/install.sh | RECON_DECK_PORT=13338 sh -s -- --beta\n' >&2
      printf 'Or find what holds it:  docker ps --filter "publish=%s"\n' "$PORT" >&2
      ;;
    *)
      printf 'docker run failed:\n%s\n' "$run_err" >&2
      ;;
  esac
  exit 1
fi

printf '\nrecon-deck is up at %s\n' "$URL"
printf 'Stop      : docker stop %s\n' "$CONTAINER_NAME"
printf 'Start     : docker start %s\n' "$CONTAINER_NAME"
printf 'Logs      : docker logs -f %s\n' "$CONTAINER_NAME"
printf 'Update    : re-run this script (volumes are preserved)\n'
printf 'Uninstall : docker rm -f %s   (add: docker volume rm recondeck-data recondeck-kb  to wipe data)\n' "$CONTAINER_NAME"

# 5. Try to open the browser. Failures are non-fatal — the URL above is
#    the operator-visible source of truth.
if command -v xdg-open >/dev/null 2>&1; then
  (xdg-open "$URL" >/dev/null 2>&1 &) || true
elif command -v open >/dev/null 2>&1; then
  (open "$URL" >/dev/null 2>&1 &) || true
fi
