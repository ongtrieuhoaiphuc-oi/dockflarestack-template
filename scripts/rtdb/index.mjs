// rtdb/index.mjs - RTDB client dung firebase-admin (runTransaction atomic).
// KHONG tu che ETag REST (de quen header X-Firebase-ETag -> split-brain).
import admin from 'firebase-admin';
import { decodeJson } from '../lib/env.mjs';
import { makeLogger } from '../lib/logger.mjs';
const log = makeLogger('rtdb');

let app = null;

export function initRtdb() {
  if (app) return app;
  const url = process.env.RTDB_URL;
  const saRaw = process.env.RTDB_SERVICE_ACCOUNT;
  if (!url || !saRaw) throw new Error('Thieu RTDB_URL hoac RTDB_SERVICE_ACCOUNT');
  const sa = decodeJson(saRaw, { name: 'RTDB_SERVICE_ACCOUNT' });
  app = admin.initializeApp({
    credential: admin.credential.cert(sa),
    databaseURL: url,
  });
  log.info('RTDB initialized');
  return app;
}

export function db() {
  initRtdb();
  return admin.database();
}

// Server timestamp sentinel (KHONG dung Date.now() client).
export const SERVER_TS = admin.database.ServerValue.TIMESTAMP;

// Atomic transaction tren 1 path. updateFn: (current) => next | undefined(abort).
export async function transaction(path, updateFn) {
  const ref = db().ref(path);
  const res = await ref.transaction(updateFn);
  return { committed: res.committed, snapshot: res.snapshot ? res.snapshot.val() : null };
}

export async function get(path) {
  const snap = await db().ref(path).get();
  return snap.exists() ? snap.val() : null;
}

export async function set(path, value) {
  await db().ref(path).set(value);
}

export async function update(path, value) {
  await db().ref(path).update(value);
}
