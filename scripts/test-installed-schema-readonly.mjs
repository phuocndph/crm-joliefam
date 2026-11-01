// Focused startup verification with an in-memory query adapter; no DB or env files.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {verifyInstalledSchema} from '../server/db/installed-schema.ts';
import {item5aHistoricalLedgerManifest} from '../server/db/item5a-ledger-manifest.ts';
import {readRuntimeConfig} from '../server/runtime.ts';

const directory=path.resolve('server/db/migrations');
const files=(await readdir(directory)).filter(name=>/^\d{3}_.+\.sql$/.test(name)).sort();
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const rows=await Promise.all(files.map(async name=>({name,checksum:hash(await readFile(path.join(directory,name))),source:'APPLIED'})));
const seed={...item5aHistoricalLedgerManifest.adoptedSeed};
const base=rows.filter(row=>![75,76].includes(Number(row.name.slice(0,3)))).concat(seed);
const identity={database:'crm_local',database_user:'crm_local',database_owner:'crm_local',timezone:'Asia/Ho_Chi_Minh',server_version_num:'160004',is_in_recovery:false};
async function verify(ledger=base,changes={}){
 const queries=[];let released=false,connected=false;
 const adapter={connect:async()=>{connected=true;return {query:async sql=>{
  queries.push(sql);assert.match(sql,/^(begin isolation level repeatable read read only|select\b|commit$|rollback$)/i,'Only read-only transaction and SELECT permitted');
  if(sql.includes('current_database()'))return {rows:[{...identity,...changes}]};
  if(sql.includes('local_schema_migrations'))return {rows:ledger.map(row=>({...row}))};
  return {rows:[]};
 },release:()=>{released=true;}};}};
 try{return {result:await verifyInstalledSchema(adapter),queries};}finally{if(connected)assert.equal(released,true);}
}
let count=0;
const check=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};
await check('installed078 with optional075076 absent passes read-only',async()=>{const v=await verify();assert.equal(v.result.mode,'INSTALLED_VERIFIED');assert.equal(v.result.writes,0);assert.equal(v.queries[0],'begin isolation level repeatable read read only');assert.equal(v.queries.at(-1),'commit');});
await check('missing078 fails without applying migrations',async()=>{await assert.rejects(()=>verify(base.filter(row=>!row.name.startsWith('078_'))),/chưa được cài/);});
await check('checksum mismatch078 fails read-only',async()=>{await assert.rejects(()=>verify(base.map(row=>row.name.startsWith('078_')?{...row,checksum:'0'.repeat(64)}:row)),/Checksum/);});
await check('installed optional migrations must match source bytes',async()=>{const optional=rows.filter(row=>[75,76].includes(Number(row.name.slice(0,3))));assert.equal(optional.length,2);assert.equal((await verify(base.concat(optional))).result.writes,0);await assert.rejects(()=>verify(base.concat(optional.map((row,i)=>i?row:{...row,checksum:'f'.repeat(64)}))),/Checksum/);});
await check('unknown ledger, duplicate, invalid source and missing seed fail',async()=>{for(const bad of[base.concat({name:'999_untrusted.sql',checksum:'a'.repeat(64),source:'APPLIED'}),base.concat(base[0]),base.map((row,i)=>i?row:{...row,source:'UNTRUSTED'}),base.filter(row=>row.name!=='__seed.sql')])await assert.rejects(()=>verify(bad));});
await check('database identity and timezone are enforced',async()=>{for(const change of[{database:'foreign'},{database_user:'foreign'},{database_owner:'foreign'},{timezone:'UTC'},{server_version_num:'150000'},{is_in_recovery:true}])await assert.rejects(()=>verify(base,change),/Danh tính/);});
await check('serve-installed requires integration switches disabled',async()=>{const env={LOCAL_DB_STARTUP_MODE:'serve-installed',LOCAL_SYNC_AUTO:'false',LOCAL_INTEGRATION_API:'false',LOCAL_ZCRM_API:'false'};assert.equal(readRuntimeConfig(env).startupMode,'serve-installed');for(const flag of['LOCAL_SYNC_AUTO','LOCAL_INTEGRATION_API','LOCAL_ZCRM_API'])assert.throws(()=>readRuntimeConfig({...env,[flag]:'true'}));});
console.log(JSON.stringify({passed:count,failed:0,database_connections:0,source_business_writes:0}));
