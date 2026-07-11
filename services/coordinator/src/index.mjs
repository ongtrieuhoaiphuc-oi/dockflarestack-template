// coordinator - lifecycle handover tren RTDB, Firebase Admin v14 modular API.
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const LOCK_PATH = process.env.COORDINATOR_LOCK_PATH || '/stack/default/coordinator';
const HEARTBEAT_SEC = Number(process.env.COORDINATOR_HEARTBEAT_SEC || 15);
const TTL_SEC = Number(process.env.COORDINATOR_SESSION_TTL_SEC || 60);
const BUFFER_SEC = Number(process.env.COORDINATOR_HANDOVER_BUFFER_SEC || 600);
const AUTO_EXIT = ['1','true','yes'].includes(String(process.env.COORDINATOR_OLD_AUTO_EXIT).toLowerCase());
const MAX_OVERLAP = Number(process.env.COORDINATOR_MAX_OVERLAP || 2);
const READONLY_FLAG = process.env.COORDINATOR_READONLY_FLAG_PATH || '/data/.readonly';
const INSTANCE_ID = process.env.HOSTNAME || randomUUID().slice(0, 8);
const JOB_START = Date.now();
const SERVER_TS = { '.sv': 'timestamp' };

function log(level, msg) { console.log(`[${new Date().toISOString()}] [${level}] [coordinator] ${msg}`); }
function fatal(msg) { console.error(`[${new Date().toISOString()}] [FATAL] [coordinator] ${msg}`); }

function parseServiceAccount(raw) {
  if (!raw?.trim()) throw new Error('RTDB_SERVICE_ACCOUNT rong');
  const decoded = raw.startsWith('base64:') ? Buffer.from(raw.slice(7), 'base64').toString('utf8') : raw;
  const sa = JSON.parse(decoded);
  for (const key of ['project_id', 'client_email', 'private_key']) if (!sa[key]) throw new Error(`service account thieu ${key}`);
  return sa;
}

function initDb() {
  const url = process.env.RTDB_URL?.trim();
  if (!url) throw new Error('RTDB_URL rong');
  const app = initializeApp({ credential: cert(parseServiceAccount(process.env.RTDB_SERVICE_ACCOUNT)), databaseURL: url });
  return getDatabase(app);
}

let db;
try { db = initDb(); log('INFO', 'Firebase Admin v14 khoi tao OK'); }
catch (e) { fatal(`initializeApp that bai: ${e.message}`); process.exit(1); }
let isPrimary = false;
let fenceToken = 0;

function setReadonly(on) {
  try {
    if (on) { writeFileSync(READONLY_FLAG, `readonly since ${new Date().toISOString()}\n`); log('INFO', `READ-ONLY ON (${READONLY_FLAG})`); }
    else if (existsSync(READONLY_FLAG)) { unlinkSync(READONLY_FLAG); log('INFO', 'READ-ONLY OFF'); }
  } catch (e) { log('WARN', `readonly flag loi: ${e.message}`); }
}
async function registerInstance(state) { await db.ref(`${LOCK_PATH}/instances/${INSTANCE_ID}`).update({ state, heartbeat: SERVER_TS }); }
async function tryAcquire() {
  const now = Date.now();
  const res = await db.ref(`${LOCK_PATH}/primary`).transaction((cur) => {
    if (cur?.expiresAtMs > now && cur.instanceId !== INSTANCE_ID) return;
    fenceToken = (cur?.fenceToken || 0) + 1;
    return { instanceId: INSTANCE_ID, fenceToken, since: SERVER_TS, expiresAtMs: now + TTL_SEC * 1000 };
  });
  return res.committed && res.snapshot.val()?.instanceId === INSTANCE_ID;
}
async function heartbeat() {
  const now = Date.now();
  const res = await db.ref(`${LOCK_PATH}/primary`).transaction((cur) => {
    if (!cur || cur.instanceId !== INSTANCE_ID) return;
    return { ...cur, expiresAtMs: now + TTL_SEC * 1000, heartbeat: SERVER_TS };
  });
  return res.committed && res.snapshot.val()?.instanceId === INSTANCE_ID;
}
async function countOverlap() {
  const snap = await db.ref(`${LOCK_PATH}/instances`).get();
  return snap.exists() ? Object.values(snap.val()).filter((x) => x.state && x.state !== 'exiting').length : 1;
}
async function flushAndRelease() {
  setReadonly(true); await registerInstance('readonly');
  log('INFO', process.env.RCLONE_ENABLE === 'true' ? 'flush: rclone service' : 'flush skipped: rclone disabled');
  log('INFO', process.env.LITESTREAM_ENABLE === 'true' ? 'flush: litestream checkpoint' : 'flush skipped: litestream disabled');
  await new Promise((r) => setTimeout(r, 3000));
  await db.ref(`${LOCK_PATH}/primary`).transaction((cur) => cur?.instanceId === INSTANCE_ID ? null : undefined);
  await registerInstance('exiting');
}
async function loop() {
  log('INFO', `start instance=${INSTANCE_ID} lock=${LOCK_PATH}`);
  await registerInstance('starting'); await registerInstance('ready-standby');
  const timer = setInterval(async () => {
    try {
      const elapsed = (Date.now() - JOB_START) / 1000;
      if (isPrimary && elapsed > 3600 - BUFFER_SEC) {
        clearInterval(timer); await flushAndRelease();
        if (AUTO_EXIT) process.exit(0);
        return setReadonly(true);
      }
      if (isPrimary) {
        if (!(await heartbeat())) { isPrimary = false; setReadonly(true); log('WARN', 'mat primary'); }
      } else {
        const overlap = await countOverlap();
        if (overlap > MAX_OVERLAP) log('WARN', `overlap=${overlap} > ${MAX_OVERLAP}`);
        if (await tryAcquire()) { isPrimary = true; setReadonly(false); await registerInstance('primary'); log('INFO', `PRIMARY fence=${fenceToken}`); }
        else setReadonly(true);
      }
    } catch (e) { log('ERROR', `loop loi, se thu lai: ${e.message}`); }
  }, HEARTBEAT_SEC * 1000);
}
process.on('SIGTERM', async () => { try { await flushAndRelease(); } catch (e) { log('ERROR', e.message); } process.exit(0); });
loop().catch((e) => { fatal(e.message); process.exit(1); });
