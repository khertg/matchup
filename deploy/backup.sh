#!/bin/sh
# Back up the database to a compressed file, keeping the newest 14.
#   ./backup.sh [directory]        (default: ./backups)
# Run it from the deploy/ folder on the server, and schedule it (see deploy/README.md).
set -eu

dir="${1:-./backups}"
mkdir -p "$dir"
file="$dir/matchup-$(date +%Y%m%d-%H%M%S).sql.gz"

# pg_dump runs inside the database container, using its own credentials.
docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$file"

# A backup that is empty means something went wrong; do not keep it or rotate real ones away.
if [ ! -s "$file" ] || [ "$(gzip -dc "$file" | wc -c)" -lt 100 ]; then
  rm -f "$file"
  echo "backup failed: the dump was empty" >&2
  exit 1
fi

ls -1t "$dir"/matchup-*.sql.gz | tail -n +15 | xargs -r rm --
echo "wrote $file"
