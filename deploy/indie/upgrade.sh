#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
target_image="${1:?Usage: ./upgrade.sh ghcr.io/superche/collabhub:VERSION_OR_DIGEST}"
./backup.sh
current_image="$(docker compose config --format json | jq -r '.services.gateway.image')"

COLLABHUB_IMAGE="$target_image" docker compose pull gateway worker
if COLLABHUB_IMAGE="$target_image" docker compose up -d --wait gateway worker; then
  if grep -q '^COLLABHUB_IMAGE=' .env; then
    sed -i.bak "s|^COLLABHUB_IMAGE=.*|COLLABHUB_IMAGE=${target_image}|" .env
    rm -f .env.bak
  else
    printf '\nCOLLABHUB_IMAGE=%s\n' "$target_image" >>.env
  fi
  echo "Upgraded to ${target_image}"
  exit 0
fi

echo "Upgrade failed; restoring ${current_image}" >&2
COLLABHUB_IMAGE="$current_image" docker compose up -d --wait gateway worker
exit 1
