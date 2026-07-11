#!/usr/bin/env node
// bootstrap.mjs - LUON chay dau tien. Xu ly:
//  1. Resolve ${VAR} long nhau (dotenv + dotenv-expand) -> ghi .env.resolved
//  2. Sinh COMPOSE_PROFILES tu cac <SERVICE>_ENABLE (luon kem 'core')
//  3. Hard-block STACK_ID=CHANGE_ME/rong khi bat module dung RTDB/remote -> exit non-zero
//  4. Derive RCLONE_EXCLUDE tu LITESTREAM_DB_PATH (+wal/shm, pattern **/<db>)
//  5. Rang buoc: COORDINATOR_ENABLE=true -> ep DOCKFLARE_REDIS_ENABLE=true
//  6. Fail-closed: module bao mat thieu credential -> exit non-zero
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { makeLogger } from './lib/logger.mjs';
import { bool } from './lib/env.mjs';

const log = makeLogger('bootstrap');
const ENV_IN = process.env.BOOTSTRAP_ENV_FILE || '.env';
const ENV_OUT = '.env.resolved';

function die(msg) { log.error(msg); process.exit(1); }

// --- STEP 1: load + expand ${VAR} ---------------------------------------
log.step(1, `doc ${ENV_IN} va expand ${'${VAR}'}`);
let parsed;
try {
  const raw = dotenv.parse(readFileSync(ENV_IN, 'utf8'));
  const expanded = dotenvExpand.expand({ parsed: raw, processEnv: {} });
  parsed = expanded.parsed;
} catch (e) {
  die(`Khong doc/expand duoc ${ENV_IN}: ${e.message}. Copy .env.example -> .env truoc.`);
}

const E = (k, d = '') => (parsed[k] ?? d);
const EB = (k, d = false) => bool(parsed[k], d);

// --- STEP 2: hard-block STACK_ID ----------------------------------------
log.step(2, 'kiem tra STACK_ID');
const STACK_ID = E('STACK_ID');
const usesShared = EB('COORDINATOR_ENABLE') || EB('RCLONE_ENABLE') || EB('LITESTREAM_ENABLE');
if (usesShared && (!STACK_ID || STACK_ID === 'CHANGE_ME')) {
  die('STACK_ID dang la CHANGE_ME/rong nhung co module dung RTDB/remote chung duoc bat. '
    + 'Doi STACK_ID thanh gia tri duy nhat truoc khi tiep tuc.');
}
log.info(`STACK_ID=${STACK_ID || '(chua set, khong co module dung chung)'}`);

// --- STEP 3: rang buoc Redis <-> coordinator ----------------------------
log.step(3, 'rang buoc Redis khi bat coordinator');
if (EB('COORDINATOR_ENABLE') && !EB('DOCKFLARE_REDIS_ENABLE')) {
  log.warn('COORDINATOR_ENABLE=true nhung DOCKFLARE_REDIS_ENABLE=false. '
    + 'Luc handover luon multi-host -> tu bat Redis.');
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
