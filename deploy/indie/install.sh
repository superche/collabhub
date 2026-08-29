#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

for command in docker curl openssl; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }
done
docker compose version >/dev/null
test -f .env || { echo "Copy .env.example to .env and fill in the public host, origin, and JWT settings." >&2; exit 1; }
test -f domain-pack.json || cp ../domain-pack/domain-pack.example.json domain-pack.json

set -a
# shellcheck disable=SC1091
source .env
set +a
: "${COLLABHUB_HOST:?COLLABHUB_HOST is required}"
: "${ALLOWED_ORIGINS:?ALLOWED_ORIGINS is required}"
: "${JWT_ISSUER:?JWT_ISSUER is required}"

mkdir -p secrets backups
chmod 0700 secrets backups

generate_secret() {
  local path="$1"
  if [[ ! -s "$path" ]]; then
    openssl rand -hex 32 >"$path"
  fi
  chmod 0600 "$path"
}

generate_secret secrets/postgres-password
generate_secret secrets/redis-password
generate_secret secrets/internal-token
generate_secret secrets/jwt-shared-secret

postgres_password="$(<secrets/postgres-password)"
redis_password="$(<secrets/redis-password)"
printf '%s' "postgresql://collabhub:${postgres_password}@postgres:5432/collabhub?sslmode=disable" >secrets/database-url
printf '%s' "redis://default:${redis_password}@redis:6379" >secrets/redis-url
chmod 0600 secrets/database-url secrets/redis-url

docker compose config --quiet
docker compose pull
docker compose up -d --wait
curl --fail --silent --show-error --retry 20 --retry-delay 2 "https://${COLLABHUB_HOST}/readyz"
echo
echo "CollabHub is ready at https://${COLLABHUB_HOST} and wss://${COLLABHUB_HOST}/collab"
