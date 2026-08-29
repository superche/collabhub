#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
set -a
# shellcheck disable=SC1091
source .env
set +a

curl --fail --silent --show-error "https://${COLLABHUB_HOST}/healthz"
echo
curl --fail --silent --show-error "https://${COLLABHUB_HOST}/readyz"
echo
docker compose ps
