# RULES & AGENT

> Muc tieu: giu repo **khong vo** khi AI agent hoac nguoi cung thao tac. File nay = nguon su that cho cach lam viec tren du an.

## 1. Nguyen tac bat di bat dich

1. **Cau hinh > code.** Luon uu tien env / compose / yml. Chi viet code khi khong con cach cau hinh, va viet toi thieu.
2. **Log ro tung buoc.** Moi script `.mjs` phai log buoc dang lam, input (da mask secret), ket qua, ly do fallback.
3. **Moi nghiep vu mot module.** Khong gom nhieu nghiep vu vao 1 file. resolve / coordinator / rclone / litestream / tailscale / dozzle / filebrowser / ttyd tach bach.
4. **Khong pha core.** Thay doi o `services/*` va `ci/*` khong duoc lam core fail. Core chay duoc doc lap khong can module tuy chon.
5. **Graceful, khong fail-fast - NHUNG chia 2 lop:**
   - **Module thuong** (rclone, litestream, tailscale, coordinator...): thieu env -> canh bao + tu disable, stack van chay (fail-open duoc phep).
   - **Module co be mat bao mat** (ttyd, dozzle khi expose, filebrowser): thieu credential bat buoc -> **fail-closed**, container KHONG start du `ENABLE=true`. Tuyet doi khong "chay tiep khong auth".

## 2. Rule secrets (bat buoc)

- **Khong bao gio** commit secret vao repo. Secret goc doc tu CI Secrets / Key Vault / env.
- Chi cache gia tri **khong nhay cam** (vd `accountId`). Khong cache token/key/2FA.
- Log phai **mask** secret (chi hien 4 ky tu cuoi).
- Moi env ho tro **fallback Base64 -> RAW**: thu decode base64, sau decode phai VALIDATE THEO NGU CANH (vd service account phai JSON.parse duoc) moi chap nhan; khong hop le thi dung RAW.
- Global API key nen thay bang scoped token khi co the.

## 3. Rule key trung lap

- Danh sach key co nhieu gia tri (vd `github.token`, `supabase.com.database`, `tailscale.com.TrustCredentials`): coi nhu **pool**.
- Resolve: thu phan tu dau -> **health-check con song** -> hong thi fallback phan tu ke. Ghi log cai nao dang dung.

## 4. Rule module tuy chon

- Moi module co flag rieng theo prefix dich vu: `COORDINATOR_ENABLE`, `RCLONE_ENABLE`, `LITESTREAM_ENABLE`, `TAILSCALE_ENABLE`, `DOZZLE_ENABLE`, `FILEBROWSER_ENABLE`, `TTYD_ENABLE`.
- Compose dung **profiles** de include/exclude theo flag.
- **`bootstrap.mjs` dong bo flag <-> profiles:** doc moi `<SERVICE>_ENABLE` roi tu sinh `COMPOSE_PROFILES` truoc khi `docker compose up`, luon co profile `core`. KHONG de `.env` flag va CLI `--profile` la 2 nguon lech nhau.
- Module tu kiem tra du env khong; thieu -> canh bao + tu tat (tru module bao mat: fail-closed, xem 1.5).
- Them module moi: tao thu muc rieng trong `services/`, them `compose.<name>.yml` + flag, KHONG sua core.

## 4b. Rule ENV (quy uoc chung)

- **Prefix theo dich vu** cho moi env de tranh xung dot: `DOCKFLARE_`, `COORDINATOR_`, `RTDB_`, `RCLONE_`, `LITESTREAM_`, `TAILSCALE_`, `DOZZLE_`, `FILEBROWSER_`, `TTYD_`.
- **Map tuong minh env noi bo -> env that cua image** (xem bang trong `docs/04`). Image nhu Filebrowser (`FB_*`), ttyd (CLI args), Tailscale (`TS_*`) KHONG doc prefix cua ta -> phai map o compose/entrypoint, khong dua vao trung ten (tranh silent-fail).
- **Dung day du env ma moi dich vu cung cap**, khong bo sot. Moi env co **gia tri mac dinh hop ly**.
- `.env.example` la nguon su that: **moi env co comment** giai thich tac dung, cach lay, va **liet ke day du gia tri enum** kem mac dinh.
- **Default KHONG duoc la hang so dung chung.** `STACK_ID`, `DOCKFLARE_TUNNEL_NAME`, `RCLONE_PATH` phai derive theo ngu canh (vd `${GITHUB_REPOSITORY}`) hoac bat buoc user tu dat truoc khi bat module dung RTDB/remote chung. Copy nguyen `.env.example` ma quen doi -> 2 stack tranh lock / tunnel / ghi de volume cua nhau.
- **Path ben vung derive tu `${DOCKER_VOLUMES_DIR}`**, khong hardcode rieng le.
- **Phan biet container-path vs host-path.** Env nhu `FILEBROWSER_ROOT` la path *trong container* (-> `FB_ROOT`); bind `${DOCKER_VOLUMES_DIR}` vao container nam o compose `volumes:`, khong qua bien root.
- Flag bat/tat dang `<SERVICE>_ENABLE` (mac dinh `false` cho module tuy chon).
- Fallback **Base64 -> RAW** + validate theo ngu canh cho moi env.

