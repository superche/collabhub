#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
backup="${1:-$(find backups -type f -name 'collabhub-*.dump' -print | sort | tail -n 1)}"
test -n "$backup" && test -s "$backup" || { echo "No non-empty backup found." >&2; exit 1; }

database="collabhub_restore_verify"
cleanup() {
  docker compose exec -T postgres dropdb -U collabhub --if-exists "$database" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup
docker compose exec -T postgres createdb -U collabhub "$database"
docker compose exec -T postgres pg_restore -U collabhub -d "$database" --exit-on-error <"$backup"
table_count="$(docker compose exec -T postgres psql -U collabhub -d "$database" -Atc "select count(*) from information_schema.tables where table_schema='public'")"
[[ "$table_count" -gt 0 ]] || { echo "Restored database has no public tables." >&2; exit 1; }
echo "Backup restore verified: ${backup} (${table_count} public tables)"
