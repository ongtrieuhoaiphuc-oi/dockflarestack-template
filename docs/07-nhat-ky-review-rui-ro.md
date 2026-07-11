# Nhat ky review & Rui ro da xu ly

> Ghi vet cac rui ro phat hien qua cac vong review + huong xu ly. De khi implement khong lap lai loi da biet.

## Vong 1 - rui ro spec co ban (da xu)

| # | Rui ro | Trang thai |
|---|---|---|
| 1 | Mismatch env noi bo vs env that image (silent-fail) | OK - bang mapping docs/04 |
| 2 | Base64->RAW auto-detect sai secret token | OK - validate theo ngu canh |
| 3 | Coordinator lock khong atomic | OK - ETag/transaction |
| 4 | Flush phu thuoc cung module tuy chon | OK - flush guard theo flag |
| 5 | Deadline 60 phut vs flush | OK - watcher buffer |
| 6 | Path hardcode khong derive DOCKER_VOLUMES_DIR | OK - interpolate |
| 7 | RCLONE_CONFIG ba nghia | OK - tach content/path |
| 8 | Thieu env Redis multi-host | OK - them DOCKFLARE_REDIS_* |
| 9 | COORDINATOR_LOCK_PATH dung giua stack | OK - derive STACK_ID |
| 10 | Flag ENABLE vs Compose profiles tach roi | OK - bootstrap sinh COMPOSE_PROFILES |

## Vong 2 - dao sau, doi chieu cheo (da xu)

### A. Nhom mat du lieu / vo he thong
- A1. rclone da litestream tren SQLite: OK - rclone `--exclude` LITESTREAM_DB_PATH + wal/shm. litestream so huu SQLite, rclone so huu phan con lai.
- A2. Namespace RTDB dung coordinator vs resolve-cache: OK - tach /stack/<STACK_ID>/coordinator/... va /stack/<STACK_ID>/resolve-cache/...
- A3. Default STACK_ID/TUNNEL_NAME/RCLONE_PATH la hang chung: OK - derive theo ngu canh hoac bat user dat (STACK_ID=CHANGE_ME, tunnel & rclone path derive tu STACK_ID).

### B. Nhom mau thuan logic
- B1. TTYD_WRITABLE=false lam smoke test khong pass: OK - default true (WebSSH tuong tac that) + bat buoc TTYD_CREDENTIAL.
- B2. Graceful-disable xung dot module bao mat: OK - chia 2 lop, module bao mat fail-closed.
- B3. FILEBROWSER_ROOT nham host-path vs container-path: OK - comment ro la container-path.

### C. Silent-misconfig (C1-C7): giu nguyen xu ly vong 1, xac nhan con hieu luc.

### D. Lifecycle/coordinator
- D1 atomic ETag, D2 server timestamp, D3 flush guard, D4 watcher deadline: OK.
- D5. Node Tailscale tich tu khi AUTO_EXIT=false: OK - canh bao + COORDINATOR_MAX_OVERLAP gioi han.

## Diem con treo (cho chot)
1. Marker `base64:` thay auto-detect cho secret token thuan? (hien: giu auto + validate ngu canh)
2. Filebrowser ban goc hay fork Quantum `gtstef/filebrowser`?
3. TTYD_WRITABLE default true dung use-case WebSSH tuong tac chu? (neu chi xem log thu dong thi de false)
