// resolve/index.mjs - resolve credentials + cache 2 tang (local -> RTDB -> API).
// Chi cache gia tri KHONG nhay cam (vd accountId). Log mask secret.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { makeLogger, mask } from '../lib/logger.mjs';
import { decodeMarker } from '../lib/env.mjs';
import { checkCloudflareToken, checkCloudflareGlobalKey } from '../lib/health-check.mjs';

const log = makeLogger('resolve');
const CACHE_PATH = process.env.RESOLVE_CACHE_PATH || '.docker-volumes/.cache/resolve.json';

function readLocalCache() {
  try {
    if (existsSync(CACHE_PATH)) return JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
  } catch (e) { log.warn(`cache local doc loi: ${e.message}`); }
  return {};
}

function writeLocalCache(obj) {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(obj, null, 2));
    log.debug(`cache local ghi: ${CACHE_PATH}`);
  } catch (e) { log.warn(`cache local ghi loi: ${e.message}`); }
}

// Resolve Cloudflare accountId: cache local -> (RTDB neu co) -> API.
export async function resolveCloudflareAccountId() {
  log.step(1, 'resolve Cloudflare accountId');
  const existing = process.env.DOCKFLARE_CF_ACCOUNT_ID;
  if (existing && existing.trim()) {
    log.info('accountId da co san trong env, bo qua resolve');
    return existing.trim();
  }
  const cache = readLocalCache();
  if (cache.cfAccountId) {
    log.info(`cache hit: accountId=${mask(cache.cfAccountId)}`);
    return cache.cfAccountId;
  }
  // Cache miss -> goi API.
  const token = decodeMarker(process.env.DOCKFLARE_CF_API_TOKEN || '');
  if (!token) { log.warn('khong co CF token de resolve accountId'); return null; }
  log.info('cache miss -> goi Cloudflare API');
  const res = await fetch('https://api.cloudflare.com/client/v4/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json().catch(() => null);
  const id = j && j.success && j.result && j.result[0] && j.result[0].id;
  if (!id) { log.error('resolve accountId that bai'); return null; }
  cache.cfAccountId = id;
  writeLocalCache(cache);
  log.info(`resolve OK: accountId=${mask(id)} (da cache)`);
  return id;
}

// CLI: node scripts/resolve/index.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  resolveCloudflareAccountId()
    .then((id) => { log.info(`ket qua: ${id ? mask(id) : 'null'}`); process.exit(id ? 0 : 1); })
    .catch((e) => { log.error(e.message); process.exit(1); });
}
