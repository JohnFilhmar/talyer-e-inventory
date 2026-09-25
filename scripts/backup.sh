#!/usr/bin/env bash
# Nightly backup of one talyer stack: the whole Mongo database and the uploads
# volume, written to /var/backups/talyer/<env>/ and kept for 14 days (GAP-028).
#
#   scripts/backup.sh production          # does nothing unless it is 00:xx in Manila
#   FORCE=1 scripts/backup.sh production  # run now
#
# Installed by the deploy workflow as the runner user's crontab, firing hourly.
# Hourly because the host clock is Europe/Berlin, which shifts for daylight
# saving, while the shop runs on Asia/Manila, which does not. A fixed cron hour
# would drift between 17:00 and 18:00 Manila twice a year; checking the Manila
# hour here keeps the backup at midnight, when there is no traffic.
#
# Same-disk backups cover a mistyped `down -v`, a bad migration and corrupted
# data. They do not survive losing the disk or the VPS; an off-box copy of
# /var/backups/talyer is the upgrade.
set -euo pipefail

env="${1:?usage: backup.sh <production|staging>}"
project="talyer-${env}"
dest="/var/backups/talyer/${env}"
keep_days="${BACKUP_KEEP_DAYS:-14}"

if [ "${FORCE:-}" != 1 ] && [ "$(TZ=Asia/Manila date +%H)" != 00 ]; then
  exit 0
fi

stamp="$(TZ=Asia/Manila date +%Y%m%d-%H%M)"

# The runner user has no sudo and /var/backups is root-owned. It is in the
# docker group, so a throwaway container with a bind mount does the writing.
# Files are written as *.part and renamed, so an interrupted run never leaves
# something that looks like a complete backup.
out() { docker run --rm -i -v "${dest}:/out" alpine:3 "$@"; }

# Credentials stay inside the mongo container's own environment; nothing
# secret passes through this host's command line.
docker exec "${project}-mongo-1" sh -c \
  'mongodump --quiet --archive --gzip --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' \
  | out sh -c "cat > /out/mongo-${stamp}.archive.gz.part && test -s /out/mongo-${stamp}.archive.gz.part && mv /out/mongo-${stamp}.archive.gz.part /out/mongo-${stamp}.archive.gz"

docker run --rm -v "${project}_backend-uploads:/src:ro" -v "${dest}:/out" alpine:3 \
  sh -c "tar czf /out/uploads-${stamp}.tgz.part -C /src . && mv /out/uploads-${stamp}.tgz.part /out/uploads-${stamp}.tgz"

out find /out -type f -mtime +"${keep_days}" -delete

echo "$(date -Is) backup ${env} ${stamp} ok"
