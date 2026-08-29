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

mkdir -p secrets backups certbot/config certbot/work certbot/logs
chmod 0700 secrets backups

if [[ "${COLLABHUB_CADDYFILE:-./Caddyfile}" == "./Caddyfile.ip" ]]; then
  docker run --rm --entrypoint test \
    -v "$PWD/certbot/config:/etc/letsencrypt:ro" \
    certbot/certbot:v5.4.0 \
    -s /etc/letsencrypt/live/collabhub-ip/fullchain.pem || {
    echo "Run ./issue-ip-certificate.sh before installing the IP-address profile." >&2
    exit 1
  }
fi

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

# Docker Compose implements file-backed secrets as bind mounts. Linux keeps the
# host file ownership, so the non-root CollabHub image group needs read access.
# Keep the invoking host user as owner so later upgrades remain repeatable.
# Docker Desktop remaps bind mounts and does not need this adjustment.
if [[ "$(uname -s)" == "Linux" ]]; then
  collabhub_gid="${COLLABHUB_RUNTIME_GID:-10001}"
  host_uid="$(id -u)"
  application_secrets=(
    secrets/database-url
    secrets/redis-url
    secrets/internal-token
    secrets/jwt-shared-secret
  )
  if [[ "$(id -u)" == "0" ]]; then
    chown "${host_uid}:${collabhub_gid}" "${application_secrets[@]}"
    chmod 0640 "${application_secrets[@]}"
  else
    docker run --rm --user 0:0 \
      --entrypoint sh \
      -v "$PWD/secrets:/secrets" \
      "$COLLABHUB_IMAGE" \
      -c "chown ${host_uid}:${collabhub_gid} /secrets/database-url /secrets/redis-url /secrets/internal-token /secrets/jwt-shared-secret && chmod 0640 /secrets/database-url /secrets/redis-url /secrets/internal-token /secrets/jwt-shared-secret"
  fi
fi

docker compose up -d --wait
curl --fail --silent --show-error --retry 20 --retry-delay 2 "https://${COLLABHUB_HOST}/readyz"
echo
echo "CollabHub is ready at https://${COLLABHUB_HOST} and wss://${COLLABHUB_HOST}/collab"
