#!/bin/sh
# rclone entrypoint - pull truoc khi start, push khi nhan tin hieu (SIGTERM).
# EXCLUDE file SQLite (litestream so huu SQLite). RCLONE_EXCLUDE do bootstrap derive.
set -e
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [INFO] [rclone] $1"; }

DATA_DIR=/data
REMOTE="${RCLONE_REMOTE}:${RCLONE_PATH}"
EXCLUDE_ARGS=""
if [ -n "$RCLONE_EXCLUDE" ]; then
  OLDIFS=$IFS; IFS=','
  for p in $RCLONE_EXCLUDE; do EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude $p"; done
  IFS=$OLDIFS
fi
TRANSFERS="--transfers ${RCLONE_TRANSFERS:-4} --checkers ${RCLONE_CHECKERS:-4}"

pull() {
  log "PULL $REMOTE -> $DATA_DIR (exclude: ${RCLONE_EXCLUDE:-none})"
  rclone sync "$REMOTE" "$DATA_DIR" $EXCLUDE_ARGS $TRANSFERS --fast-list || log "pull loi (co the remote trong lan dau)"
}
push() {
  log "PUSH $DATA_DIR -> $REMOTE (exclude: ${RCLONE_EXCLUDE:-none})"
  rclone sync "$DATA_DIR" "$REMOTE" $EXCLUDE_ARGS $TRANSFERS --fast-list
  log "push xong"
}

trap 'push; exit 0' TERM INT

log "khoi dong. remote=$REMOTE"
pull
log "pull xong, dung cho tin hieu flush (SIGTERM). Ngu..."
while true; do sleep 30; done
