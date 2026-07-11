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

---

## 1. Dozzle - realtime log viewer
**Image:** `amir20/dozzle`
**Muc dich:** xem log realtime cua tat ca container qua web, khong can `docker logs`.
**Env chinh:** `DOZZLE_ADDR` (`:8080`), `DOZZLE_BASE` (`/`), `DOZZLE_AUTH_PROVIDER` (`none`|`simple`), `DOZZLE_HOSTNAME`, `DOZZLE_LEVEL`, `DOZZLE_NO_ANALYTICS=1`.
**Cach dung:** mount `/var/run/docker.sock:/var/run/docker.sock:ro`, mo UI cong 8080. Co agent mode cho multi-host.
**Kiem tra dung:** mo UI -> thay container + log realtime. Smoke: `docker run hello-world` -> log phai xuat hien tuc thi.
**Link:** https://dozzle.dev/guide/supported-env-vars

---

## 2. Filebrowser - quan ly file qua web
**Image:** `filebrowser/filebrowser`
**Muc dich:** duyet/sua/upload file trong `.docker-volumes` qua web.
**Env/config:** cau hinh qua flag/`config` file; bien map `FB_` (vd `FB_DATABASE`, `FB_ROOT`, `FB_PORT`, `FB_BASEURL`). Mount 3 volume: data (`/srv`), database, config.
**Cach dung:** tro `/srv` vao `.docker-volumes`. Lan dau tao admin user, doi mat khau mac dinh ngay.
**Kiem tra dung:** dang nhap -> thay cay thu muc. Smoke: tao file test tren host -> refresh UI phai thay; upload qua UI -> host phai co.
**Luu y:** co fork `gtstef/filebrowser` (Quantum) env-first manh hon - can xac nhan.
**Link:** https://filebrowser.org/installation.html

---

## 3. ttyd (WebSSH Linux) - terminal qua web
**Image:** `tsl0922/ttyd`
**Muc dich:** SSH vao host/runner qua trinh duyet.
**Cau hinh (qua CLI args):** `-p 7681` (port), `-c user:pass` (basic auth), `-W` (writable), `--ssl` kem cert. Vd: `ttyd -p 7681 -c admin:secret bash`. De SSH vao host: `ttyd ssh user@host`.
**Prefix env template:** bao args vao `TTYD_*` (`TTYD_PORT`, `TTYD_CREDENTIAL`, `TTYD_CMD`) roi entrypoint dung CLI.
**Kiem tra dung:** mo UI cong 7681 -> hien terminal, `whoami` tra dung host runner. Smoke: tao file qua terminal -> kiem tra tren host.
**Bao mat:** BAT BUOC co auth (`-c`) + uu tien chi expose qua Tailscale/Cloudflare Access.
**Link:** https://github.com/tsl0922/ttyd

---

## 4. Coordinator + RTDB - lifecycle handover
**Muc dich:** chong restart 60 phut. Giu write-lock / heartbeat / handoff tren Google RTDB.
**Env:** `COORDINATOR_ENABLE`, `RTDB_URL`, `RTDB_SERVICE_ACCOUNT` (base64->raw), `COORDINATOR_LOCK_PATH`, `COORDINATOR_HEARTBEAT_SEC`, `COORDINATOR_SESSION_TTL_SEC`.
**Schema RTDB de xuat:**
```
/stack/<stackId>/
  primary:   { instanceId, since, expiresAt }
  instances: { <id>: { state: starting|ready|readonly|exiting, heartbeat } }
  handoff:   { requestedBy, at }
```
**Kiem tra dung (smoke):** chay 2 instance local. A len truoc = primary. Khoi B -> primary doi sang B, A readonly. Thu ghi tu A -> bi tu choi. Khong duoc co 2 primary cung luc.

---

## 5. rclone - sync bulk .docker-volumes
**Muc dich:** pull `.docker-volumes` ve truoc khi start, push khi gan het gio.
**Env:** `RCLONE_ENABLE`, `RCLONE_CONFIG` (base64->raw), hoac inline `RCLONE_CONFIG_<REMOTE>_TYPE`..., `RCLONE_REMOTE`, `RCLONE_PATH`.
**Cach dung:** `rclone sync <remote>:<path> /.docker-volumes` luc start; nguoc lai luc flush. Dung `--dry-run` de test truoc.
**Kiem tra dung (smoke):** tao file trong volume -> push -> kiem tra remote co file. Xoa local -> pull -> file quay ve.
**Link:** https://rclone.org/docs/

---

## 6. litestream - SQLite realtime -> S3 Supabase
**Muc dich:** replicate SQLite lien tuc len S3 Supabase, restore luc start.
**Config (`litestream.yml`):**
```yaml
dbs:
  - path: /.docker-volumes/app.db
    replicas:
      - type: s3
        endpoint: ${LITESTREAM_S3_ENDPOINT}
        bucket: ${LITESTREAM_S3_BUCKET}
        access-key-id: ${LITESTREAM_S3_ACCESS_KEY_ID}
        secret-access-key: ${LITESTREAM_S3_SECRET_ACCESS_KEY}
```
**Env:** `LITESTREAM_ENABLE`, `LITESTREAM_S3_ENDPOINT`, `LITESTREAM_S3_BUCKET`, `LITESTREAM_S3_ACCESS_KEY_ID`, `LITESTREAM_S3_SECRET_ACCESS_KEY`.
**Cach dung:** `litestream restore -if-db-not-exists` luc start -> `litestream replicate` chay nen.
**Kiem tra dung (smoke):** ghi 1 row -> co object moi tren S3. Xoa DB local -> restart -> restore keo lai -> row van con.
**Link:** https://litestream.io/reference/config/ , https://litestream.io/guides/s3-compatible/

---

## 7. Tailscale - mang noi bo
**Image:** `tailscale/tailscale`
**Muc dich:** mang rieng giua cac instance/service, expose noi bo an toan.
**Env:** `TS_AUTHKEY` (hoac `TS_CLIENT_ID`+`TS_CLIENT_SECRET` cho OAuth), `TS_STATE_DIR=/var/lib/tailscale`, `TS_USERSPACE=false`, `TS_EXTRA_ARGS=--advertise-tags=tag:container`. Ho tro `*_FILE`.
**Map credentials:** dung `tailscale.com.TrustCredentials` (clientId + secretId) -> OAuth.
**Cach dung:** container can `/dev/net/tun` + `cap_add: net_admin`. Service khac dung `network_mode: service:tailscale`.
**Kiem tra dung (smoke):** `tailscale status` -> thay node join. Ping node khac qua IP 100.x.
**Link:** https://tailscale.com/docs/features/containers/docker/docker-params

---

## 8. DockFlare (core) - Cloudflare Tunnel controller
**Muc dich:** tu tao tunnel/DNS/Zero Trust theo Docker label.
**Env chinh:** `DOCKFLARE_CF_API_TOKEN` (scoped token), `DOCKFLARE_CF_ACCOUNT_ID` (resolve neu thieu), `DOCKFLARE_TUNNEL_NAME`. Master/agent + Redis event bus.
**Label tren app:** `dockflare.enable=true`, `dockflare.hostname=app.example.com`, `dockflare.service=http://app:3000`.
**Kiem tra dung (smoke):** gan label cho 1 app test -> tu tao DNS + ingress -> truy cap hostname tu ngoai ra app. Tat app -> rule tu don.
**Link:** https://github.com/ChrispyBacon-dev/DockFlare/wiki , https://dockflare.app
