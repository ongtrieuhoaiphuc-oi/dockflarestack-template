#!/bin/sh
# ttyd entrypoint - dung positional args an toan, khong eval chuoi tu env.
# TTYD_CMD duoc truyen lam 1 argument cho shell cua terminal, khong chay trong entrypoint.
set -eu
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [INFO] [ttyd] $1"; }

if [ -z "${TTYD_CREDENTIAL:-}" ]; then
  echo "[ERROR] [ttyd] TTYD_CREDENTIAL rong -> fail-closed, khong start." >&2
  exit 1
fi

set -- ttyd -p "${TTYD_PORT:-7681}" -c "$TTYD_CREDENTIAL" --max-clients "${TTYD_MAX_CLIENTS:-1}"
case "$(printf '%s' "${TTYD_WRITABLE:-true}" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes) set -- "$@" -W ;;
esac

# Khong eval. ttyd exec `sh -lc` khi mo terminal; ky tu dac biet trong TTYD_CMD
# khong the chen them lenh vao entrypoint.
set -- "$@" sh -lc "${TTYD_CMD:-bash}"

log "chay: ttyd port=${TTYD_PORT:-7681} writable=${TTYD_WRITABLE:-true} cmd=${TTYD_CMD:-bash}"
exec "$@"