## 5. Rule moi truong (core + overlay)

- **1 core chung.** Moi moi truong (GH host/selfhost, Azure host/selfhost, local) chi la **overlay mong** trong `ci/`.
- Khong copy-paste logic giua cac moi truong; dung reusable workflow + matrix.
- CI cache (build / pull / `.docker-volumes`) dat o **tang yml**, KHONG nhet vao code app.
- Data luon map vao `.docker-volumes` (configurable qua `DOCKER_VOLUMES_DIR`).

## 6. Rule lifecycle / handover

- Lien lac giua instance chi qua **RTDB** (lock/heartbeat/handoff).
- **Namespace RTDB tach biet theo nghiep vu**, KHONG dung chung root: `/stack/<STACK_ID>/coordinator/...` (lock/heartbeat/handoff) va `/stack/<STACK_ID>/resolve-cache/...` (accountId, key pool). Tranh resolve ghi de nhanh lock cua coordinator.
- **Atomic lock BAT BUOC:** ETag `if-match` hoac Firebase `runTransaction`, khong GET-roi-PUT (tranh split-brain). Fence token tang dan.
- **Server timestamp:** dung `{".sv":"timestamp"}`, khong dung dong ho client.
- **Con song thi read-only.** Chi 1 primary duoc ghi tai mot thoi diem.
- **litestream so huu SQLite, rclone so huu phan con lai.** rclone BAT BUOC `--exclude` path `LITESTREAM_DB_PATH` + `-wal`/`-shm`. Khong de 2 module dung cung 1 file (tranh corrupt/snapshot lech).
- **Watcher deadline:** handover o moc buffer truoc deadline, khong doi sat gio.
- **Flush guard:** chi flush module dang bat, log ro khi skip.
- Instance cu co option tu thoat khi cai moi ready. **Neu `COORDINATOR_OLD_AUTO_EXIT=false`:** instance cu read-only nhung khong thoat -> node Tailscale ephemeral van song, tich tu qua nhieu chu ky handover. Phai canh bao hoac gioi han so instance overlap toi da (`COORDINATOR_MAX_OVERLAP`).
- Chung 1 Cloudflare tunnel, nhieu connector -> khong dut traffic khi chuyen.
- Flush (rclone push + litestream) phai xong TRUOC khi nha lock.
- Lock path derive theo `STACK_ID` de tranh dung do giua cac stack.

## 7. Definition of Done cho moi thay doi

- [ ] Core van `docker compose up` duoc khi tat het module tuy chon.
- [ ] Khong co secret trong diff.
- [ ] Log ro tung buoc, secret duoc mask.
- [ ] Module moi co flag + profile + tu disable khi thieu env + bootstrap sinh COMPOSE_PROFILES.
- [ ] Module bao mat: fail-closed khi thieu credential (khong fail-open).
- [ ] Env noi bo da map tuong minh sang env that cua image.
- [ ] Path derive tu `DOCKER_VOLUMES_DIR`; default rieng (STACK_ID/TUNNEL_NAME/RCLONE_PATH) khong dung hang chung.
- [ ] Coordinator dung ETag/transaction + server timestamp; namespace RTDB tach coordinator vs resolve-cache.
- [ ] rclone exclude SQLite path cua litestream.
- [ ] Thay doi moi truong chi nam trong `ci/`, khong dung core.

## 8. AGENT prompt (dan cho AI agent)

> Ban dang lam tren **dockflarestack-template**. Triet ly: cau hinh hon code, code toi thieu, log ro. Toan bo script la Node `.mjs`, moi nghiep vu mot module trong thu muc rieng. KHONG commit secret, KHONG pha core. Module thuong tu disable khi thieu env (fail-open); module bao mat (ttyd/dozzle expose/filebrowser) FAIL-CLOSED khi thieu credential. bootstrap.mjs sinh COMPOSE_PROFILES tu cac flag ENABLE (luon co core). Moi env fallback Base64->RAW + validate theo ngu canh. Map tuong minh env noi bo -> env that cua image (FB_*, TS_*, ttyd CLI args bang mang args). Path derive tu DOCKER_VOLUMES_DIR; STACK_ID/TUNNEL_NAME/RCLONE_PATH derive theo ngu canh, khong hang chung. Namespace RTDB tach coordinator vs resolve-cache. Coordinator dung ETag/transaction + server timestamp + fence token; con song thi read-only, chung 1 tunnel nhieu connector; watcher handover truoc deadline; flush guard theo flag; canh bao node tailscale tich tu khi AUTO_EXIT=false. litestream so huu SQLite, rclone --exclude path do + -wal/-shm. Key trung thi health-check + fallback. Truoc khi commit, kiem Definition of Done o muc 7.
