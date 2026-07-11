# Dich vu trong repo - Docs chi tiet

> Moi dich vu: muc dich -> env cau hinh (theo tai lieu moi nhat) -> cach dung -> cach kiem tra hoat dong dung. Tat ca deu bat/tat duoc.

## Quy uoc ENV

Moi env dung **prefix theo dich vu** de tranh xung dot. Flag bat/tat: `<SERVICE>_ENABLE`.

| Dich vu | Prefix | Flag |
|---|---|---|
| DockFlare | `DOCKFLARE_` | core (luon bat) |
| Coordinator | `COORDINATOR_` | `COORDINATOR_ENABLE` |
| RTDB client | `RTDB_` | (theo coordinator/resolve) |
| rclone | `RCLONE_` | `RCLONE_ENABLE` |
| litestream | `LITESTREAM_` | `LITESTREAM_ENABLE` |
| tailscale | `TAILSCALE_` | `TAILSCALE_ENABLE` |
| Dozzle | `DOZZLE_` | `DOZZLE_ENABLE` |
| Filebrowser | `FILEBROWSER_` | `FILEBROWSER_ENABLE` |
| ttyd/WebSSH | `TTYD_` | `TTYD_ENABLE` |

### Bang mapping: env noi bo (template) -> env that cua image

**QUAN TRONG:** mot so image KHONG doc prefix cua ta. Compose/entrypoint phai map tuong minh, KHONG dua vao trung ten ngau nhien (neu khong container se silent-fail: am tham dung default sai, khong bao loi).

| Service | Env noi bo (template) | Env/arg that cua image | Cach map |
|---|---|---|---|
| Filebrowser | `FILEBROWSER_PORT/ROOT/BASEURL` | `FB_PORT/FB_ROOT/FB_BASEURL/FB_DATABASE` | compose `environment:` map thang `FB_PORT=${FILEBROWSER_PORT}` |
| ttyd | `TTYD_PORT/_CREDENTIAL/_WRITABLE/_CMD/_MAX_CLIENTS` | CLI args `-p -c -W --max-clients <cmd>` | entrypoint wrapper dung mang args, escape/word-split ky |
| Tailscale | `TAILSCALE_CLIENT_ID/_SECRET/_TAGS/_STATE_DIR/_EPHEMERAL` | `TS_AUTHKEY / TS_STATE_DIR / TS_EXTRA_ARGS` | adapter: OAuth -> API lay ephemeral authkey -> `TS_AUTHKEY`; `_TAGS` -> `TS_EXTRA_ARGS=--advertise-tags=...` |
| Dozzle | `DOZZLE_*` | `DOZZLE_*` | trung ten, map thang (OK) |
| litestream | `LITESTREAM_S3_*` | field trong `litestream.yml` | template render file yml tu env |

**ttyd escaping:** `TTYD_CREDENTIAL` co the chua ky tu dac biet, `TTYD_CMD` dang `ssh user@host` can word-split dung -> entrypoint dung mang args (khong noi chuoi tho) de tranh injection/lenh sai.

**container-path vs host-path:** `FILEBROWSER_ROOT` (-> `FB_ROOT`) la path *trong container*, KHONG phai path host. Bind `${DOCKER_VOLUMES_DIR}` vao container do compose `volumes:` quyet dinh.

Fallback **Base64 -> RAW** ap dung cho moi env; sau decode phai validate theo ngu canh moi chap nhan.

### Default KHONG dung hang so chung

`STACK_ID`, `DOCKFLARE_TUNNEL_NAME`, `RCLONE_PATH` PHAI duy nhat theo tung deploy. Copy nguyen `.env.example` ma quen doi -> 2 stack tranh lock / tunnel / ghi de volume. Derive theo `${GITHUB_REPOSITORY}` hoac bat buoc user dat.

---

## 1. Dozzle - realtime log viewer (module co be mat bao mat)
**Image:** `amir20/dozzle`
**Muc dich:** xem log realtime cua tat ca container qua web, khong can `docker logs`.
**Env chinh:** `DOZZLE_ADDR` (`:8080`), `DOZZLE_BASE` (`/`), `DOZZLE_AUTH_PROVIDER` (`none`|`simple`), `DOZZLE_HOSTNAME`, `DOZZLE_LEVEL`, `DOZZLE_NO_ANALYTICS=1`.
**Cach dung:** mount `/var/run/docker.sock:/var/run/docker.sock:ro`, mo UI cong 8080. Co agent mode cho multi-host.
**Bao mat:** FAIL-CLOSED - neu expose ma auth `none` thi khong start.
**Kiem tra dung:** mo UI -> thay container + log realtime. Smoke: `docker run hello-world` -> log phai xuat hien tuc thi.
**Link:** https://dozzle.dev/guide/supported-env-vars

---

