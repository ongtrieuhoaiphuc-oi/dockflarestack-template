#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve as resolvePath } from 'node:path';
import dotenv from 'dotenv';
import { makeLogger } from './lib/logger.mjs';
import { bool } from './lib/env.mjs';
import { resolveCloudflareCredentials } from './resolve/index.mjs';
import { mintAuthKey } from '../services/tailscale/adapter.mjs';
const log=makeLogger('bootstrap');
const IN=process.env.BOOTSTRAP_ENV_FILE||'.env', OUT='.env.resolved';
function die(m){log.error(m);process.exit(1);}
function cleanDomain(v){
  let s=String(v||'').trim();
  const md=s.match(/^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/i);
  if(md){try{s=new URL(md[1]).hostname;}catch{}}
  s=s.replace(/^https?:\/\//i,'').replace(/\/$/,'');
  if(!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(s)) die(`DOMAIN khong phai hostname DNS thuan: ${s}. Khong dan Markdown/link, chi dien vd example.com`);
  return s.toLowerCase();
}
function expand(map){
  const re=/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  const one=(v,seen)=>String(v).replace(re,(m,k)=>seen.has(k)?m:one(map[k]??process.env[k]??'',new Set([...seen,k])));
  return Object.fromEntries(Object.entries(map).map(([k,v])=>[k,one(v,new Set([k]))]));
}
let raw;try{raw=dotenv.parse(readFileSync(IN,'utf8'));}catch(e){die(e.message);}
raw.DOMAIN=cleanDomain(raw.DOMAIN);
let p=expand(raw);
const E=(k,d='')=>String(p[k]??d), B=(k,d=false)=>bool(p[k],d);
if(!E('STACK_ID')||E('STACK_ID')==='CHANGE_ME')die('STACK_ID rong/CHANGE_ME');
// Chuan hoa bind path thanh absolute de pre-init va Compose luon dung cung mot noi.
p.DOCKER_VOLUMES_DIR=resolvePath(E('DOCKER_VOLUMES_DIR','.docker-volumes'));
for(const k of ['DOCKFLARE_HOSTNAME','DOZZLE_HOSTNAME','FILEBROWSER_HOSTNAME','TTYD_HOSTNAME']){
  if(E(k)&&!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(E(k)))die(`${k} khong hop le: ${E(k)}`);
}
try{Object.assign(p,await resolveCloudflareCredentials(p));}catch(e){die(e.message);}
const need=(mod,ks)=>{const m=ks.filter(k=>!E(k).trim());if(m.length)die(`${mod} thieu ${m.join(', ')}`);};
if(B('COORDINATOR_ENABLE')){need('COORDINATOR',['RTDB_URL','RTDB_SERVICE_ACCOUNT']);p.DOCKFLARE_REDIS_ENABLE='true';p.COORDINATOR_CONTAINER_READONLY_FLAG_PATH='/data/.readonly';}
if(B('RCLONE_ENABLE')){need('RCLONE',['RCLONE_REMOTE','RCLONE_PATH']);if(!E('RCLONE_CONFIG_PATH')&&!E('RCLONE_CONFIG_CONTENT'))die('RCLONE thieu config path/content');}
if(B('LITESTREAM_ENABLE')){need('LITESTREAM',['LITESTREAM_DB_PATH','LITESTREAM_S3_ENDPOINT','LITESTREAM_S3_BUCKET','LITESTREAM_S3_ACCESS_KEY_ID','LITESTREAM_S3_SECRET_ACCESS_KEY']);p.LITESTREAM_CONTAINER_DB_PATH=`/data/${basename(E('LITESTREAM_DB_PATH'))}`;}
if(B('TAILSCALE_ENABLE')&&!E('TS_AUTHKEY')){need('TAILSCALE',['TAILSCALE_CLIENT_ID','TAILSCALE_CLIENT_SECRET','TAILSCALE_TAGS']);try{p.TS_AUTHKEY=await mintAuthKey({clientId:E('TAILSCALE_CLIENT_ID'),clientSecret:E('TAILSCALE_CLIENT_SECRET'),tags:E('TAILSCALE_TAGS'),ephemeral:B('TAILSCALE_EPHEMERAL',true)});}catch(e){die(e.message);}}
if(B('TTYD_ENABLE'))need('TTYD',['TTYD_CREDENTIAL']);
if(B('DOZZLE_ENABLE')&&E('DOZZLE_AUTH_PROVIDER','simple')==='simple')need('DOZZLE',['DOZZLE_PASSWORD']);
if(B('FILEBROWSER_ENABLE'))need('FILEBROWSER',['FILEBROWSER_ADMIN_PASSWORD']);
if(B('RCLONE_ENABLE')&&B('LITESTREAM_ENABLE')){const d=basename(E('LITESTREAM_DB_PATH'));p.RCLONE_EXCLUDE=[d,`${d}-wal`,`${d}-shm`].map(x=>`**/${x}`).join(',');}
const pm={COORDINATOR_ENABLE:'coordinator',RCLONE_ENABLE:'rclone',LITESTREAM_ENABLE:'litestream',TAILSCALE_ENABLE:'tailscale',DOZZLE_ENABLE:'dozzle',FILEBROWSER_ENABLE:'filebrowser',TTYD_ENABLE:'ttyd'};
p.COMPOSE_PROFILES=['core',...Object.entries(pm).filter(([k])=>B(k)).map(([,v])=>v)].join(',');
writeFileSync(OUT,Object.entries(p).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
log.info(`bootstrap OK domain=${p.DOMAIN} profiles=${p.COMPOSE_PROFILES}`);
