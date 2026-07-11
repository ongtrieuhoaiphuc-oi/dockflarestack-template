// readonly-guard.mjs - CONTRACT read-only (OPT-IN) cho app noi bo.
// App muon ton trong read-only PHAI import va goi assertWritable() truoc moi lan ghi.
// Coordinator ghi file COORDINATOR_READONLY_FLAG_PATH khi instance chuyen read-only.
import { existsSync } from 'node:fs';

const FLAG = process.env.COORDINATOR_READONLY_FLAG_PATH
  || `${process.env.DOCKER_VOLUMES_DIR || '.docker-volumes'}/.readonly`;

export function isReadonly() {
  return existsSync(FLAG);
}

// Nem loi neu dang read-only. Goi truoc moi thao tac ghi.
export function assertWritable() {
  if (isReadonly()) {
    throw new Error(`Instance dang READ-ONLY (co file ${FLAG}). Tu choi ghi.`);
  }
}

// Wrapper tien loi: chi chay fn khi writable, nguoc lai bo qua + log.
export function ifWritable(fn) {
  if (isReadonly()) return { skipped: true };
  return { skipped: false, result: fn() };
}
