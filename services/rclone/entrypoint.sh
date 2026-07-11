#!/bin/sh
# rclone entrypoint - pull truoc khi start, push khi nhan tin hieu (SIGTERM).
# EXCLUDE file SQLite (litestream so huu SQLite). RCLONE_EXCLUDE do bootstrap derive.
set -eu
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [INFO] [rclone] $1"; }

DATA_DIR=/data
REMOTE="${RCLONE_REMOTE}:${RCLONE_PATH}"

run_sync() {
  src=$1
  dst=$2
  set -- --transfers "${RCLONE_TRANSFERS:-4}" --checkers "${RCLONE_CHECKERS:-4}" --fast-list

  if [ -n "${RCLONE_EXCLUDE:-}" ]; then
    old_ifs=$IFS
    IFS=','
    for pattern in $RCLONE_EXCLUDE; do
      set -- "$@" --exclude "$pattern"
    done
    IFS=$old_ifs
  fi

  rclone sync "$src" "$dst" "$@"
}

pull() {
  log "PULL $REMOTE -> $DATA_DIR (exclude: ${RCLONE_EXCLUDE:-none})"
  run_sync "$REMOTE" "$DATA_DIR" || log "pull loi (co the remote trong lan dau)"
}

push() {
  log "PUSH $DATA_DIR -> $REMOTE (exclude: ${RCLONE_EXCLUDE:-none})"
  run_sync "$DATA_DIR" "$REMOTE"
  log "push xong"
}

trap 'push; exit 0' TERM INT

log "khoi dong. remote=$REMOTE"
pull
log "pull xong, dung cho tin hieu flush (SIGTERM). Ngu..."
while true; do sleep 30; done
