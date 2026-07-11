# Tieu chi ky thuat trien khai tung dich vu

> Moi dich vu: tieu chi trien khai dung + toi uu, luu y van hanh. Bo sung cho `04-dich-vu-chi-tiet.md`.

## 1. DockFlare (core)
- Token: dung scoped API token (Zone + Account + Tunnel), KHONG global key neu tranh duoc.
- Redis event bus: bat cho multi-host (`DOCKFLARE_REDIS_ENABLE` + `DOCKFLARE_REDIS_URL`); single-host co the bo.
- `state.json` phai nam trong `.docker-volumes` de ben qua restart.
- Chung 1 tunnel nhieu connector -> cau hinh cung `TUNNEL_NAME`/tunnel ID cho moi instance.
- Toi uu: health check truoc khi cho agent join; log level `info`, `debug` khi soi loi.

## 2. Coordinator + RTDB
- Atomic lock: BAT BUOC dung ETag `if-match` (RTDB REST) hoac Firebase Admin `runTransaction`. KHONG GET-roi-PUT thuong (race -> split-brain).
- Server timestamp: dung `{".sv":"timestamp"}` cho moi moc thoi gian, khong dung `Date.now()` client (runner lech gio).
- Heartbeat TTL: heartbeat < 1/3 TTL de phat hien chet nhanh. Primary chet -> lock tu het han.
- Fencing: moi primary co fenceToken tang dan de chong split-brain.
- Watcher deadline: kich hoat handover o moc buffer (`COORDINATOR_HANDOVER_BUFFER_SEC`, vd phut 50/60), khong doi sat deadline (tranh SIGKILL cat giua flush).
- Flush guard: chi flush module dang bat (`if RCLONE_ENABLE`/`if LITESTREAM_ENABLE`), log ro khi skip.
- Lock path chong dung: default derive `/stack/${STACK_ID}`, khong dung hang `default`.
- Flush truoc nha lock: bat buoc thu tu readonly -> flush xong -> moi nha.
- Tieu chi dung: khong bao gio 2 primary; downtime chuyen giao gan 0 nho overlap connector.

## 3. rclone
- `--transfers` + `--checkers` chinh theo bang thong; mac dinh 4.
- `--fast-list` cho remote nhieu file.
- Dung `copy` thay `sync` khi khong muon xoa o dich; `sync` co the mat du lieu -> test `--dry-run` truoc.
- `--exclude` file lock/tmp de tranh conflict.
- Cau hinh: dung `RCLONE_CONFIG_PATH` neu co, khong thi ghi `RCLONE_CONFIG_CONTENT` ra file tam (KHONG gop 1 bien).
- Tieu chi dung: pull truoc start hoan tat moi cho app len; push luc flush khong bo sot file.

## 4. litestream
- Chi cho SQLite, khong dung cho file thuong (do la viec cua rclone).
- `restore -if-db-not-exists` luc start de tranh de DB dang co.
- Auto provider detect (v0.5+) cho Supabase S3.
- Khong chay 2 litestream cung ghi 1 DB -> phu thuoc coordinator de chi primary replicate.
- `LITESTREAM_DB_PATH` derive tu `DOCKER_VOLUMES_DIR`.
- Tieu chi dung: restart -> restore ve dung thoi diem cuoi; khong mat giao dich.

## 5. Tailscale
- OAuth client (TrustCredentials) tao authkey ephemeral, khong dung authkey dai han.
- `--advertise-tags` bat buoc khi dung OAuth (adapter dich tu `TAILSCALE_TAGS`).
- Ephemeral node cho moi truong 60 phut de tu don node chet.
- `TAILSCALE_STATE_DIR` (derive tu `DOCKER_VOLUMES_DIR`) -> `TS_STATE_DIR`.
- Tieu chi dung: node join dung tag, node cu tu bien mat sau khi instance thoat.

## 6. Dozzle
- `docker.sock:ro` (read-only) bat buoc.
- `DOZZLE_AUTH_PROVIDER=simple` khi expose; khong de `none` public.
- Agent mode cho multi-host thay vi expose socket.
- Tieu chi dung: log realtime, khong cho thao tac ghi container.

## 7. Filebrowser
- Mount `/srv` -> `.docker-volumes`; database + config mount rieng.
- Compose PHAI map `FB_PORT=${FILEBROWSER_PORT}` (image doc `FB_*`, khong doc prefix template).
- Doi mat khau admin mac dinh ngay lan dau.
- `FB_BASEURL` khi sau reverse proxy/DockFlare.
- Tieu chi dung: file host <-> UI dong bo 2 chieu.

## 8. ttyd / WebSSH
- BAT BUOC auth (`-c user:pass`) + chi expose qua Tailscale/Cloudflare Access.
- Entrypoint dung mang args (escape ky), khong noi chuoi tho -> tranh injection.
- `-W` chi bat khi can ghi; mac dinh read-only an toan hon.
- `--max-clients` gioi han phien dong thoi.
- Command: `bash` cho host, hoac `ssh user@host`.
- Tieu chi dung: mo terminal co auth, `whoami` dung host runner, dong phien giai phong dung.

## 9. Bang tieu chi bao mat chung

| Dich vu | Expose public? | Auth bat buoc? |
|---|---|---|
| DockFlare UI | qua Cloudflare Access | co |
| Dozzle | khong, hoac qua Access | co (simple) |
| Filebrowser | qua Access | co |
| ttyd | KHONG public | co (bat buoc) |
| Coordinator/RTDB | noi bo | service account |

## 10. Bootstrap: dong bo ENABLE flag <-> COMPOSE_PROFILES
- Van de: `<SERVICE>_ENABLE` trong `.env` va Compose `--profile` la 2 co che tach roi. Set `TTYD_ENABLE=true` ma khong truyen `--profile ttyd` -> container khong he duoc tao, khong co gi de "tu disable", nguoi dung tuong no chay.
- Giai phap: `bootstrap.mjs` doc moi `<SERVICE>_ENABLE` roi tu sinh `COMPOSE_PROFILES` truoc khi goi `docker compose up`. Mot nguon su that duy nhat la `.env`.
- 2 lop bao ve: profile chon co tao container khong; script ben trong chon co chay logic khong (tu disable khi thieu env).
- Tieu chi dung: chi sua `.env`, chay `bootstrap.mjs` la dung service len; khong can nho truyen `--profile`.

## 11. Path phai derive tu DOCKER_VOLUMES_DIR
- Moi path ben vung (`RESOLVE_CACHE_PATH`, `LITESTREAM_DB_PATH`, `TAILSCALE_STATE_DIR`) phai interpolate `${DOCKER_VOLUMES_DIR}/...`, KHONG hardcode rieng le.
- Ly do: doi `DOCKER_VOLUMES_DIR` ma path con khong doi theo -> data nam ngoai volume persist -> mat qua restart.

## 12. Base64 -> RAW: validate theo ngu canh
- Auto-detect "decode duoc = base64" de sai: nhieu secret (JWT, hex key, token) vo tinh chi chua ky tu bang base64 -> decode ra rac nhung tuong hop le.
- Giai phap (giu auto-fallback theo yeu cau): sau decode phai validate theo ngu canh moi chap nhan. Vd `RTDB_SERVICE_ACCOUNT` decode xong phai `JSON.parse` duoc; validate fail thi coi la RAW.
- (Cho xac nhan: co them marker tuong minh `base64:` cho secret dang token thuan hay khong.)
