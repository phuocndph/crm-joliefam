// Controlled pre-058 clone rehearsal. Never creates, drops, or upgrades crm_local.
// Provenance: coordinator restored its validated pre-058 local dump into this
// exact clone. Revalidate that restore record before execution; name alone is
// not proof of backup provenance. This helper does not create/restore the clone.
// No .env is loaded; report contains metadata/digests, never business row values.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const root=fileURLToPath(new URL('../',import.meta.url));
const database='crm_local_qa_production_20261019_pre058';
const databaseUrl=process.env.LOCAL_UPGRADE_DATABASE_URL;
assert(databaseUrl,'Explicit LOCAL_UPGRADE_DATABASE_URL for the approved clone is required.');
const parsed=new URL(databaseUrl);
assert(['postgres:','postgresql:'].includes(parsed.protocol));
assert.equal(parsed.search,'','Connection query parameters are forbidden: pg permits host/port overrides.');
assert.equal(parsed.hash,'','Connection URL fragments are forbidden.');
assert(['127.0.0.1','localhost'].includes(parsed.hostname)&&parsed.port==='55432');
assert.equal(decodeURIComponent(parsed.pathname.slice(1)),database,'Only the exact approved pre-058 clone is permitted.');
assert(process.argv.includes('--run-approved-clone'),'Require --run-approved-clone after production diff is frozen.');
const ident=x=>'"'+String(x).replaceAll('"','""')+'"';
const pool=new pg.Pool({connectionString:databaseUrl,max:2});
const migration='058_local_production_workspace.sql';
const expectedNewTables=['local_production_product_inventory_maps','local_production_shipments','local_production_shipment_lines','local_production_repair_tickets'].map(x=>'public.'+x).sort();
const expectedColumns={
  'public.local_production_outputs':['production_batch_id','order_item_id','inventory_item_id','inventory_receipt_id','inventory_movement_id','created_by','valuation_status'],
  'public.local_assignments':['repair_ticket_id'],
  'public.local_production_job_publications':['repair_ticket_id'],
};
const reportPath=path.join(root,'.local-staging-runtime',`production-upgrade-${Date.now()}.json`);
let child,logs='',passed=false;
async function identity(){assert.equal((await pool.query('select current_database() database')).rows[0].database,database);}
async function tables(){return(await pool.query(`select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by n.nspname,c.relname`)).rows;}
async function columns(table){return(await pool.query('select column_name name,data_type,udt_name,is_nullable from information_schema.columns where table_schema=$1 and table_name=$2 order by ordinal_position',[table.schema,table.name])).rows;}
async function digest(table,kept){
  const actual=await columns(table),extra=actual.map(c=>c.name).filter(c=>!kept.includes(c));
  const expression='md5((to_jsonb(t)-$1::text[])::text)';
  const row=(await pool.query(`select count(*)::text count,md5(coalesce(string_agg(${expression},'' order by ${expression}),'')) row_hash from ${ident(table.schema)}.${ident(table.name)} t`,[extra])).rows[0];
  return {...row,columns:actual};
}
async function ledger(){return(await pool.query('select name,checksum,source,applied_at::text applied_at from local_schema_migrations order by name')).rows;}
async function sequences(){
  const rows=(await pool.query(`select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by n.nspname,c.relname`)).rows;
  const out={};for(const row of rows)out[`${row.schema}.${row.name}`]=(await pool.query(`select last_value::text last_value,is_called from ${ident(row.schema)}.${ident(row.name)}`)).rows[0];return out;
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  await identity();const baselineTables=await tables(),before={database,tables:{},sequences:await sequences(),ledger:await ledger()};
  assert(before.ledger.some(x=>x.name==='057_local_payroll_import_previews.sql'),'Expected exact pre-058 migration boundary.');
  assert(!before.ledger.some(x=>x.name===migration),'Clone already upgraded; restore a fresh approved clone before rehearsal.');
  assert(before.ledger.some(x=>x.name==='__seed.sql'),'Existing seed marker must be present and preserved.');
  for(const table of baselineTables){const cols=await columns(table);before.tables[`${table.schema}.${table.name}`]=await digest(table,cols.map(c=>c.name));}
  const temporary=createServer();temporary.listen(0,'127.0.0.1');await once(temporary,'listening');const port=temporary.address().port;await new Promise(r=>temporary.close(r));
  const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','COMSPEC'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(env,{NODE_ENV:'development',LOCAL_DATABASE_URL:databaseUrl,LOCAL_API_PORT:String(port),LOCAL_API_HOST:'127.0.0.1',LOCAL_SYNC_AUTO:'false',LOCAL_DEMO_AUTH:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false',LOCAL_INTEGRATION_API:'false',LOCAL_STORAGE_ROOT:path.join(root,'.local-staging-runtime','upgrade-rehearsal-storage')});
  child=spawn(process.execPath,['--import','tsx','--import','data:text/javascript,'+encodeURIComponent('globalThis.fetch=async()=>{throw new Error("Clone rehearsal blocks outbound fetch")};'),'server/index.ts'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',x=>{logs+=x;});child.stderr.on('data',x=>{logs+=x;});
  let health=null;for(let attempt=0;attempt<160;attempt++){
    if(child.exitCode!==null)throw new Error('Owned clone API exited before health (logs retained only in memory, not printed).');
    try{const response=await fetch(`http://127.0.0.1:${port}/health`);const value=await response.json();if(response.ok&&value.ok&&value.database===database){health=value;break;}}catch{}
    await wait(250);
  }
  assert(health,'Owned clone API did not pass health and exact database identity checks.');
  assert.equal(health.capabilities?.production_workspace,3);assert.equal(health.capabilities?.production_dispatch,3);
  await identity();const after={database,tables:{},sequences:await sequences(),ledger:await ledger()};
  const afterTables=await tables(),beforeNames=Object.keys(before.tables),afterNames=afterTables.map(t=>`${t.schema}.${t.name}`);
  assert.deepEqual(afterNames.filter(x=>!beforeNames.includes(x)).sort(),expectedNewTables,'Unexpected newly created tables.');
  assert.deepEqual(beforeNames.filter(x=>!afterNames.includes(x)),[],'An existing table disappeared.');
  for(const table of afterTables){
    const name=`${table.schema}.${table.name}`,old=before.tables[name],cols=await columns(table);
    after.tables[name]=await digest(table,old?old.columns.map(c=>c.name):cols.map(c=>c.name));
    if(!old){assert.equal(after.tables[name].count,'0',`New ${name} must start empty.`);continue;}
    const allowed=expectedColumns[name]||[],added=cols.filter(c=>!old.columns.some(o=>o.name===c.name));
    assert.deepEqual(added.map(c=>c.name).sort(),[...allowed].sort(),`Unexpected column additions in ${name}.`);
    assert.deepEqual(cols.filter(c=>old.columns.some(o=>o.name===c.name)),old.columns,`Old column contract changed in ${name}.`);
    if(name!=='public.local_schema_migrations'){
      assert.equal(after.tables[name].count,old.count,`Existing row count changed in ${name}.`);
      assert.equal(after.tables[name].row_hash,old.row_hash,`Existing column values changed in ${name}.`);
    }
    if(added.length){
      const checks=added.map(c=>c.name==='valuation_status'?`${ident(c.name)} is distinct from 'UNVALUED'`:`${ident(c.name)} is not null`).join(' or ');
      assert.equal((await pool.query(`select count(*)::text n from ${ident(table.schema)}.${ident(table.name)} where ${checks}`)).rows[0].n,'0',`New column backfilled unexpected values in ${name}.`);
    }
  }
  const addedLedger=after.ledger.filter(x=>!before.ledger.some(o=>o.name===x.name));assert.equal(addedLedger.length,1);assert.equal(addedLedger[0].name,migration);assert.equal(addedLedger[0].source,'APPLIED');
  const expectedChecksum=createHash('sha256').update(await readFile(path.join(root,'server','db','migrations',migration))).digest('hex');assert.equal(addedLedger[0].checksum,expectedChecksum);
  assert.deepEqual(after.ledger.filter(x=>x.name!==migration),before.ledger,'Historical checksums, timestamps or seed marker changed.');
  assert.deepEqual(after.sequences,before.sequences,'Existing sequences changed during additive upgrade.');
  const report={status:'PASS',database,verifiedAt:new Date().toISOString(),scope:'Exact existing-table old-column hashes, counts, columns, all non-system schemas, sequences and migration/seed ledger',baseline:before,after,health:{ok:health.ok,database:health.database,capabilities:health.capabilities??health.features??null},outboundFetch:'blocked',sync:'false',demo:'false'};
  await mkdir(path.dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2),{flag:'wx'});passed=true;
  console.log(`PASS clone upgrade: ${beforeNames.length} existing tables preserved; ${expectedNewTables.length} empty new tables; only058 ledger addition. Report: ${reportPath}`);
}finally{
  let childStopped=!child||child.exitCode!==null||child.signalCode!==null;
  if(child&&!childStopped){
    child.kill();await Promise.race([once(child,'exit'),wait(5000)]);
    childStopped=child.exitCode!==null||child.signalCode!==null;
  }
  await pool.end();
  if(!childStopped){
    console.error(`Owned API PID ${child.pid} has not confirmed exit; clone retained. Do not reuse the clone until this exact process is checked.`);
    process.exitCode=1;
  }else console.log(`Owned API exit confirmed; approved clone retained. Rehearsal ${passed?'passed':'did not pass'}; live crm_local was never a target.`);
}
