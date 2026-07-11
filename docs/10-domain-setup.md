# Domain & truy cap service qua Cloudflare Tunnel

> DOMAIN la thanh phan QUAN TRONG NHAT de truy cap ttyd/filebrowser/dozzle tu internet.

## 1. Co che

DockFlare doc label `dockflare.*` tren moi container roi TU DONG:
- Tao DNS record `<sub>.<DOMAIN>` tren Cloudflare.
- Tao tunnel ingress route toi service.
- (Neu `dockflare.access=true`) tao Zero Trust Access policy bao ve.

App/service chi can gan label, KHONG tu dung reverse proxy.

## 2. Chuan bi domain (lam 1 lan)

1. Add domain vao Cloudflare (tao Zone). Vd `example.com`.
2. Tao API token scoped: **Zone.DNS (Edit)** + **Account.Cloudflare Tunnel (Edit)** + **Account.Access (Edit)** tren zone do.
3. (Neu bat Access) cau hinh danh sach email duoc phep qua `ACCESS_ALLOWED_EMAILS`.

## 3. Cau hinh trong .env

```
DOMAIN=example.com                 # domain goc da add vao Cloudflare
DOCKFLARE_CF_API_TOKEN=<scoped>    # token co quyen tren domain
DOCKFLARE_SUBDOMAIN=dockflare      # -> dockflare.example.com (UI)
DOZZLE_SUBDOMAIN=logs              # -> logs.example.com
FILEBROWSER_SUBDOMAIN=files        # -> files.example.com
TTYD_SUBDOMAIN=ssh                 # -> ssh.example.com
ACCESS_PROTECT=true                # bao ve bang Cloudflare Access
ACCESS_ALLOWED_EMAILS=you@gmail.com
```

Hostname day du (`<sub>.<DOMAIN>`) do bootstrap expand tu `${VAR}`.

## 4. Truy cap sau khi deploy

| Service | URL | Bao ve |
|---|---|---|
| DockFlare UI | https://dockflare.<DOMAIN> | Access |
| Dozzle (log) | https://logs.<DOMAIN> | Access + simple auth |
| Filebrowser | https://files.<DOMAIN> | Access + login |
| ttyd/WebSSH | https://ssh.<DOMAIN> | Access + basic auth (luon bat) |

## 5. Deploy qua GitHub Actions

Workflow `.github/workflows/deploy.yml` (chay thu cong: Actions > deploy > Run workflow).
Can cau hinh **GitHub Secrets**:

| Secret | Mo ta |
|---|---|
| STACK_ID | dinh danh stack duy nhat |
| DOMAIN | domain goc |
| DOCKFLARE_CF_API_TOKEN | Cloudflare scoped token |
| RTDB_URL | (neu dung coordinator/resolve-cache) |
| RTDB_SERVICE_ACCOUNT_B64 | service account JSON da base64 |
| DOZZLE_PASSWORD | (neu bat dozzle) |
| FILEBROWSER_ADMIN_PASSWORD | (neu bat filebrowser) |
| TTYD_CREDENTIAL | user:pass (neu bat ttyd) |
| ACCESS_ALLOWED_EMAILS | email duoc phep qua Access |

Workflow: tao .env -> bootstrap -> validate -> up -> cho DockFlare tao tunnel -> in URL.

## 6. Luu y

- GitHub-hosted runner la ephemeral: tunnel/DNS tao xong nhung khi job ket thuc,
  container tat -> tunnel dong. De chay ben vung dung **self-hosted runner** hoac
  bat **coordinator** (handover giua cac phien 60 phut).
- DNS propagate co the mat vai giay-vai phut lan dau.
