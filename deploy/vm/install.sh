#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
for command in docker curl; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }
done
docker compose version >/dev/null
test -f .env || { echo "Copy .env.example to .env and fill in your values." >&2; exit 1; }
test -f domain-pack.json || { echo "Copy ../domain-pack/domain-pack.example.json to domain-pack.json, then edit your rules." >&2; exit 1; }
for secret in secrets/database-url secrets/redis-url secrets/internal-token; do
  test -s "$secret" || { echo "$secret is missing or empty." >&2; exit 1; }
  chmod 0600 "$secret"
done

docker compose config --quiet
docker compose pull
docker compose up -d --wait
curl --fail --silent --show-error http://127.0.0.1:7000/readyz
echo
echo "CollabHub is ready on :7000; put your HTTPS/WSS load balancer in front of it."
