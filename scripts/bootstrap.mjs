#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import dotenv from 'dotenv';
import { makeLogger } from './lib/logger.mjs';
import { bool } from './lib/env.mjs';
import { resolveCloudflareCredentials } from './resolve/index.mjs';
import { mintAuthKey } from '../services/tailscale/adapter.mjs';

const log = makeLogger('bootstrap');
const ENV_IN = process.env.BOOTSTRAP_ENV_FILE || '.env';
const ENV_OUT = '.env.resolved';
function die(msg) { log.error(msg); process.exit(1); }
function expandAll(map) {
  const re = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  const resolve = (val, seen) => String(val).replace(re, (m, name) => seen.has(name) ? m : resolve(map[name] ?? process.env[name] ?? '', new Set([...seen, name])));
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, resolve(v, new Set([k]))]));
}

log.step(1, `doc ${ENV_IN} va expand env`);
let parsed;
try { parsed = expandAll(dotenv.parse(readFileSync(ENV_IN, 'utf8'))); }
catch (e) { die(`Khong doc duoc ${ENV_IN}: ${e.message}`); }
const E = (k, d = '') => String(parsed[k] ?? d);
const EB = (k, d = false) => bool(parsed[k], d);
const requireVars = (module, vars) => {
  const missing = vars.filter((k) => !E(k).trim());
  if (missing.length) die(`${module} dang bat nhung thieu: ${missing.join(', ')}. Tat ${module}_ENABLE hoac dien du env.`);
};

log.step(2, 'kiem tra core');
if (!E('STACK_ID') || E('STACK_ID') === 'CHANGE_ME') die('STACK_ID rong/CHANGE_ME.');
if (!E('DOMAIN') || E('DOMAIN').includes('CHANGE_ME')) die('DOMAIN rong/CHANGE_ME.');

log.step(3, 'resolve Cloudflare credentials');
try { Object.assign(parsed, await resolveCloudflareCredentials(parsed)); }
catch (e) { die(e.message); }

log.step(4, 'validate module tuy chon truoc compose');
if (EB('COORDINATOR_ENABLE')) {
  requireVars('COORDINATOR', ['RTDB_URL', 'RTDB_SERVICE_ACCOUNT']);
  parsed.DOCKFLARE_REDIS_ENABLE = 'true';
  // Host path khong ton tai trong container; compose mount volume vao /data.
  parsed.COORDINATOR_CONTAINER_READONLY_FLAG_PATH = '/data/.readonly';
}
if (EB('RCLONE_ENABLE')) requireVars('RCLONE', ['RCLONE_REMOTE', 'RCLONE_PATH']);
if (EB('RCLONE_ENABLE') && !E('RCLONE_CONFIG_PATH').trim() && !E('RCLONE_CONFIG_CONTENT').trim()) {
  die('RCLONE dang bat nhung thieu ca RCLONE_CONFIG_PATH va RCLONE_CONFIG_CONTENT.');
}
if (EB('LITESTREAM_ENABLE')) {
  requireVars('LITESTREAM', ['LITESTREAM_DB_PATH', 'LITESTREAM_S3_ENDPOINT', 'LITESTREAM_S3_BUCKET', 'LITESTREAM_S3_ACCESS_KEY_ID', 'LITESTREAM_S3_SECRET_ACCESS_KEY']);
  parsed.LITESTREAM_CONTAINER_DB_PATH = `/data/${basename(E('LITESTREAM_DB_PATH'))}`;
}
if (EB('TAILSCALE_ENABLE') && !E('TS_AUTHKEY').trim()) {
  requireVars('TAILSCALE', ['TAILSCALE_CLIENT_ID', 'TAILSCALE_CLIENT_SECRET', 'TAILSCALE_TAGS']);
  try {
    parsed.TS_AUTHKEY = await mintAuthKey({
      clientId: E('TAILSCALE_CLIENT_ID'), clientSecret: E('TAILSCALE_CLIENT_SECRET'),
      tags: E('TAILSCALE_TAGS'), ephemeral: EB('TAILSCALE_EPHEMERAL', true),
    });
  } catch (e) { die(`Tailscale adapter: ${e.message}`); }
}
if (EB('TTYD_ENABLE')) requireVars('TTYD', ['TTYD_CREDENTIAL']);
if (EB('DOZZLE_ENABLE') && E('DOZZLE_AUTH_PROVIDER', 'simple') === 'simple') requireVars('DOZZLE', ['DOZZLE_PASSWORD']);
if (EB('FILEBROWSER_ENABLE')) requireVars('FILEBROWSER', ['FILEBROWSER_ADMIN_PASSWORD']);

log.step(5, 'derive rclone exclude');
if (EB('RCLONE_ENABLE') && EB('LITESTREAM_ENABLE')) {
  const db = basename(E('LITESTREAM_DB_PATH'));
  parsed.RCLONE_EXCLUDE = [db, `${db}-wal`, `${db}-shm`].map((x) => `**/${x}`).join(',');
}

log.step(6, 'sinh profiles');
const map = { COORDINATOR_ENABLE:'coordinator', RCLONE_ENABLE:'rclone', LITESTREAM_ENABLE:'litestream', TAILSCALE_ENABLE:'tailscale', DOZZLE_ENABLE:'dozzle', FILEBROWSER_ENABLE:'filebrowser', TTYD_ENABLE:'ttyd' };
parsed.COMPOSE_PROFILES = ['core', ...Object.entries(map).filter(([k]) => EB(k)).map(([,v]) => v)].join(',');

log.step(7, `ghi ${ENV_OUT}`);
writeFileSync(ENV_OUT, Object.entries(parsed).map(([k,v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
log.info(`bootstrap OK profiles=${parsed.COMPOSE_PROFILES}`);
