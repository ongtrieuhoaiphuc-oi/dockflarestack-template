# Chot ky thuat cuoi cung (truoc khi code)

> Chot cac gia tri cu the de agent code khong phai doan.

## 1. Base64 marker + ttyd writable (da chot)
- Bo auto-detect, dung marker `base64:` tuong minh. Gia tri co prefix `base64:` ->
  decode phan sau; khong co prefix -> dung RAW. Sau decode validate theo ngu canh.
  - Vd: `RTDB_SERVICE_ACCOUNT=base64:eyJ0eXBlIjoi...` -> decode;
        `DOCKFLARE_CF_API_TOKEN=abcdef123` -> dung RAW.
- `TTYD_WRITABLE=true` mac dinh (WebSSH tuong tac that).

## 2. Ten Compose profiles (chot cung)
Moi service = 1 profile trung ten flag (khong prefix). bootstrap.mjs doc
`<SERVICE>_ENABLE=true` -> them profile vao COMPOSE_PROFILES.

| Service | Flag env | Profile name |
|---|---|---|
| DockFlare (core) | (luon bat) | core |
| Coordinator | COORDINATOR_ENABLE | coordinator |
| rclone | RCLONE_ENABLE | rclone |
| litestream | LITESTREAM_ENABLE | litestream |
| tailscale | TAILSCALE_ENABLE | tailscale |
| dozzle | DOZZLE_ENABLE | dozzle |
| filebrowser | FILEBROWSER_ENABLE | filebrowser |
| ttyd | TTYD_ENABLE | ttyd |

COMPOSE_PROFILES luon bat dau bang core. Vd bat coordinator + rclone:
COMPOSE_PROFILES=core,coordinator,rclone. LUU Y: profile coordinator keo theo Redis.

## 3. Version deps (pin, uu tien moi nhat 7/2026)
package.json (type: module):
- dotenv ^17.0.0
- dotenv-expand ^13.0.0  (resolve ${VAR} long nhau)
- firebase-admin ^14.1.0 (RTDB runTransaction atomic, khong tu che ETag REST)
- string-argv ^0.3.2     (tokenize TTYD_CMD an toan, khong eval shell)
engines: node >=20

## 4. Health-check endpoint theo tung loai secret (chot cu the)
Khong dung generic HTTP 200. Moi loai key check bang endpoint rieng:

| Secret | Endpoint check | Dieu kien song |
|---|---|---|
| Cloudflare token | GET /client/v4/user/tokens/verify (Bearer) | result.status == active |
| Cloudflare global key | GET /client/v4/user (X-Auth-Key + X-Auth-Email) | 200 + success:true |
| GitHub token | GET https://api.github.com/user (Bearer) | 200, khong 401 |
| Supabase access token | GET https://api.supabase.com/v1/projects (Bearer) | 200 |
| Supabase S3 key | HeadBucket qua S3 API | 200 |
| Tailscale OAuth | POST /api/v2/oauth/token (client_credentials) | tra access_token |
| Tailscale API key | GET /api/v2/tailnet/-/devices (Bearer) | 200 |

Key pool: thu phan tu dau -> endpoint tuong ung -> hong (401/403/expired) thi
fallback phan tu ke. Log key nao dang dung (mask).

## 5. Read-only contract - giai thich ro (opt-in)
Coordinator KHONG the ep app ben thu ba ngung ghi. No chi PHAT TIN HIEU (ghi file
${DOCKER_VOLUMES_DIR}/.readonly + optional HTTP endpoint). App muon ton trong
read-only phai TU doc tin hieu truoc moi lan ghi -> OPT-IN.

3 tang bao ve:
1. App noi bo (tu viet): import scripts/lib/readonly-guard.mjs, goi assertWritable()
   truoc khi ghi. Khuyen nghi.
2. App co config read-only: map tin hieu vao config cua app.
3. App khong biet read-only (dong goi cung): KHONG dua vao contract. Phai DUNG HAN
   container app cu khi handover, hoac chi cho litestream + lock lam nguon ghi duy nhat.

He qua: template dam bao read-only o TANG DU LIEU (litestream chi primary replicate,
lock RTDB chong 2 primary). "App khong ghi" chi dam bao voi app opt-in. Muon an toan
tuyet doi cho app khong opt-in -> dung tang 3 (dung container cu).
