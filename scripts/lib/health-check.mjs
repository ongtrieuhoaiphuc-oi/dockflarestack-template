// health-check.mjs - kiem tra secret 'con song' theo TUNG loai (khong generic HTTP 200).
// Dung cho key pool: thu phan tu dau -> hong thi fallback phan tu ke.
import { makeLogger } from './logger.mjs';
const log = makeLogger('health-check');

async function safeFetch(url, opts) {
  try {
    const res = await fetch(url, opts);
    return res;
  } catch (e) {
    log.warn(`fetch loi: ${url} -> ${e.message}`);
    return null;
  }
}

// Cloudflare scoped token
export async function checkCloudflareToken(token) {
  const res = await safeFetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res || !res.ok) return false;
  const j = await res.json().catch(() => null);
  return !!(j && j.success && j.result && j.result.status === 'active');
}

// Cloudflare global key + email
export async function checkCloudflareGlobalKey(email, key) {
  const res = await safeFetch('https://api.cloudflare.com/client/v4/user', {
    headers: { 'X-Auth-Email': email, 'X-Auth-Key': key },
  });
  if (!res || !res.ok) return false;
  const j = await res.json().catch(() => null);
  return !!(j && j.success);
}

// GitHub token
export async function checkGithubToken(token) {
  const res = await safeFetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'dockflarestack' },
  });
  return !!(res && res.status === 200);
}

// Supabase access token
export async function checkSupabaseToken(token) {
  const res = await safeFetch('https://api.supabase.com/v1/projects', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return !!(res && res.status === 200);
}

// Tailscale OAuth client -> lay ephemeral authkey (tra access_token = con song)
export async function checkTailscaleOAuth(clientId, clientSecret) {
  const res = await safeFetch('https://api.tailscale.com/api/v2/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
  });
  if (!res || !res.ok) return false;
  const j = await res.json().catch(() => null);
  return !!(j && j.access_token);
}

// Chon phan tu song dau tien trong pool. checkFn: async (item) => bool.
export async function pickAlive(pool, checkFn, { label = 'secret' } = {}) {
  for (let i = 0; i < pool.length; i++) {
    const ok = await checkFn(pool[i]);
    if (ok) {
      log.info(`${label}: dung phan tu #${i} (con song)`);
      return pool[i];
    }
    log.warn(`${label}: phan tu #${i} chet, fallback...`);
  }
  log.error(`${label}: TAT CA phan tu trong pool deu chet.`);
  return null;
}
