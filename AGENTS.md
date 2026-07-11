# RULES & AGENT

> Muc tieu: giu repo **khong vo** khi AI agent hoac nguoi cung thao tac. File nay = nguon su that cho cach lam viec tren du an.

## 1. Nguyen tac bat di bat dich

1. **Cau hinh > code.** Luon uu tien env / compose / yml. Chi viet code khi khong con cach cau hinh, va viet toi thieu.
2. **Log ro tung buoc.** Moi script `.mjs` phai log buoc dang lam, input (da mask secret), ket qua, ly do fallback.
3. **Moi nghiep vu mot module.** Khong gom nhieu nghiep vu vao 1 file. resolve / coordinator / rclone / litestream / tailscale / dozzle / filebrowser / ttyd tach bach.
4. **Khong pha core.** Thay doi o `services/*` va `ci/*` khong duoc lam core fail. Core chay duoc doc lap khong can module tuy chon.
5. **Graceful, khong fail-fast.** Module thieu env -> canh bao + tu disable, KHONG lam sap stack.

## 2. Rule secrets (bat buoc)

- **Khong bao gio** commit secret vao repo. Secret goc doc tu CI Secrets / Key Vault / env.
- Chi cache gia tri **khong nhay cam** (vd `accountId`). Khong cache token/key/2FA.
- Log phai **mask** secret (chi hien 4 ky tu cuoi).
- Moi env ho tro **fallback Base64 -> RAW**: thu decode base64, khong hop le thi dung RAW.
- Global API key nen thay bang scoped token khi co the.

## 3. Rule key trung lap

- Danh sach key co nhieu gia tri (vd `github.token`, `supabase.com.database`, `tailscale.com.TrustCredentials`): coi nhu **pool**.
- Resolve: thu phan tu dau -> **health-check con song** -> hong thi fallback phan tu ke. Ghi log cai nao dang dung.

## 4. Rule module tuy chon

- Moi module co flag rieng theo prefix dich vu: `COORDINATOR_ENABLE`, `RCLONE_ENABLE`, `LITESTREAM_ENABLE`, `TAILSCALE_ENABLE`, `DOZZLE_ENABLE`, `FILEBROWSER_ENABLE`, `TTYD_ENABLE`.
- Compose dung **profiles** de include/exclude theo flag.
- Module tu kiem tra du env khong; thieu -> canh bao + tu tat.
- Them module moi: tao thu muc rieng trong `services/`, them `compose.<name>.yml` + flag, KHONG sua core.

## 4b. Rule ENV (quy uoc chung)

- **Prefix theo dich vu** cho moi env de tranh xung dot: `DOCKFLARE_`, `COORDINATOR_`, `RTDB_`, `RCLONE_`, `LITESTREAM_`, `TAILSCALE_`, `DOZZLE_`, `FILEBROWSER_`, `TTYD_`.
- **Dung day du env ma moi dich vu cung cap**, khong bo sot. Moi env co **gia tri mac dinh hop ly** de chay duoc ngay.
- `.env.example` la nguon su that: **moi env phai co comment** giai thich tac dung, cach lay/cau hinh, va **neu la gia tri chon (enum) phai liet ke day du cac gia tri hop le** kem gia tri mac dinh.
- Flag bat/tat dang `<SERVICE>_ENABLE` (mac dinh `false` cho module tuy chon).
- Fallback **Base64 -> RAW** ap dung cho moi env.

## 5. Rule moi truong (core + overlay)

- **1 core chung.** Moi moi truong (GH host/selfhost, Azure host/selfhost, local) chi la **overlay mong** trong `ci/`.
- Khong copy-paste logic giua cac moi truong; dung reusable workflow + matrix.
- CI cache (build / pull / `.docker-volumes`) dat o **tang yml**, KHONG nhet vao code app.
- Data luon map vao `.docker-volumes` (configurable).

## 6. Rule lifecycle / handover

- Lien lac giua instance chi qua **RTDB** (lock/heartbeat/handoff).
- **Con song thi read-only.** Chi 1 primary duoc ghi tai mot thoi diem.
- Instance cu co option tu thoat khi cai moi ready.
- Chung 1 Cloudflare tunnel, nhieu connector -> khong dut traffic khi chuyen.
- Flush (rclone push + litestream) phai xong TRUOC khi nha lock.

## 7. Definition of Done cho moi thay doi

- [ ] Core van `docker compose up` duoc khi tat het module tuy chon.
- [ ] Khong co secret trong diff.
- [ ] Log ro tung buoc, secret duoc mask.
- [ ] Module moi co flag + profile + tu disable khi thieu env.
- [ ] Thay doi moi truong chi nam trong `ci/`, khong dung core.

## 8. AGENT prompt (dan cho AI agent)

> Ban dang lam tren **dockflarestack-template**. Triet ly: cau hinh hon code, code toi thieu, log ro. Toan bo script la Node `.mjs`, moi nghiep vu mot module trong thu muc rieng. KHONG commit secret, KHONG pha core, module tuy chon phai tu disable khi thieu env (graceful). Moi env fallback Base64->RAW. Key trung thi health-check + fallback. Lien lac instance qua RTDB, con song thi read-only, chung 1 tunnel nhieu connector. Truoc khi commit, kiem Definition of Done o muc 7.
