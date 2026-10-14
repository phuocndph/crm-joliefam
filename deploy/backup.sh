#!/bin/sh
# Run from the repository root. Quiesces this named deployment, never the local dev stack.
set -eu
umask 077
: "${BACKUP_ROOT:?Set an absolute private backup directory outside the web root}"
case "$BACKUP_ROOT" in /*) ;; *) echo "BACKUP_ROOT must be absolute" >&2; exit 2;; esac
case "$BACKUP_ROOT" in /|/app|/srv|/var|/root|/home|*/..|*/../*) echo "Use a dedicated private backup directory" >&2; exit 2;; esac
ENV_FILE="${DEPLOY_ENV_FILE:-deploy/.env.production}"
compose() { docker compose --env-file "$ENV_FILE" -f deploy/compose.yml "$@"; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="$BACKUP_ROOT/$stamp"
mkdir -p "$BACKUP_ROOT"
mkdir "$backup_dir"
chmod 700 "$backup_dir"
# Production users must be notified of the short maintenance window beforehand.
was_running=$(compose ps --status running --services api)
restart_api() { if [ "$was_running" = "api" ]; then compose start api >/dev/null; fi; }
trap restart_api EXIT
trap 'exit 1' HUP INT TERM
compose stop api >/dev/null
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$backup_dir/database.dump"
compose run --rm --no-deps -T --entrypoint tar api -C /app/storage -czf - . > "$backup_dir/assets.tar.gz"
(cd "$backup_dir" && sha256sum database.dump assets.tar.gz > SHA256SUMS)
printf 'format=1\ncreated_utc=%s\napi_quiesced=true\n' "$stamp" > "$backup_dir/manifest.txt"
chmod 600 "$backup_dir"/*
printf 'Backup complete: %s\n' "$backup_dir"

