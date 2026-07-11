# DockFlareStack Template

Template deploy da app (source code / docker / npx) tren nhieu moi truong CI/CD
(GitHub Actions host & selfhost, Azure Pipelines host & selfhost, Docker local),
triet ly **uu tien cau hinh hon code**.

## Kien truc

- **Core (luon chay):** DockFlare (Cloudflare Tunnel controller) + app di kem.
- **7 module tuy chon (bat/tat qua flag `<SERVICE>_ENABLE`):** coordinator (RTDB
  lifecycle handover chong restart 60 phut), rclone (sync bulk volume), litestream
  (SQLite realtime -> S3 Supabase), tailscale (mang noi bo), dozzle (log viewer),
  filebrowser (quan ly file), ttyd (WebSSH).

Chi tiet: xem thu muc `docs/` va `AGENTS.md`.

## Cach chay

```bash
# 1. Copy va dien env
cp .env.example .env

# 2. Bootstrap: resolve ${VAR} -> .env.resolved, sinh COMPOSE_PROFILES,
#    hard-block STACK_ID=CHANGE_ME, derive RCLONE_EXCLUDE, kiem fail-closed
node scripts/bootstrap.mjs

# 3. Len stack (bootstrap in ra lenh day du voi --env-file va profiles)
docker compose --env-file .env.resolved -f core/docker-compose.yml up -d
```

> **KHONG** chay `docker compose` doc `.env` goc truc tiep: bien long nhau `${VAR}`
> se khong duoc expand (tunnel name se thanh literal `${STACK_ID}`). Luon qua bootstrap.

## ENV

- Prefix theo dich vu (`DOCKFLARE_`, `COORDINATOR_`, `RCLONE_`...) de tranh xung dot.
- Secret dung marker `base64:` tuong minh neu can decode (vd `base64:eyJ...`);
  khong co prefix thi dung RAW. Sau decode validate theo ngu canh.
- `STACK_ID` BAT BUOC doi (mac dinh `CHANGE_ME`); bootstrap exit non-zero neu con
  gia tri nay ma bat module dung RTDB/remote chung.

## Read-only contract (QUAN TRONG - doc ky)

Khi handover, coordinator chuyen instance cu sang read-only bang cach **phat tin hieu**:
ghi file `${DOCKER_VOLUMES_DIR}/.readonly` (+ optional HTTP endpoint noi bo).

**Day la OPT-IN, mot chieu.** Coordinator KHONG the ep app ben thu ba ngung ghi.
App phai TU tich hop:

1. **App noi bo (khuyen nghi):** import `scripts/lib/readonly-guard.mjs`, goi
   `assertWritable()` truoc moi lan ghi.
2. **App co config read-only:** map tin hieu vao config cua app.
3. **App khong biet read-only (dong goi cung):** KHONG dua vao contract. Phai **dung
   han container app cu** khi handover, hoac chi cho litestream + lock lam nguon ghi
   duy nhat.

Template dam bao read-only o **tang du lieu** (litestream chi primary replicate, lock
RTDB chong 2 primary). "App khong ghi" chi dam bao voi app opt-in. Muon an toan tuyet
doi cho app khong opt-in -> dung tang 3 (dung container cu).

## Thu muc

```
core/            # compose goc + config DockFlare
services/        # moi module 1 thu muc (coordinator, rclone, litestream, tailscale, dozzle, filebrowser, ttyd)
scripts/         # bootstrap.mjs + resolve + rtdb + lib
ci/              # overlay theo moi truong (github, azure, local)
.docker-volumes/ # data chung (configurable qua DOCKER_VOLUMES_DIR)
docs/            # tai lieu kien truc, spec, rules, dich vu, cache, tieu chi, review
```
