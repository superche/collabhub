#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
test -f .env || { echo "Copy .env.example to .env first." >&2; exit 1; }

set -a
# shellcheck disable=SC1091
source .env
set +a
: "${COLLABHUB_HOST:?COLLABHUB_HOST must be the public IPv4 address}"

if [[ ! "$COLLABHUB_HOST" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "COLLABHUB_HOST must be a public IPv4 address for this profile." >&2
  exit 1
fi

mkdir -p certbot/config certbot/work certbot/logs

caddy_was_running=false
if docker compose ps --status running --services 2>/dev/null | grep -qx caddy; then
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
  certbot/certbot:v5.4.0 certonly \
  --standalone \
  --preferred-profile shortlived \
  --ip-address "$COLLABHUB_HOST" \
  --cert-name collabhub-ip \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email \
  --keep-until-expiring

echo "IP certificate is ready for https://${COLLABHUB_HOST}."
