#!/bin/sh
# ttyd entrypoint - dung MANG ARGS an toan (khong noi chuoi tho -> tranh injection).
# TTYD_CMD word-split bang /bin/sh 'set --' (POSIX). Fail-closed neu thieu credential.
set -e
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [INFO] [ttyd] $1"; }

if [ -z "$TTYD_CREDENTIAL" ]; then
  echo "[ERROR] [ttyd] TTYD_CREDENTIAL rong -> fail-closed, khong start." >&2
  exit 1
fi

set -- ttyd -p "${TTYD_PORT:-7681}" -c "$TTYD_CREDENTIAL" --max-clients "${TTYD_MAX_CLIENTS:-1}"
case "$(echo "$TTYD_WRITABLE" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes) set -- "$@" -W ;;
esac

# TTYD_CMD (vd 'ssh user@host' hoac 'bash') word-split qua eval set --.
# shellcheck disable=SC2086
eval "set -- \"\$@\" ${TTYD_CMD:-bash}"

log "chay: ttyd port=${TTYD_PORT:-7681} writable=${TTYD_WRITABLE:-true} cmd=${TTYD_CMD:-bash}"
exec "$@"
