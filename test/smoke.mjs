// smoke.mjs - smoke test offline, khong can secret that.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { decodeMarker, decodeJson, bool } from '../scripts/lib/env.mjs';
let pass=0, fail=0;
function test(name, fn){try{fn();console.log(` ✓ ${name}`);pass++;}catch(e){console.error(` ✗ ${name}: ${e.message}`);fail++;}}
const DOM='DOMAIN=smoke.example.com\n';
const CF='DOCKFLARE_CF_API_TOKEN=dummy-token\nDOCKFLARE_CF_ACCOUNT_ID=dummy-account\nDOCKFLARE_CF_ZONE_ID=dummy-zone\n';
test('base64 marker',()=>assert.equal(decodeMarker('base64:'+Buffer.from('hello').toString('base64')),'hello'));
test('raw token',()=>assert.equal(decodeMarker('YWJjZA=='),'YWJjZA=='));
test('decodeJson',()=>{const x={type:'service_account'};assert.deepEqual(decodeJson('base64:'+Buffer.from(JSON.stringify(x)).toString('base64'),{name:'SA'}),x);});
test('bool',()=>{assert.equal(bool('true'),true);assert.equal(bool('false'),false);});
test('readonly',async()=>{mkdirSync('.smoke-vol',{recursive:true});process.env.COORDINATOR_READONLY_FLAG_PATH='.smoke-vol/.readonly';writeFileSync('.smoke-vol/.readonly','ro');const {assertWritable}=await import('../scripts/lib/readonly-guard.mjs?'+Date.now());assert.throws(()=>assertWritable());rmSync('.smoke-vol',{recursive:true,force:true});});
function run(env, expectFail=false){writeFileSync('.env.smoke',env+CF);try{const out=execFileSync('node',['scripts/bootstrap.mjs'],{env:{...process.env,BOOTSTRAP_ENV_FILE:'.env.smoke'},encoding:'utf8'});if(expectFail)throw Error('expected failure');return out;}catch(e){if(expectFail)return `${e.stdout||''}${e.stderr||''}${e.message||''}`;throw e;}}
test('core skip resolve',()=>{run('STACK_ID=smoke\n'+DOM+'DOCKFLARE_TUNNEL_NAME=${STACK_ID}\n');const r=readFileSync('.env.resolved','utf8');assert.match(r,/COMPOSE_PROFILES=core/);assert.match(r,/DOCKFLARE_TUNNEL_NAME=smoke/);});
test('hostname expand',()=>{run('STACK_ID=smoke\n'+DOM+'DOZZLE_SUBDOMAIN=logs\nDOZZLE_HOSTNAME=${DOZZLE_SUBDOMAIN}.${DOMAIN}\n');assert.match(readFileSync('.env.resolved','utf8'),/logs\.smoke\.example\.com/);});
test('domain fail',()=>assert.match(run('STACK_ID=smoke\nDOMAIN=CHANGE_ME\n',true),/DOMAIN/));
test('stack fail',()=>assert.match(run('STACK_ID=CHANGE_ME\n'+DOM,true),/STACK_ID/));
test('redis coupling',()=>{run('STACK_ID=smoke\n'+DOM+'COORDINATOR_ENABLE=true\nRTDB_URL=https://x.firebaseio.com\nRTDB_SERVICE_ACCOUNT={}\n');assert.match(readFileSync('.env.resolved','utf8'),/DOCKFLARE_REDIS_ENABLE=true/);});
test('rclone exclude',()=>{run('STACK_ID=smoke\n'+DOM+'RCLONE_ENABLE=true\nRCLONE_REMOTE=r\nRCLONE_PATH=p\nRCLONE_CONFIG_CONTENT=dummy\nLITESTREAM_ENABLE=true\nLITESTREAM_DB_PATH=.docker-volumes/a.db\nLITESTREAM_S3_ENDPOINT=x\nLITESTREAM_S3_BUCKET=b\nLITESTREAM_S3_ACCESS_KEY_ID=k\nLITESTREAM_S3_SECRET_ACCESS_KEY=s\n');assert.match(readFileSync('.env.resolved','utf8'),/RCLONE_EXCLUDE=\*\*\/a\.db/);});
test('ttyd fail closed',()=>assert.match(run('STACK_ID=smoke\n'+DOM+'TTYD_ENABLE=true\n',true),/TTYD_CREDENTIAL/));
test('security pass',()=>{run('STACK_ID=smoke\n'+DOM+'TTYD_ENABLE=true\nTTYD_CREDENTIAL=a:b\nDOZZLE_ENABLE=true\nDOZZLE_PASSWORD=pw\n');assert.match(readFileSync('.env.resolved','utf8'),/core,dozzle,ttyd/);});
for(const f of ['.env.smoke','.env.resolved'])if(existsSync(f))rmSync(f);
console.log(`\n${pass} pass, ${fail} fail`);process.exit(fail?1:0);
