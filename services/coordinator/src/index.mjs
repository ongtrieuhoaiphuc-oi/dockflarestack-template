// coordinator - lifecycle handover tren RTDB.
// Nguyen tac: 1 primary duy nhat, con song thi read-only, handover truoc deadline.
// Atomic bang firebase-admin runTransaction. Server timestamp. Fence token.
import admin from 'firebase-admin';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const LOCK_PATH = process.env.COORDINATOR_LOCK_PATH || '/stack/default/coordinator';
const HEARTBEAT_SEC = Number(process.env.COORDINATOR_HEARTBEAT_SEC || 15);
const TTL_SEC = Number(process.env.COORDINATOR_SESSION_TTL_SEC || 60);
const BUFFER_SEC = Number(process.env.COORDINATOR_HANDOVER_BUFFER_SEC || 600);
const AUTO_EXIT = ['1', 'true', 'yes'].includes(String(process.env.COORDINATOR_OLD_AUTO_EXIT).toLowerCase());
const MAX_OVERLAP = Number(process.env.COORDINATOR_MAX_OVERLAP || 2);
const READONLY_FLAG = process.env.COORDINATOR_READONLY_FLAG_PATH || '/data/.readonly';
const INSTANCE_ID = process.env.HOSTNAME || randomUUID().slice(0, 8);
const JOB_START = Date.now();

function log(level, msg) { console.log(`[${new Date().toISOString()}] [${level}] [coordinator] ${msg}`); }

function initDb() {
  const sa = JSON.parse(
    process.env.RTDB_SERVICE_ACCOUNT.startsWith('base64:')
      ? Buffer.from(process.env.RTDB_SERVICE_ACCOUNT.slice(7), 'base64').toString('utf8')
      : process.env.RTDB_SERVICE_ACCOUNT
  );
  admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: process.env.RTDB_URL });
  return admin.database();
}

const db = initDb();
const SERVER_TS = admin.database.ServerValue.TIMESTAMP;
let isPrimary = false;
let fenceToken = 0;

function setReadonly(on) {
  try {
    if (on) { writeFileSync(READONLY_FLAG, `readonly since ${new Date().toISOString()}\n`); log('INFO', `READ-ONLY ON (${READONLY_FLAG})`); }
    else if (existsSync(READONLY_FLAG)) { unlinkSync(READONLY_FLAG); log('INFO', 'READ-ONLY OFF'); }
  } catch (e) { log('WARN', `readonly flag loi: ${e.message}`); }
}

// Gianh primary bang transaction atomic.
async function tryAcquire() {
  const ref = db.ref(`${LOCK_PATH}/primary`);
  const now = Date.now();
  const res = await ref.transaction((cur) => {
    if (cur && cur.expiresAtMs && cur.expiresAtMs > now && cur.instanceId !== INSTANCE_ID) {
      return; // abort: primary khac con song
    }
    const nextFence = (cur && cur.fenceToken ? cur.fenceToken : 0) + 1;
    fenceToken = nextFence;
    return { instanceId: INSTANCE_ID, fenceToken: nextFence, since: SERVER_TS, expiresAtMs: now + TTL_SEC * 1000 };
  });
  return res.committed && res.snapshot.val() && res.snapshot.val().instanceId === INSTANCE_ID;
}

async function heartbeat() {
  const ref = db.ref(`${LOCK_PATH}/primary`);
  const now = Date.now();
  const res = await ref.transaction((cur) => {
    if (!cur || cur.instanceId !== INSTANCE_ID) return; // mat quyen
    return { ...cur, expiresAtMs: now + TTL_SEC * 1000, heartbeat: SERVER_TS };
  });
  return res.committed && res.snapshot.val() && res.snapshot.val().instanceId === INSTANCE_ID;
}

async function registerInstance(state) {
  await db.ref(`${LOCK_PATH}/instances/${INSTANCE_ID}`).update({ state, heartbeat: SERVER_TS });
}

async function countOverlap() {
  const snap = await db.ref(`${LOCK_PATH}/instances`).get();
  if (!snap.exists()) return 1;
  const now = Date.now();
  return Object.values(snap.val()).filter((i) => i.state && i.state !== 'exiting').length || 1;
}

async function flushAndRelease() {
  log('INFO', 'chuyen READ-ONLY + flush truoc khi nha lock');
  setReadonly(true);
  await registerInstance('readonly');
  // Flush guard: chi flush module dang bat (rclone push / litestream checkpoint
  // do container rieng lo; o day chi phat tin hieu + cho).
  if (['1', 'true', 'yes'].includes(String(process.env.RCLONE_ENABLE).toLowerCase())) log('INFO', 'flush: rclone push (do service rclone thuc hien)');
  else log('INFO', 'flush skipped: rclone disabled');
  if (['1', 'true', 'yes'].includes(String(process.env.LITESTREAM_ENABLE).toLowerCase())) log('INFO', 'flush: litestream checkpoint');
  else log('INFO', 'flush skipped: litestream disabled');
  await new Promise((r) => setTimeout(r, 3000));
  await db.ref(`${LOCK_PATH}/primary`).transaction((cur) => (cur && cur.instanceId === INSTANCE_ID ? null : undefined));
  await registerInstance('exiting');
  log('INFO', 'da nha lock');
}

async function loop() {
  log('INFO', `khoi dong instance=${INSTANCE_ID} lock=${LOCK_PATH} ttl=${TTL_SEC}s buffer=${BUFFER_SEC}s`);
  await registerInstance('starting');
  // Standby: cho tro thanh primary.
  await registerInstance('ready-standby');

  const timer = setInterval(async () => {
    try {
      const elapsed = (Date.now() - JOB_START) / 1000;
      // Watcher deadline: gan het gio -> chu dong nha de instance moi len.
      if (isPrimary && elapsed > (60 * 60 - BUFFER_SEC)) {
        log('WARN', `gan deadline (${Math.round(elapsed)}s) -> bat dau handover`);
        clearInterval(timer);
        await flushAndRelease();
        if (AUTO_EXIT) { log('INFO', 'AUTO_EXIT=true -> thoat'); process.exit(0); }
        setReadonly(true);
        return;
      }
      if (isPrimary) {
        const ok = await heartbeat();
        if (!ok) { isPrimary = false; setReadonly(true); log('WARN', 'mat quyen primary -> read-only'); }
        else log('DEBUG', `heartbeat OK fence=${fenceToken}`);
      } else {
        const overlap = await countOverlap();
        if (overlap > MAX_OVERLAP) log('WARN', `overlap=${overlap} > MAX_OVERLAP=${MAX_OVERLAP} (node co the tich tu)`);
        const got = await tryAcquire();
        if (got) {
          isPrimary = true;
          setReadonly(false);
          await registerInstance('primary');
          log('INFO', `TRO THANH PRIMARY (fence=${fenceToken})`);
        } else {
          log('DEBUG', 'chua gianh duoc primary, van standby (read-only)');
          setReadonly(true);
        }
      }
    } catch (e) { log('ERROR', `loop loi: ${e.message}`); }
  }, HEARTBEAT_SEC * 1000);
}

process.on('SIGTERM', async () => { log('INFO', 'SIGTERM -> flush + release'); try { await flushAndRelease(); } catch {} process.exit(0); });
loop().catch((e) => { log('ERROR', e.message); process.exit(1); });