## 2. Filebrowser - quan ly file qua web (module co be mat bao mat)
**Image:** `filebrowser/filebrowser`
**Muc dich:** duyet/sua/upload file trong `.docker-volumes` qua web.
**Env/config:** image doc bien `FB_` (vd `FB_DATABASE`, `FB_ROOT`, `FB_PORT`, `FB_BASEURL`). Compose PHAI map `FB_PORT=${FILEBROWSER_PORT}`... (xem bang mapping o dau file). Mount 3 volume: data (`/srv`), database, config.
**Luu y path:** `FILEBROWSER_ROOT` (-> `FB_ROOT`) la path *trong container*, KHONG phai host. Bind host do compose `volumes:` lo.
**Cach dung:** tro `/srv` vao `.docker-volumes`. Lan dau tao admin user, doi mat khau mac dinh ngay.
**Kiem tra dung:** dang nhap -> thay cay thu muc. Smoke: tao file test tren host -> refresh UI phai thay; upload qua UI -> host phai co.
**Luu y:** co fork `gtstef/filebrowser` (Quantum) env-first manh hon - can xac nhan.
**Link:** https://filebrowser.org/installation.html

---

## 3. ttyd (WebSSH Linux) - terminal qua web (module co be mat bao mat)
**Image:** `tsl0922/ttyd`
**Muc dich:** SSH vao host/runner qua trinh duyet (terminal tuong tac that).
**Cau hinh (qua CLI args, KHONG phai env):** `-p 7681` (port), `-c user:pass` (basic auth), `-W` (writable), `--ssl` kem cert. Vd: `ttyd -p 7681 -c admin:secret bash`.
**Entrypoint wrapper:** dung mang args tu `TTYD_PORT/_CREDENTIAL/_WRITABLE/_CMD/_MAX_CLIENTS`, escape ky (credential co ky tu dac biet, cmd `ssh user@host` can word-split dung) -> tranh injection.
**Bao mat:** FAIL-CLOSED - thieu `TTYD_CREDENTIAL` thi khong start du `TTYD_ENABLE=true`. Uu tien expose qua Tailscale/Cloudflare Access.
**TTYD_WRITABLE:** default `true` (WebSSH tuong tac; neu `false` khong go duoc lenh -> smoke `whoami` fail). Chi `false` cho use-case xem thu dong - CHO CHOT use-case.
**Kiem tra dung:** mo UI cong 7681 -> hien terminal, `whoami` tra dung host runner. Smoke: tao file qua terminal -> kiem tra tren host.
**Link:** https://github.com/tsl0922/ttyd

---

## 4. Coordinator + RTDB - lifecycle handover
**Muc dich:** chong restart 60 phut. Giu write-lock / heartbeat / handoff tren Google RTDB.
**Env:** `COORDINATOR_ENABLE`, `RTDB_URL`, `RTDB_SERVICE_ACCOUNT` (base64->raw), `STACK_ID`, `COORDINATOR_LOCK_PATH` (default derive `/stack/${STACK_ID}/coordinator`), `COORDINATOR_HEARTBEAT_SEC`, `COORDINATOR_SESSION_TTL_SEC`, `COORDINATOR_HANDOVER_BUFFER_SEC`, `COORDINATOR_OLD_AUTO_EXIT`, `COORDINATOR_MAX_OVERLAP`.
**Schema RTDB (namespace tach biet):**
```
/stack/<stackId>/
  coordinator:
    primary:   { instanceId, fenceToken, since, expiresAt }
    instances: { <id>: { state: starting|ready|readonly|exiting, heartbeat } }
    handoff:   { requestedBy, at }
  resolve-cache:
    { accountId, keyPoolStatus, ... }   # tach nhanh, KHONG chung root voi coordinator
```
**Atomic bat buoc:** gianh `primary` dung conditional write ETag (`if-match`) hoac Firebase Admin `runTransaction`, KHONG GET-roi-PUT thuong (race -> split-brain). Moi primary mang fenceToken tang dan.
**Server timestamp:** moi `expiresAt`/`heartbeat` lay tu `{".sv":"timestamp"}` cua RTDB server, KHONG lay `Date.now()` client (runner lech gio).
**Watcher deadline:** dem nguoc tu thoi diem start job, kich hoat handover o moc buffer (vd phut 50/60), khong doi sat gio.
**Flush guard:** truoc khi nha lock, chi flush module dang bat: `if RCLONE_ENABLE -> push`, `if LITESTREAM_ENABLE -> checkpoint`. Module tat thi log ro `flush skipped`.
**Node tailscale tich tu:** neu `OLD_AUTO_EXIT=false`, instance cu read-only nhung khong thoat -> node ephemeral van song, tich tu qua nhieu chu ky. Gioi han bang `COORDINATOR_MAX_OVERLAP`.
**Kiem tra dung (smoke):** chay 2 instance local. A len truoc = primary. Khoi B -> primary doi sang B, A readonly. Thu ghi tu A -> bi tu choi. Khong duoc co 2 primary cung luc.

---

