#!/usr/bin/env node
// bootstrap.mjs - LUON chay dau tien. Xu ly:
//  1. Resolve ${VAR} long nhau (deterministic, nhieu pass) -> ghi .env.resolved
//  2. Sinh COMPOSE_PROFILES tu cac <SERVICE>_ENABLE (luon kem 'core')
//  3. Hard-block STACK_ID/DOMAIN=CHANGE_ME/rong -> exit non-zero
//  4. Derive RCLONE_EXCLUDE tu LITESTREAM_DB_PATH (+wal/shm, pattern **/<db>)
//  5. Rang buoc: COORDINATOR_ENABLE=true -> ep DOCKFLARE_REDIS_ENABLE=true
//  6. Fail-closed: module bao mat thieu credential -> exit non-zero
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import dotenv from 'dotenv';
import { makeLogger } from './lib/logger.mjs';
import { bool } from './lib/env.mjs';

const log = makeLogger('bootstrap');
const ENV_IN = process.env.BOOTSTRAP_ENV_FILE || '.env';
const ENV_OUT = '.env.resolved';

function die(msg) { log.error(msg); process.exit(1); }

// Expand ${VAR} deterministic: lap toi da 10 pass cho nested.
function expandAll(map) {
  const RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  const resolve = (val, seen) => {
    let out = val;
    for (let pass = 0; pass < 10 && RE.test(out); pass++) {
      RE.lastIndex = 0;
      out = out.replace(RE, (m, name) => {
        if (seen.has(name)) return m;
        const raw = map[name] ?? process.env[name] ?? '';
        return resolve(raw, new Set([...seen, name]));
      });
    }
    return out;
  };
  const result = {};
  for (const [k, v] of Object.entries(map)) result[k] = resolve(String(v), new Set([k]));
  return result;
}

// --- STEP 1: load + expand ${VAR} ---------------------------------------
log.step(1, `doc ${ENV_IN} va expand ${'${VAR}'}`);
let parsed;
try {
  const raw = dotenv.parse(readFileSync(ENV_IN, 'utf8'));
  parsed = expandAll(raw);
} catch (e) {
  die(`Khong doc/expand duoc ${ENV_IN}: ${e.message}. Copy .env.example -> .env truoc.`);
}

const E = (k, d = '') => (parsed[k] ?? d);
const EB = (k, d = false) => bool(parsed[k], d);

// --- STEP 2: hard-block STACK_ID + DOMAIN -------------------------------
log.step(2, 'kiem tra STACK_ID va DOMAIN');
const STACK_ID = E('STACK_ID');
const usesShared = EB('COORDINATOR_ENABLE') || EB('RCLONE_ENABLE') || EB('LITESTREAM_ENABLE');
if (usesShared && (!STACK_ID || STACK_ID === 'CHANGE_ME')) {
  const why = !STACK_ID ? 'RONG (chua set GitHub Secret STACK_ID hoac thieu trong .env)' : 'con la CHANGE_ME';
  die(`STACK_ID ${why} nhung co module dung RTDB/remote chung duoc bat. `
    + 'Dat STACK_ID = gia tri duy nhat (vd dhstack-prod).');
}
const DOMAIN = E('DOMAIN');
if (!DOMAIN || DOMAIN.includes('CHANGE_ME')) {
  const why = !DOMAIN ? 'RONG (chua set GitHub Secret DOMAIN hoac thieu trong .env)' : 'con chua CHANGE_ME';
  die(`DOMAIN ${why}. DOMAIN la BAT BUOC de expose service qua Cloudflare Tunnel. `
    + 'Neu chay bang deploy.yml: vao repo > Settings > Secrets and variables > Actions, '
    + 'them secret DOMAIN = domain ban da add vao Cloudflare (vd example.com). '
    + 'LUU Y: deploy.yml tu tao .env tu GitHub Secrets, KHONG dung file .env ban commit '
    + 'hay BOOTSTRAP_ENV_FILE - phai set qua Secrets.');
}
log.info(`STACK_ID=${STACK_ID} DOMAIN=${DOMAIN}`);

