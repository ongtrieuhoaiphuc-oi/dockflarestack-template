# Ky thuat Cache & CI/CD

> Nguyen tac: cache dat o **tang yml workflow**, KHONG nhet vao code app. Moi phien ban action pin theo ban moi nhat da kiem chung.

## 1. Phien ban tooling moi nhat (7/2026)

| Tool | Ban de xuat | Ghi chu |
|---|---|---|
| `actions/checkout` | **v4** (on dinh) hoac v7 | v7 siet bao mat fork PR; selfhost cu dung v4 |
| `actions/cache` | **v4** | v5 can Node 24 + runner >= 2.327.1 |
| `docker/setup-buildx-action` | **v3** | bat BuildKit + driver docker-container |
| `docker/build-push-action` | **v6** | ho tro `cache-from`/`cache-to` day du |
| `docker/login-action` | **v3** | login registry |

**Quy tac pin:** pin theo major tag (`@v4`); production nhay cam thi pin theo commit SHA. Selfhost kiem phien ban runner truoc khi nang cache v5.

## 2. Phan loai cache

| Loai | Cai gi | Key theo | Luu o dau |
|---|---|---|---|
| Build cache | Docker layer (BuildKit) | Dockerfile + lockfile hash | GHA cache / registry / local |
| Pull cache | image da pull | image ref + tag | layer store runner |
| Volume cache | `.docker-volumes` | selfhost warm-start | path cache |
| Dependency cache | npm cho `.mjs` | `package-lock.json` hash | GHA cache |

## 3. Docker build cache - quy tac

BuildKit + buildx bat buoc. Ba backend cache:
- `type=gha`: dung GitHub Actions cache API. Phu hop GH host.
- `type=registry`: day cache len registry (`:buildcache`). Phu hop Azure + cross-runner.
- `type=local`: cache ra thu muc de selfhost persistent giu lai.

Luon dung `mode=max`. Toi uu Dockerfile: copy lockfile + install truoc, copy source sau de layer deps khong bi invalidate khi doi code.

## 4. Cache tren GitHub Actions

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: docker/setup-buildx-action@v3
  - uses: docker/build-push-action@v6
    with:
      context: .
      push: false
      load: true
      cache-from: type=gha
      cache-to: type=gha,mode=max
```

Dependency (npm cho .mjs):
```yaml
  - uses: actions/cache@v4
    with:
      path: ~/.npm
      key: npm-${{ hashFiles('**/package-lock.json') }}
      restore-keys: npm-
```

GHA cache gioi han ~10GB/repo, LRU evict. Dung rclone cho `.docker-volumes` (ben hon cache CI).

## 5. Cache tren Azure Pipelines

Dependency cache (Cache@2):
```yaml
- task: Cache@2
  inputs:
    key: 'npm | "$(Agent.OS)" | package-lock.json'
    restoreKeys: 'npm | "$(Agent.OS)"'
    path: $(Pipeline.Workspace)/.npm
```

Docker layer caching:
- Microsoft-hosted (khong persistent): dung `type=registry` - pull `:buildcache` truoc, build `--cache-from`, push lai.
- Self-hosted (persistent): layer con tren may nen nhanh; chi can `DOCKER_BUILDKIT=1`.

Azure khong co `type=gha` -> cross-runner cache di qua registry.

## 6. Cache tren Docker local

- BuildKit tu giu layer cache tren may. Chi can `DOCKER_BUILDKIT=1`.
- Volume: rclone pull truoc `up`, push khi gan het gio (neu bat coordinator).

## 7. Ma tran cache theo moi truong

| Moi truong | Build cache | Volume | Dependency |
|---|---|---|---|
| GH host | `type=gha` | rclone | `actions/cache@v4` |
| GH selfhost | `type=local` + BuildKit persistent | local disk + rclone | `actions/cache@v4` |
| Azure host | `type=registry` (:buildcache) | rclone | `Cache@2` |
| Azure selfhost | BuildKit persistent | local disk + rclone | `Cache@2` |
| Docker local | BuildKit local | rclone | npm local |

## 8. Tieu chi nghiem thu cache
- Chay workflow 2 lan lien tiep: lan 2 build nhanh hon ro (log BuildKit bao `CACHED`).
- Doi 1 dong source (khong doi deps) -> layer deps van `CACHED`, chi layer cuoi rebuild.
- Cache key thay doi dung khi lockfile doi.

**Links:** https://docs.docker.com/build/ci/github-actions/cache/ , https://github.com/actions/cache , https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/cache-v2