## 5. rclone - sync bulk .docker-volumes
**Muc dich:** pull `.docker-volumes` ve truoc khi start, push khi gan het gio.
**Env:** `RCLONE_ENABLE`, va 2 bien tach rieng de tranh mo ho: `RCLONE_CONFIG_PATH` (duong dan file conf co san, uu tien) HOAC `RCLONE_CONFIG_CONTENT` (noi dung conf, base64/raw, ghi ra file tam). `RCLONE_REMOTE`, `RCLONE_PATH`, `RCLONE_EXCLUDE`.
**BAT BUOC loai tru SQLite:** rclone phai `--exclude` path cua `LITESTREAM_DB_PATH` + `-wal`/`-shm`. Nguyen tac: litestream so huu SQLite, rclone so huu phan con lai. Khong de 2 module dung cung 1 file (pull de ban cu len ban dang ghi do -> corrupt; push giua transaction -> snapshot lech).
**Cach dung:** `rclone sync <remote>:<path> /.docker-volumes` luc start; nguoc lai luc flush. Dung `--dry-run` de test truoc.
**Kiem tra dung (smoke):** tao file trong volume -> push -> kiem tra remote co file. Xoa local -> pull -> file quay ve. SQLite KHONG bi rclone dung toi.
**Link:** https://rclone.org/docs/

---

## 6. litestream - SQLite realtime -> S3 Supabase
**Muc dich:** replicate SQLite lien tuc len S3 Supabase, restore luc start.
**Config (`litestream.yml`):**
```yaml
dbs:
  - path: ${LITESTREAM_DB_PATH}
    replicas:
      - type: s3
        endpoint: ${LITESTREAM_S3_ENDPOINT}
        bucket: ${LITESTREAM_S3_BUCKET}
        access-key-id: ${LITESTREAM_S3_ACCESS_KEY_ID}
        secret-access-key: ${LITESTREAM_S3_SECRET_ACCESS_KEY}
```
**Env:** `LITESTREAM_ENABLE`, `LITESTREAM_S3_ENDPOINT`, `LITESTREAM_S3_BUCKET`, `LITESTREAM_S3_ACCESS_KEY_ID`, `LITESTREAM_S3_SECRET_ACCESS_KEY`, `LITESTREAM_DB_PATH` (derive tu `DOCKER_VOLUMES_DIR`).
**So huu file:** litestream la chu SQLite; rclone PHAI exclude path nay + `-wal`/`-shm`.
**Cach dung:** `litestream restore -if-db-not-exists` luc start -> `litestream replicate` chay nen.
**Kiem tra dung (smoke):** ghi 1 row -> co object moi tren S3. Xoa DB local -> restart -> restore keo lai -> row van con.
**Link:** https://litestream.io/reference/config/ , https://litestream.io/guides/s3-compatible/

---

## 7. Tailscale - mang noi bo
**Image:** `tailscale/tailscale`
**Muc dich:** mang rieng giua cac instance/service, expose noi bo an toan.
**Env noi bo -> image:** `TAILSCALE_CLIENT_ID/_SECRET` (OAuth) -> adapter goi API lay ephemeral authkey -> `TS_AUTHKEY`; `TAILSCALE_TAGS` -> `TS_EXTRA_ARGS=--advertise-tags=...`; `TAILSCALE_STATE_DIR` -> `TS_STATE_DIR`. Ho tro `*_FILE`.
**Map credentials:** dung `tailscale.com.TrustCredentials` (clientId + secretId).
**Cach dung:** container can `/dev/net/tun` + `cap_add: net_admin`. Service khac dung `network_mode: service:tailscale`.
**Node tich tu:** khi coordinator `OLD_AUTO_EXIT=false`, node ephemeral cua instance cu khong duoc don -> can gioi han overlap.
**Kiem tra dung (smoke):** `tailscale status` -> thay node join. Ping node khac qua IP 100.x. Node ephemeral tu bien mat sau khi thoat.
**Link:** https://tailscale.com/docs/features/containers/docker/docker-params

---

## 8. DockFlare (core) - Cloudflare Tunnel controller
**Muc dich:** tu tao tunnel/DNS/Zero Trust theo Docker label.
**Env chinh:** `DOCKFLARE_CF_API_TOKEN` (scoped token), `DOCKFLARE_CF_ACCOUNT_ID` (resolve neu thieu), `DOCKFLARE_TUNNEL_NAME` (PHAI duy nhat theo stack), `DOCKFLARE_REDIS_ENABLE` + `DOCKFLARE_REDIS_URL/HOST/PORT/PASSWORD` (khi multi-host).
**Label tren app:** `dockflare.enable=true`, `dockflare.hostname=app.example.com`, `dockflare.service=http://app:3000`.
**Kiem tra dung (smoke):** gan label cho 1 app test -> tu tao DNS + ingress -> truy cap hostname tu ngoai ra app. Tat app -> rule tu don.
**Link:** https://github.com/ChrispyBacon-dev/DockFlare/wiki , https://dockflare.app
