// smoke.mjs - smoke test khong can secret that. Chay trong CI + local.
// Kiem: base64 marker, readonly-guard, bootstrap (profiles, hard-block, exclude, fail-closed).
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { decodeMarker, decodeJson, bool } from '../scripts/lib/env.mjs';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  \u2713 ${name}`); pass++; }
  catch (e) { console.error(`  \u2717 ${name}: ${e.message}`); fail++; }
}
function section(t) { console.log(`\n== ${t} ==`); }

// ---- 1. base64 marker ----
section('base64 marker');
test('co prefix base64: -> decode', () => {
  assert.equal(decodeMarker('base64:' + Buffer.from('hello').toString('base64')), 'hello');
});
test('khong prefix -> RAW nguyen', () => {
  assert.equal(decodeMarker('ghp_abc123DEF'), 'ghp_abc123DEF');
});
test('token thuan (vo tinh hop le base64) KHONG bi decode nham', () => {
  // 'YWJjZA==' la base64 hop le nhung khong co prefix -> phai giu nguyen
  assert.equal(decodeMarker('YWJjZA=='), 'YWJjZA==');
});
test('decodeJson parse duoc service account gia', () => {
  const obj = { type: 'service_account', project_id: 'x' };
  const b64 = 'base64:' + Buffer.from(JSON.stringify(obj)).toString('base64');
  assert.deepEqual(decodeJson(b64, { name: 'SA' }), obj);
});
test('bool parse dung', () => {
  assert.equal(bool('true'), true);
  assert.equal(bool('false'), false);
  assert.equal(bool('', true), true);
});

// ---- 2. readonly-guard ----
section('readonly-guard');
test('assertWritable nem loi khi co file .readonly', async () => {
  const dir = '.smoke-vol';
  mkdirSync(dir, { recursive: true });
  process.env.COORDINATOR_READONLY_FLAG_PATH = `${dir}/.readonly`;
  writeFileSync(`${dir}/.readonly`, 'ro');
  const { assertWritable, isReadonly } = await import('../scripts/lib/readonly-guard.mjs?' + Date.now());
  assert.equal(isReadonly(), true);
  assert.throws(() => assertWritable());
  rmSync(dir, { recursive: true, force: true });
});

// ---- 3. bootstrap ----
section('bootstrap');
function runBootstrap(envContent, expectFail = false) {
  writeFileSync('.env.smoke', envContent);
  try {
    const out = execFileSync('node', ['scripts/bootstrap.mjs'], {
      env: { ...process.env, BOOTSTRAP_ENV_FILE: '.env.smoke', LOG_LEVEL: 'info' },
      encoding: 'utf8',
    });
    if (expectFail) throw new Error('mong doi exit non-zero nhung lai thanh cong');
    return out;
  } catch (e) {
    if (expectFail) return `${e.stdout || ''}${e.stderr || ''}${e.message || ''}`;
    throw e;
  }
}

test('core-only: COMPOSE_PROFILES=core', () => {
  runBootstrap('STACK_ID=smoke\nDOCKER_VOLUMES_DIR=.docker-volumes\nDOCKFLARE_TUNNEL_NAME=${STACK_ID}\n');
  const resolved = readFileSync('.env.resolved', 'utf8');
  assert.match(resolved, /COMPOSE_PROFILES=core/);
});
test('expand ${VAR}: TUNNEL_NAME = STACK_ID (khong con literal)', () => {
  const resolved = readFileSync('.env.resolved', 'utf8');
  assert.match(resolved, /DOCKFLARE_TUNNEL_NAME=smoke/);
  assert.doesNotMatch(resolved, /DOCKFLARE_TUNNEL_NAME=\$\{STACK_ID\}/);
});
test('hard-block: STACK_ID=CHANGE_ME + coordinator -> fail', () => {
  const out = runBootstrap('STACK_ID=CHANGE_ME\nCOORDINATOR_ENABLE=true\nRTDB_URL=x\nRTDB_SERVICE_ACCOUNT=x\n', true);
  assert.match(out, /STACK_ID/);
});
test('redis coupling: coordinator=true -> redis auto on', () => {
  runBootstrap('STACK_ID=smoke\nCOORDINATOR_ENABLE=true\nDOCKFLARE_REDIS_ENABLE=false\nRTDB_URL=x\nRTDB_SERVICE_ACCOUNT=x\nCOORDINATOR_READONLY_FLAG_PATH=.docker-volumes/.readonly\n');
  const resolved = readFileSync('.env.resolved', 'utf8');
  assert.match(resolved, /DOCKFLARE_REDIS_ENABLE=true/);
  assert.match(resolved, /COMPOSE_PROFILES=core,coordinator/);
});
test('derive RCLONE_EXCLUDE tu LITESTREAM_DB_PATH', () => {
  runBootstrap('STACK_ID=smoke\nDOCKER_VOLUMES_DIR=.docker-volumes\nRCLONE_ENABLE=true\nLITESTREAM_ENABLE=true\nLITESTREAM_DB_PATH=${DOCKER_VOLUMES_DIR}/mydb.sqlite\nRCLONE_REMOTE=r\nRCLONE_PATH=p\n');
  const resolved = readFileSync('.env.resolved', 'utf8');
  assert.match(resolved, /RCLONE_EXCLUDE=\*\*\/mydb\.sqlite,\*\*\/mydb\.sqlite-wal,\*\*\/mydb\.sqlite-shm/);
});
test('fail-closed: ttyd enable + credential rong -> fail', () => {
  const out = runBootstrap('STACK_ID=smoke\nTTYD_ENABLE=true\nTTYD_CREDENTIAL=\n', true);
  assert.match(out, /TTYD_CREDENTIAL/);
});
test('fail-closed: filebrowser enable + password rong -> fail', () => {
  const out = runBootstrap('STACK_ID=smoke\nFILEBROWSER_ENABLE=true\nFILEBROWSER_ADMIN_PASSWORD=\n', true);
  assert.match(out, /FILEBROWSER_ADMIN_PASSWORD/);
});
test('module bao mat du credential -> pass + profile dung', () => {
  runBootstrap('STACK_ID=smoke\nTTYD_ENABLE=true\nTTYD_CREDENTIAL=admin:secret\nDOZZLE_ENABLE=true\nDOZZLE_AUTH_PROVIDER=simple\nDOZZLE_PASSWORD=pw\n');
  const resolved = readFileSync('.env.resolved', 'utf8');
  assert.match(resolved, /COMPOSE_PROFILES=core,dozzle,ttyd/);
});

// cleanup
for (const f of ['.env.smoke', '.env.resolved']) if (existsSync(f)) rmSync(f);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
