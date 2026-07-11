// resolve/index.mjs - resolve Cloudflare credentials + cache gia tri KHONG nhay cam.
// Uu tien gia tri da cau hinh. Chi khi thieu moi fallback sang email + Global API Key.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { makeLogger, mask } from '../lib/logger.mjs';
import { decodeMarker } from '../lib/env.mjs';
import { checkCloudflareToken, checkCloudflareGlobalKey } from '../lib/health-check.mjs';

const log = makeLogger('resolve');
const API = 'https://api.cloudflare.com/client/v4';

function readLocalCache(path) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) { log.warn(`cache local doc loi: ${e.message}`); }
  return {};
}

function writeLocalCache(path, obj) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(obj, null, 2));
    log.debug(`cache local ghi: ${path}`);
  } catch (e) { log.warn(`cache local ghi loi: ${e.message}`); }
}

function globalHeaders(email, key) {
  return { 'X-Auth-Email': email, 'X-Auth-Key': key, 'Content-Type': 'application/json' };
}

function tokenHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function cfJson(fetchFn, path, options = {}) {
  const res = await fetchFn(`${API}${path}`, options);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const reason = body?.errors?.map((x) => x.message).filter(Boolean).join('; ') || `HTTP ${res.status}`;
    throw new Error(`Cloudflare API ${path} that bai: ${reason}`);
  }
  return body;
}

async function resolveZoneAndAccount({ env, headers, fetchFn, cache, cachePath }) {
  let accountId = String(env.DOCKFLARE_CF_ACCOUNT_ID || cache.cfAccountId || '').trim();
  let zoneId = String(env.DOCKFLARE_CF_ZONE_ID || cache.cfZoneId || '').trim();
  const domain = String(env.DOMAIN || '').trim();

  if ((!accountId || !zoneId) && domain) {
    const q = new URLSearchParams({ name: domain, status: 'active', per_page: '50' });
    if (accountId) q.set('account.id', accountId);
    const zones = await cfJson(fetchFn, `/zones?${q}`, { headers });
    const zone = zones.result?.find((z) => z.name === domain) || zones.result?.[0];
    if (zone) {
      zoneId ||= zone.id;
      accountId ||= zone.account?.id;
    }
  }

  if (!accountId) {
    const accounts = await cfJson(fetchFn, '/accounts?per_page=50', { headers });
    if (accounts.result?.length !== 1) {
      throw new Error(`Khong xac dinh duy nhat Cloudflare account cho DOMAIN=${domain}. Hay dien DOCKFLARE_CF_ACCOUNT_ID.`);
    }
    accountId = accounts.result[0].id;
  }
  if (!zoneId) throw new Error(`Khong tim thay Zone active cho DOMAIN=${domain}.`);

  cache.cfAccountId = accountId;
  cache.cfZoneId = zoneId;
  writeLocalCache(cachePath, cache);
  return { accountId, zoneId };
}

function permissionByName(groups, names) {
  for (const name of names) {
    const hit = groups.find((g) => g.name === name);
    if (hit) return hit;
  }
  return null;
}

async function createDockFlareToken({ env, email, globalKey, accountId, zoneId, fetchFn }) {
  log.info('API token chua co -> tao scoped token tam thoi tu Global API Key');
  const headers = globalHeaders(email, globalKey);
  const page = await cfJson(fetchFn, '/user/tokens/permission_groups?per_page=1000', { headers });
  const groups = page.result || [];

  const wanted = [
    ['Zone Read'],
    ['DNS Write'],
    ['Cloudflare Tunnel Write', 'Cloudflare Tunnel: Write'],
    ['Access: Apps and Policies Write', 'Access: Apps and Policies: Write'],
    ['Account Settings Read'],
  ];
  const selected = wanted.map((aliases) => permissionByName(groups, aliases));
  const missing = wanted.filter((_, i) => !selected[i]).map((x) => x[0]);
  if (missing.length) throw new Error(`Cloudflare permission group khong tim thay: ${missing.join(', ')}`);

  const zoneGroups = selected.filter((g) => g.scopes?.includes('com.cloudflare.api.account.zone'));
  const accountGroups = selected.filter((g) => g.scopes?.includes('com.cloudflare.api.account'));
  const policies = [];
  if (accountGroups.length) policies.push({
    effect: 'allow',
    resources: { [`com.cloudflare.api.account.${accountId}`]: '*' },
    permission_groups: accountGroups.map(({ id }) => ({ id })),
  });
  if (zoneGroups.length) policies.push({
    effect: 'allow',
    resources: { [`com.cloudflare.api.account.zone.${zoneId}`]: '*' },
    permission_groups: zoneGroups.map(({ id }) => ({ id })),
  });

  const name = `dockflare-${String(env.STACK_ID || 'stack').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40)}-${Date.now()}`;
  const created = await cfJson(fetchFn, '/user/tokens', {
    method: 'POST', headers, body: JSON.stringify({ name, policies }),
  });
  const token = created.result?.value;
  if (!token || !(await checkCloudflareToken(token))) throw new Error('Scoped token vua tao khong verify duoc.');
  log.info(`tao scoped token OK: ${mask(token)} (chi giu trong .env.resolved, khong cache)`);
  return token;
}

export async function resolveCloudflareCredentials(env, { fetchFn = fetch } = {}) {
  const cachePath = env.RESOLVE_CACHE_PATH || '.docker-volumes/.cache/resolve.json';
  const cache = readLocalCache(cachePath);
  let token = decodeMarker(env.DOCKFLARE_CF_API_TOKEN || '').trim();
  const email = String(env.DOCKFLARE_CF_EMAIL || '').trim();
  const globalKey = decodeMarker(env.DOCKFLARE_CF_GLOBAL_APIKEY || '').trim();

  if (token) log.info('DOCKFLARE_CF_API_TOKEN da cau hinh -> khong tao/resolve token');
  else {
    if (!email || !globalKey) {
      throw new Error('Thieu DOCKFLARE_CF_API_TOKEN; fallback can ca DOCKFLARE_CF_EMAIL va DOCKFLARE_CF_GLOBAL_APIKEY.');
    }
    if (!(await checkCloudflareGlobalKey(email, globalKey))) throw new Error('Cloudflare email/Global API Key khong hop le.');
  }

  const authHeaders = token ? tokenHeaders(token) : globalHeaders(email, globalKey);
  const { accountId, zoneId } = await resolveZoneAndAccount({ env, headers: authHeaders, fetchFn, cache, cachePath });
  if (!token) token = await createDockFlareToken({ env, email, globalKey, accountId, zoneId, fetchFn });

  return {
    DOCKFLARE_CF_API_TOKEN: token,
    DOCKFLARE_CF_ACCOUNT_ID: accountId,
    DOCKFLARE_CF_ZONE_ID: zoneId,
  };
}

// Tuong thich CLI cu: in account ID da resolve.
if (import.meta.url === `file://${process.argv[1]}`) {
  resolveCloudflareCredentials(process.env)
    .then((r) => { log.info(`accountId=${mask(r.DOCKFLARE_CF_ACCOUNT_ID)}`); })
    .catch((e) => { log.error(e.message); process.exitCode = 1; });
}
