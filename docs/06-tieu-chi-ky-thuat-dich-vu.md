# Tieu chi ky thuat trien khai tung dich vu

> Moi dich vu: tieu chi trien khai dung + toi uu, luu y van hanh. Bo sung cho `04-dich-vu-chi-tiet.md`.

## 1. DockFlare (core)
- Token: dung scoped API token (Zone + Account + Tunnel), KHONG global key neu tranh duoc.
- Redis event bus: bat cho multi-host; single-host co the bo.
- `state.json` phai nam trong `.docker-volumes` de ben qua restart.
- Chung 1 tunnel nhieu connector -> cau hinh cung `TUNNEL_NAME`/tunnel ID cho moi instance.
- Toi uu: health check truoc khi cho agent join; log level `info`, `debug` khi soi loi.

## 2. Coordinator + RTDB
- Atomic lock: dung transaction/CAS cua RTDB de gianh primary, tranh race.
- Heartbeat TTL: heartbeat < 1/3 TTL de phat hien chet nhanh. Primary chet -> lock tu het han.
- Fencing: moi primary co token tang dan de chong split-brain.
- Flush truoc nha lock: bat buoc thu tu readonly -> flush xong -> moi nha.
- Tieu chi dung: khong bao gio 2 primary; downtime chuyen giao gan 0 nho overlap connector.

## 3. rclone
- `--transfers` + `--checkers` chinh theo bang thong; mac dinh 4.
- `--fast-list` cho remote nhieu file.
- Dung `copy` thay `sync` khi khong muon xoa o dich; `sync` co the mat du lieu -> test `--dry-run` truoc.
- `--exclude` file lock/tmp de tranh conflict.
- Tieu chi dung: pull truoc start hoan tat moi cho app len; push luc flush khong bo sot file.

## 4. litestream
- Chi cho SQLite, khong dung cho file thuong (do la viec cua rclone).
- `restore -if-db-not-exists` luc start de tranh de DB dang co.
- Auto provider detect (v0.5+) cho Supabase S3.
- Khong chay 2 litestream cung ghi 1 DB -> phu thuoc coordinator de chi primary replicate.
- Tieu chi dung: restart -> restore ve dung thoi diem cuoi; khong mat giao dich.

## 5. Tailscale
- OAuth client (TrustCredentials) tao authkey ephemeral, khong dung authkey dai han.
- `--advertise-tags` bat buoc khi dung OAuth.
- Ephemeral node cho moi truong 60 phut de tu don node chet.
- `TS_STATE_DIR` trong `.docker-volumes` de giu state.
- Tieu chi dung: node join dung tag, node cu tu bien mat sau khi instance thoat.

## 6. Dozzle
- `docker.sock:ro` (read-only) bat buoc.
- `DOZZLE_AUTH_PROVIDER=simple` khi expose; khong de `none` public.
- Agent mode cho multi-host thay vi expose socket.
- Tieu chi dung: log realtime, khong cho thao tac ghi container.

## 7. Filebrowser
- Mount `/srv` -> `.docker-volumes`; database + config mount rieng.
- Doi mat khau admin mac dinh ngay lan dau.
- `FB_BASEURL` khi sau reverse proxy/DockFlare.
- Scope quyen: tao user gioi han thu muc.
- Tieu chi dung: file host <-> UI dong bo 2 chieu.

## 8. ttyd / WebSSH
- BAT BUOC auth (`-c user:pass`) + chi expose qua Tailscale/Cloudflare Access.
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
