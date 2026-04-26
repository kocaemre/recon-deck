#!/usr/bin/env bash
# Source: recon-deck-specific, derived from docker/build-push-action testing patterns.
#
# Boots a recon-deck image as a container, polls /api/health for up to 45s
# (arm64 emulation can take 15-30s for first boot), prints docker logs on
# failure, then stops the container. Exits 0 on success, 1 on timeout/failure.
#
# Used by: .github/workflows/release.yml (Plan 02) AND locally before tagging.
# Local usage: ./scripts/ci/smoke-test.sh recon-deck:local
set -euo pipefail

IMAGE="${1:?usage: smoke-test.sh <image:tag>}"
CONTAINER_NAME="recondeck-smoke-$$"

cleanup() {
  docker logs "$CONTAINER_NAME" 2>&1 | head -100 || true
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "::group::Starting container from $IMAGE"
docker run -d --rm --name "$CONTAINER_NAME" \
  -e HOSTNAME=0.0.0.0 \
  -p 127.0.0.1:13337:13337 \
  "$IMAGE"
echo "::endgroup::"

echo "Polling /api/health..."
deadline=$((SECONDS + 45))
until curl -sf http://127.0.0.1:13337/api/health | grep -q '"ok":true'; do
  if (( SECONDS > deadline )); then
    echo "FAILED: /api/health did not return 200 within 45 seconds"
    exit 1
  fi
  sleep 2
done
echo "OK: /api/health passed"
