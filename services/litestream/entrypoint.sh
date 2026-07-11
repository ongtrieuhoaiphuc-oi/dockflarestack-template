#!/bin/sh
# litestream entrypoint - RESTORE force theo generation luc start, roi replicate.
# KHONG chi dua -if-db-not-exists (self-hosted runner con DB cu tren dia -> skip).
set -e
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [INFO] [litestream] $1"; }
DB="${LITESTREAM_DB_PATH:-/data/app.db}"

log "kiem tra generation moi nhat tren S3 va restore neu can"
# -if-replica-exists: chi restore khi co ban tren S3. Ghi de DB cu de lay ban moi nhat.
litestream restore -if-replica-exists -o "$DB" "$DB" || log "khong co replica (lan dau) hoac restore bo qua"

log "bat dau replicate"
exec litestream replicate
