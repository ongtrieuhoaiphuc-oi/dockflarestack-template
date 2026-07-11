#!/bin/sh
set -eu
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [INFO] [rclone] $1"; }
DATA_DIR=/data
REMOTE="${RCLONE_REMOTE}:${RCLONE_PATH}"
CONFIG_ARGS=""

if [ -n "${RCLONE_CONFIG_CONTENT:-}" ]; then
  CONFIG=/tmp/rclone.conf
  case "$RCLONE_CONFIG_CONTENT" in
    base64:*) printf '%s' "${RCLONE_CONFIG_CONTENT#base64:}" | base64 -d > "$CONFIG" ;;
    *) printf '%s\n' "$RCLONE_CONFIG_CONTENT" > "$CONFIG" ;;
  esac
  chmod 600 "$CONFIG"
  CONFIG_ARGS="--config $CONFIG"
elif [ -n "${RCLONE_CONFIG_PATH:-}" ]; then
  CONFIG_ARGS="--config $RCLONE_CONFIG_PATH"
else
  echo "[FATAL] [rclone] thieu config" >&2; exit 1
fi

run_sync() {
  src=$1; dst=$2
  # shellcheck disable=SC2086
  set -- $CONFIG_ARGS --transfers "${RCLONE_TRANSFERS:-4}" --checkers "${RCLONE_CHECKERS:-4}" --fast-list
  if [ -n "${RCLONE_EXCLUDE:-}" ]; then
    old=$IFS; IFS=','
    for p in $RCLONE_EXCLUDE; do set -- "$@" --exclude "$p"; done
    IFS=$old
  fi
  rclone sync "$src" "$dst" "$@"
}
pull() { log "PULL $REMOTE -> $DATA_DIR"; run_sync "$REMOTE" "$DATA_DIR" || log "remote rong/khong ton tai, bo qua pull lan dau"; }
push() { log "PUSH $DATA_DIR -> $REMOTE"; run_sync "$DATA_DIR" "$REMOTE"; }
trap 'push; exit 0' TERM INT
pull
while true; do sleep 30; done