// Canh bao hostname cua tung service duoc expose
for (const [flag, hostVar, name] of [
  ['DOZZLE_ENABLE', 'DOZZLE_HOSTNAME', 'dozzle'],
  ['FILEBROWSER_ENABLE', 'FILEBROWSER_HOSTNAME', 'filebrowser'],
  ['TTYD_ENABLE', 'TTYD_HOSTNAME', 'ttyd'],
]) {
  if (EB(flag)) log.info(`expose ${name} -> https://${E(hostVar)}`);
}
log.info(`DockFlare UI -> https://${E('DOCKFLARE_HOSTNAME')}`);

// --- STEP 3: rang buoc Redis <-> coordinator ----------------------------
log.step(3, 'rang buoc Redis khi bat coordinator');
if (EB('COORDINATOR_ENABLE') && !EB('DOCKFLARE_REDIS_ENABLE')) {
  log.warn('COORDINATOR_ENABLE=true nhung DOCKFLARE_REDIS_ENABLE=false -> tu bat Redis.');
  parsed.DOCKFLARE_REDIS_ENABLE = 'true';
}

// --- STEP 4: derive RCLONE_EXCLUDE tu LITESTREAM_DB_PATH -----------------
log.step(4, 'derive RCLONE_EXCLUDE');
if (EB('RCLONE_ENABLE') && EB('LITESTREAM_ENABLE')) {
  const dbPath = E('LITESTREAM_DB_PATH', '.docker-volumes/app.db');
  const dbName = basename(dbPath);
  const patterns = [dbName, `${dbName}-wal`, `${dbName}-shm`].map((p) => `**/${p}`);
  parsed.RCLONE_EXCLUDE = patterns.join(',');
  log.info(`RCLONE_EXCLUDE=${parsed.RCLONE_EXCLUDE} (litestream so huu SQLite)`);
}

// --- STEP 5: fail-closed cho module bao mat -----------------------------
log.step(5, 'kiem tra fail-closed module bao mat');
if (EB('TTYD_ENABLE') && !E('TTYD_CREDENTIAL').trim()) {
  die('TTYD_ENABLE=true nhung TTYD_CREDENTIAL rong -> fail-closed (khong start).');
}
if (EB('DOZZLE_ENABLE') && E('DOZZLE_AUTH_PROVIDER', 'simple') === 'simple' && !E('DOZZLE_PASSWORD').trim()) {
  die('DOZZLE_ENABLE=true + auth simple nhung DOZZLE_PASSWORD rong -> fail-closed.');
}
if (EB('FILEBROWSER_ENABLE') && !E('FILEBROWSER_ADMIN_PASSWORD').trim()) {
  die('FILEBROWSER_ENABLE=true nhung FILEBROWSER_ADMIN_PASSWORD rong -> fail-closed.');
}

// --- STEP 6: sinh COMPOSE_PROFILES --------------------------------------
log.step(6, 'sinh COMPOSE_PROFILES');
const PROFILE_MAP = {
  COORDINATOR_ENABLE: 'coordinator',
  RCLONE_ENABLE: 'rclone',
  LITESTREAM_ENABLE: 'litestream',
  TAILSCALE_ENABLE: 'tailscale',
  DOZZLE_ENABLE: 'dozzle',
  FILEBROWSER_ENABLE: 'filebrowser',
  TTYD_ENABLE: 'ttyd',
};
const profiles = ['core'];
for (const [flag, name] of Object.entries(PROFILE_MAP)) {
  if (EB(flag)) profiles.push(name);
}
parsed.COMPOSE_PROFILES = profiles.join(',');
log.info(`COMPOSE_PROFILES=${parsed.COMPOSE_PROFILES}`);

// --- STEP 7: ghi .env.resolved ------------------------------------------
log.step(7, `ghi ${ENV_OUT}`);
const outLines = Object.entries(parsed).map(([k, v]) => `${k}=${v}`);
writeFileSync(ENV_OUT, outLines.join('\n') + '\n');
log.info(`Da ghi ${ENV_OUT} (${outLines.length} bien).`);
log.info('Chay tiep: docker compose --env-file .env.resolved -f core/docker-compose.yml up -d');
