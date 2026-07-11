#!/usr/bin/env node
// bootstrap.mjs - resolve env, Cloudflare credentials, profiles va validate truoc compose.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import dotenv from 'dotenv';
import { makeLogger } from './lib/logger.mjs';
import { bool } from './lib/env.mjs';
import { resolveCloudflareCredentials } from './resolve/index.mjs';

const log = makeLogger('bootstrap');
const ENV_IN = process.env.BOOTSTRAP_ENV_FILE || '.env';
const ENV_OUT = '.env.resolved';
function die(msg) { log.error(msg); process.exit(1); }

function expandAll(map) {
  const RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  const resolve = (val, seen) => {
    let out = val;
    for (let pass = 0; pass < 10 && RE.test(out); pass++) {
      RE.lastIndex = 0;
      out = out.replace(RE, (m, name) => {
        if (seen.has(name)) return m;
        return resolve(map[name] ?? process.env[name] ?? '', new Set([...seen, name]));
      });
    }
    return out;
  };
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, resolve(String(v), new Set([k]))]));
}

log.step(1, `doc ${ENV_IN} va expand ${'${VAR}'}`);
let parsed;
try { parsed = expandAll(dotenv.parse(readFileSync(ENV_IN, 'utf8'))); }
catch (e) { die(`Khong doc/expand duoc ${ENV_IN}: ${e.message}.`); }
const E = (k, d = '') => (parsed[k] ?? d);
const EB = (k, d = false) => bool(parsed[k], d);

log.step(2, 'kiem tra STACK_ID va DOMAIN');
const STACK_ID = E('STACK_ID');
const usesShared = EB('COORDINATOR_ENABLE') || EB('RCLONE_ENABLE') || EB('LITESTREAM_ENABLE');
if (usesShared && (!STACK_ID || STACK_ID === 'CHANGE_ME')) die('STACK_ID rong/CHANGE_ME khi module dung shared storage duoc bat.');
const DOMAIN = E('DOMAIN');
if (!DOMAIN || DOMAIN.includes('CHANGE_ME')) die('DOMAIN rong hoac con CHANGE_ME.');
log.info(`STACK_ID=${STACK_ID} DOMAIN=${DOMAIN}`);

log.step(3, 'resolve Cloudflare credentials (chi resolve phan con thieu)');
try { Object.assign(parsed, await resolveCloudflareCredentials(parsed)); }
catch (e) { die(e.message); }

for (const [flag, hostVar, name] of [
  ['DOZZLE_ENABLE', 'DOZZLE_HOSTNAME', 'dozzle'],
  ['FILEBROWSER_ENABLE', 'FILEBROWSER_HOSTNAME', 'filebrowser'],
  ['TTYD_ENABLE', 'TTYD_HOSTNAME', 'ttyd'],
]) if (EB(flag)) log.info(`expose ${name} -> https://${E(hostVar)}`);
log.info(`DockFlare UI -> https://${E('DOCKFLARE_HOSTNAME')}`);

log.step(4, 'rang buoc Redis khi bat coordinator');
if (EB('COORDINATOR_ENABLE') && !EB('DOCKFLARE_REDIS_ENABLE')) {
  log.warn('COORDINATOR_ENABLE=true -> tu bat Redis.');
  parsed.DOCKFLARE_REDIS_ENABLE = 'true';
}

log.step(5, 'derive RCLONE_EXCLUDE');
if (EB('RCLONE_ENABLE') && EB('LITESTREAM_ENABLE')) {
  const dbName = basename(E('LITESTREAM_DB_PATH', '.docker-volumes/app.db'));
  parsed.RCLONE_EXCLUDE = [dbName, `${dbName}-wal`, `${dbName}-shm`].map((p) => `**/${p}`).join(',');
}

log.step(6, 'kiem tra fail-closed module bao mat');
if (EB('TTYD_ENABLE') && !E('TTYD_CREDENTIAL').trim()) die('TTYD_CREDENTIAL rong.');
if (EB('DOZZLE_ENABLE') && E('DOZZLE_AUTH_PROVIDER', 'simple') === 'simple' && !E('DOZZLE_PASSWORD').trim()) die('DOZZLE_PASSWORD rong.');
if (EB('FILEBROWSER_ENABLE') && !E('FILEBROWSER_ADMIN_PASSWORD').trim()) die('FILEBROWSER_ADMIN_PASSWORD rong.');

log.step(7, 'sinh COMPOSE_PROFILES');
const PROFILE_MAP = {
  COORDINATOR_ENABLE: 'coordinator', RCLONE_ENABLE: 'rclone', LITESTREAM_ENABLE: 'litestream',
  TAILSCALE_ENABLE: 'tailscale', DOZZLE_ENABLE: 'dozzle', FILEBROWSER_ENABLE: 'filebrowser', TTYD_ENABLE: 'ttyd',
};
parsed.COMPOSE_PROFILES = ['core', ...Object.entries(PROFILE_MAP).filter(([f]) => EB(f)).map(([, p]) => p)].join(',');

log.step(8, `ghi ${ENV_OUT}`);
writeFileSync(ENV_OUT, Object.entries(parsed).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
log.info(`Da ghi ${ENV_OUT}.`);
