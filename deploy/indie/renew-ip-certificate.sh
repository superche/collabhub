#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
test -f .env || { echo "Missing .env." >&2; exit 1; }

set -a
# shellcheck disable=SC1091
source .env
set +a
: "${COLLABHUB_HOST:?COLLABHUB_HOST is required}"

certificate=/etc/letsencrypt/live/collabhub-ip/fullchain.pem
if docker run --rm --entrypoint openssl \
  -v "$PWD/certbot/config:/etc/letsencrypt:ro" \
  certbot/certbot:v5.4.0 \
  x509 -checkend 259200 -noout -in "$certificate"; then
  echo "IP certificate remains valid for more than three days."
  exit 0
fi

caddy_was_running=false
if docker compose ps --status running --services | grep -qx caddy; then
  caddy_was_running=true
  docker compose stop caddy
fi

restart_caddy() {
  if [[ "$caddy_was_running" == true ]]; then
    docker compose up -d caddy
  fi
}
trap restart_caddy EXIT

docker run --rm --network host \
  -v "$PWD/certbot/config:/etc/letsencrypt" \
  -v "$PWD/certbot/work:/var/lib/letsencrypt" \
  -v "$PWD/certbot/logs:/var/log/letsencrypt" \
  certbot/certbot:v5.4.0 renew \
  --cert-name collabhub-ip \
  --force-renewal \
  --no-random-sleep-on-renew

echo "IP certificate renewed for https://${COLLABHUB_HOST}."
