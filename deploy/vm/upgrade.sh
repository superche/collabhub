#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
test -f .env || { echo "Copy .env.example to .env and fill in your values." >&2; exit 1; }
docker compose config --quiet
PREVIOUS_IMAGE=$(docker inspect --format '{{.Image}}' "$(docker compose ps -q gateway)" 2>/dev/null || true)
docker compose pull
if ! docker compose up -d --wait --remove-orphans || ! curl --fail --silent --show-error http://127.0.0.1:7000/readyz; then
  if [[ -z "$PREVIOUS_IMAGE" ]]; then
    echo "Upgrade failed and no previous image was available for rollback." >&2
    exit 1
  fi
  echo "Upgrade failed; restoring local image $PREVIOUS_IMAGE" >&2
  COLLABHUB_IMAGE="$PREVIOUS_IMAGE" docker compose up -d --wait --remove-orphans
  curl --fail --silent --show-error http://127.0.0.1:7000/readyz
  echo >&2
  echo "Rollback completed. Restore COLLABHUB_IMAGE in .env before the next upgrade." >&2
  exit 1
fi
echo
echo "Upgrade completed. Previous local image: ${PREVIOUS_IMAGE:-none}."
