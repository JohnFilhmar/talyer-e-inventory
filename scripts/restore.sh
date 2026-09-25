#!/usr/bin/env bash
# Restore one talyer stack from a backup written by scripts/backup.sh (GAP-028).
#
#   scripts/restore.sh <env> <stamp> --confirm
#   scripts/restore.sh production 20260926-0000 --confirm
#
# DESTRUCTIVE: mongorestore runs with --drop, replacing every collection the
# archive contains, and the uploads volume is emptied before it is refilled.
# Without --confirm it only lists what it would restore.
set -euo pipefail

env="${1:?usage: restore.sh <env> <stamp> --confirm}"
stamp="${2:?usage: restore.sh <env> <stamp> --confirm}"
project="talyer-${env}"
dest="/var/backups/talyer/${env}"
mongo_file="mongo-${stamp}.archive.gz"
uploads_file="uploads-${stamp}.tgz"

from_backups() { docker run --rm -i -v "${dest}:/in:ro" alpine:3 "$@"; }

from_backups ls -l "/in/${mongo_file}" "/in/${uploads_file}"

if [ "${3:-}" != "--confirm" ]; then
  echo "Dry run. Re-run with --confirm to replace ${project}'s database and uploads."
  exit 1
fi

from_backups cat "/in/${mongo_file}" | docker exec -i "${project}-mongo-1" sh -c \
  'mongorestore --quiet --drop --archive --gzip --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin'

docker run --rm -v "${project}_backend-uploads:/dst" -v "${dest}:/in:ro" alpine:3 \
  sh -c "find /dst -mindepth 1 -delete && tar xzf /in/${uploads_file} -C /dst"

echo "restored ${env} from ${stamp}"
