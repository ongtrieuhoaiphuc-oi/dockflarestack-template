# Nhat ky review & Rui ro da xu ly

> Ghi vet cac rui ro phat hien qua cac vong review + huong xu ly.

## Vong 1 - rui ro spec co ban (da xu)

| # | Rui ro | Trang thai |
|---|---|---|
| 1 | Mismatch env noi bo vs env that image (silent-fail) | OK - bang mapping docs/04 |
| 2 | Base64->RAW auto-detect sai secret token | OK - validate theo ngu canh |
| 3 | Coordinator lock khong atomic | OK - ETag/transaction |
| 4 | Flush phu thuoc cung module tuy chon | OK - flush guard theo flag |
| 5 | Deadline 60 phut vs flush | OK - watcher buffer |
| 6 | Path hardcode khong derive DOCKER_VOLUMES_DIR | OK - interpolate (bootstrap resolve) |
| 7 | RCLONE_CONFIG ba nghia | OK - tach content/path |
| 8 | Thieu env Redis multi-host | OK - them DOCKFLARE_REDIS_* |
| 9 | COORDINATOR_LOCK_PATH dung giua stack | OK - derive STACK_ID |
| 10 | Flag ENABLE vs Compose profiles tach roi | OK - bootstrap sinh COMPOSE_PROFILES |

## Vong 2 - dao sau, doi chieu cheo (da xu)

### A. Nhom mat du lieu / vo he thong
- A1. rclone da litestream tren SQLite: OK - rclone --exclude LITESTREAM_DB_PATH + wal/shm.
- A2. Namespace RTDB dung coordinator vs resolve-cache: OK - tach nhanh.
- A3. Default STACK_ID/TUNNEL_NAME/RCLONE_PATH la hang chung: OK - derive theo STACK_ID + hard-block.

### B. Nhom mau thuan logic
- B1. TTYD_WRITABLE=false lam smoke test khong pass: OK - default true + bat buoc credential.
- B2. Graceful-disable xung dot module bao mat: OK - chia 2 lop, security fail-closed.
- B3. FILEBROWSER_ROOT nham host-path vs container-path: OK - comment ro container-path.

### C. Silent-misconfig (C1-C7): giu nguyen xu ly, xac nhan con hieu luc.

### D. Lifecycle/coordinator
- D1 atomic ETag, D2 server timestamp, D3 flush guard, D4 watcher deadline: OK.
- D5. Node Tailscale tich tu khi AUTO_EXIT=false: OK - COORDINATOR_MAX_OVERLAP.

## Vong 3 - doi chieu cheo sau, bug se no khi implement (da xu)

### Nghiem trong
- V3-1. ENV long nhau ${VAR} khong tu expand: OK - bootstrap resolve -> .env.resolved, compose --env-file .env.resolved. Neu compose doc .env goc -> tunnel name = literal "${STACK_ID}" -> moi stack trung ten (pha anti-collision).
- V3-2. Race pull/restore truoc khi Old flush: OK - dao trinh tu, New standby, pull/restore lan 2 SAU khi Old flushed, TRUOC khi gianh primary. litestream force-restore theo generation (khong chi -if-db-not-exists).
- V3-3. RCLONE_EXCLUDE khong derive tu LITESTREAM_DB_PATH: OK - bootstrap tu sinh.

### Rui ro cao
- V3-4. Redis optional nhung handover luon multi-host: OK - bootstrap ep/canh bao REDIS_ENABLE=true khi COORDINATOR_ENABLE=true.
- V3-5. Contract read-only cho app chua co: OK - coordinator ghi file ${DOCKER_VOLUMES_DIR}/.readonly (COORDINATOR_READONLY_FLAG_PATH) va/hoac HTTP endpoint, app check truoc khi ghi. Lam truoc khi viet coordinator.
- V3-6. Dozzle simple auth can users.yml: OK - hash sha-256, dozzle generate tu DOZZLE_USERNAME/PASSWORD.
- V3-7. Filebrowser doi password thu cong trong CI: OK - FILEBROWSER_ADMIN_PASSWORD + config init/users update + hash, DB persist, fail-closed.
- V3-8. ttyd escape command: OK - shell-quote/string-argv, khong .split(' ').
- V3-9. RTDB ETag de sai (thieu header X-Firebase-ETag: true): OK - uu tien Firebase Admin runTransaction.

### Nho
- Chot 1 nguon env: .env.example o root (bo core/.env.template).
- Health-check key pool theo tung loai secret (khong generic HTTP 200).
- STACK_ID=CHANGE_ME hard-block exit non-zero.
- RCLONE_EXCLUDE dung pattern **/<db>.

## Diem con treo (cho chot)
1. Marker `base64:` thay auto-detect cho secret token thuan? (hien: giu auto + validate ngu canh)
2. Filebrowser ban goc hay fork Quantum gtstef/filebrowser?
3. TTYD_WRITABLE default true dung use-case WebSSH tuong tac chu?
