// smoke.mjs - smoke test khong can secret that. Chay trong CI + local.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { decodeMarker, decodeJson, bool } from '../scripts/lib/env.mjs';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(` ✓ ${name}`); pass++; }
  catch (e) { console.error(` ✗ ${name}: ${e.message}`); fail++; }
}
const DOM = 'DOMAIN=smoke.example.com\n';
const CF = 'DOCKFLARE_CF_API_TOKEN=dummy-token\nDOCKFLARE_CF_ACCOUNT_ID=dummy-account\nDOCKFLARE_CF_ZONE_ID=dummy-zone\n';

test('base64 marker decode', () => assert.equal(decodeMarker('base64:' + Buffer.from('hello').toString('base64')), 'hello'));
test('raw token khong decode nham', () => assert.equal(decodeMarker('YWJjZA=='), 'YWJjZA=='));
test('decodeJson', () => {
  const obj = { type: 'service_account', project_id: 'x' };
  assert.deepEqual(decodeJson('base64:' + Buffer.from(JSON.stringify(obj)).toString('base64'), { name: 'SA' }), obj);
});
test('bool', () => { assert.equal(bool('true'), true); assert.equal(bool('false'), false); });

test('readonly guard', async () => {
  const dir = '.smoke-vol'; mkdirSync(dir, { recursive: true });
  process.env.COORDINATOR_READONLY_FLAG_PATH = `${dir}/.readonly`; writeFileSync(`${dir}/.readonly`, 'ro');
  const { assertWritable } = await import('../scripts/lib/readonly-guard.mjs?' + Date.now());
  assert.throws(() => assertWritable()); rmSync(dir, { recursive: true, force: true });
});

function runBootstrap(envContent, expectFail = false) {
  // Cac test bootstrap offline luon cap credential da resolve san. Resolver phai skip API.
  writeFileSync('.env.smoke', envContent + CF);
  try {
    const out = execFileSync('node', ['scripts/bootstrap.mjs'], {
      env: { ...process.env, BOOTSTRAP_ENV_FILE: '.env.smoke', LOG_LEVEL: 'info' }, encoding: 'utf8',
    });
    if (expectFail) throw new Error('mong doi exit non-zero nhung lai thanh cong');
    return out;
  } catch (e) {
    if (expectFail) return `${e.stdout || ''}${e.stderr || ''}${e.message || ''}`;
    throw e;
  }
}

test('core-only + credential configured thi khong resolve', () => {
  runBootstrap('STACK_ID=smoke\n' + DOM + 'DOCKER_VOLUMES_DIR=.docker-volumes\nDOCKFLARE_TUNNEL_NAME=${STACK_ID}\n');
  const r = readFileSync('.env.resolved', 'utf8');
  assert.match(r, /COMPOSE_PROFILES=core/);
  assert.match(r, /DOCKFLARE_CF_API_TOKEN=dummy-token/);
  assert.match(r, /DOCKFLARE_CF_ACCOUNT_ID=dummy-account/);
  assert.match(r, /DOCKFLARE_CF_ZONE_ID=dummy-zone/);
  assert.match(r, /DOCKFLARE_TUNNEL_NAME=smoke/);
});
test('expand hostname', () => {
  runBootstrap('STACK_ID=smoke\n' + DOM + 'DOZZLE_SUBDOMAIN=logs\nDOZZLE_HOSTNAME=${DOZZLE_SUBDOMAIN}.${DOMAIN}\n');
  assert.match(readFileSync('.env.resolved', 'utf8'), /DOZZLE_HOSTNAME=logs\.smoke\.example\.com/);
});
test('DOMAIN CHANGE_ME fail', () => assert.match(runBootstrap('STACK_ID=smoke\nDOMAIN=CHANGE_ME.example.com\n', true), /DOMAIN/));
test('STACK_ID shared fail', () => assert.match(runBootstrap('STACK_ID=CHANGE_ME\n' + DOM + 'COORDINATOR_ENABLE=true\n', true), /STACK_ID/));
test('redis coupling', () => {
  runBootstrap('STACK_ID=smoke\n' + DOM + 'COORDINATOR_ENABLE=true\nDOCKFLARE_REDIS_ENABLE=false\n');
  assert.match(readFileSync('.env.resolved', 'utf8'), /DOCKFLARE_REDIS_ENABLE=true/);
});
test('derive RCLONE_EXCLUDE', () => {
  runBootstrap('STACK_ID=smoke\n' + DOM + 'RCLONE_ENABLE=true\nLITESTREAM_ENABLE=true\nLITESTREAM_DB_PATH=.docker-volumes/mydb.sqlite\n');
  assert.match(readFileSync('.env.resolved', 'utf8'), /RCLONE_EXCLUDE=\*\*\/mydb\.sqlite,\*\*\/mydb\.sqlite-wal,\*\*\/mydb\.sqlite-shm/);
});
test('ttyd fail closed', () => assert.match(runBootstrap('STACK_ID=smoke\n' + DOM + 'TTYD_ENABLE=true\n', true), /TTYD_CREDENTIAL/));
test('filebrowser fail closed', () => assert.match(runBootstrap('STACK_ID=smoke\n' + DOM + 'FILEBROWSER_ENABLE=true\n', true), /FILEBROWSER_ADMIN_PASSWORD/));
test('security modules pass', () => {
  runBootstrap('STACK_ID=smoke\n' + DOM + 'TTYD_ENABLE=true\nTTYD_CREDENTIAL=admin:secret\nDOZZLE_ENABLE=true\nDOZZLE_PASSWORD=pw\n');
  assert.match(readFileSync('.env.resolved', 'utf8'), /COMPOSE_PROFILES=core,dozzle,ttyd/);
});

for (const f of ['.env.smoke', '.env.resolved']) if (existsSync(f)) rmSync(f);
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
