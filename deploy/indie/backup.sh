#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p backups
chmod 0700 backups

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="backups/collabhub-${timestamp}.dump"
docker compose exec -T postgres pg_dump -U collabhub -d collabhub --format=custom --compress=9 >"$target"
chmod 0600 "$target"
find backups -type f -name 'collabhub-*.dump' -mtime +14 -delete
echo "$target"
