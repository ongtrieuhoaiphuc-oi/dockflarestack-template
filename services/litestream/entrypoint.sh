#!/bin/sh
set -eu
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [INFO] [litestream] $1"; }
DB="${LITESTREAM_CONTAINER_DB_PATH:-/data/app.db}"
mkdir -p "$(dirname "$DB")"
log "restore $DB neu replica ton tai"
litestream restore -config /etc/litestream.yml -if-replica-exists -o "$DB" "$DB" || log "chua co replica, bo qua"
log "bat dau replicate"
exec litestream replicate -config /etc/litestream.yml
