// Coordinator-only controlled 059 rehearsal / READ ONLY live verification.
// Never creates/drops/restores databases, loads .env, or prints business rows.
// Read this whole helper and validate backup/clone provenance before execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const root=fileURLToPath(new URL('../',import.meta.url)),runtime=path.join(root,'.local-staging-runtime');
const clone='crm_local_qa_production_20261019_pre058',migration='059_local_production_reference_images.sql',previousMigration='058_local_production_workspace.sql';
const args=process.argv.slice(2),mode=args.filter(x=>['--rehearse','--before','--after059'].includes(x));
assert.equal(mode.length,1,'Select exactly one mode: --rehearse / --before / --after059.');
const rehearsal=mode[0]==='--rehearse',after=mode[0]==='--after059',database=rehearsal?clone:'crm_local';
const baselineIndex=args.indexOf('--baseline');assert(baselineIndex>=0&&args[baselineIndex+1],'--baseline <validated hash-only report.json> required.');
const baselinePath=path.resolve(args[baselineIndex+1]);assert.equal(path.dirname(baselinePath),runtime);
assert((rehearsal?/^production-upgrade-\d+\.json$/:/^production-reference-upgrade-\d+\.json$/).test(path.basename(baselinePath)),'Unexpected baseline report filename.');
const baselineBytes=await readFile(baselinePath),baseline=JSON.parse(baselineBytes.toString('utf8'));
const baselineSha256=createHash('sha256').update(baselineBytes).digest('hex');
assert.equal(baseline.status,'PASS');assert.equal(baseline.database,clone);assert.equal(baseline.baseline.database,clone);assert.equal(baseline.after.database,clone);
if(!rehearsal)assert.equal(baseline.migration,migration);
const databaseUrl=process.env[rehearsal?'LOCAL_UPGRADE_DATABASE_URL':'LOCAL_FINGERPRINT_DATABASE_URL'];assert(databaseUrl,'Explicit scoped database URL required.');
const parsed=new URL(databaseUrl);assert(['postgres:','postgresql:'].includes(parsed.protocol));assert.equal(parsed.search,'','Query connection overrides forbidden.');assert.equal(parsed.hash,'');
for(const key of ['PGOPTIONS','PGHOSTADDR','PGSSLMODE','PGSERVICE','PGSERVICEFILE'])assert(!process.env[key],`${key} overrides forbidden; use a sanitized launcher.`);
assert(['127.0.0.1','localhost'].includes(parsed.hostname)&&parsed.port==='55432');assert.equal(decodeURIComponent(parsed.pathname.slice(1)),database,'Exact approved database only.');
if(rehearsal)assert(args.includes('--run-approved-clone'),'Explicit --run-approved-clone required after review and freeze.');
const checksum=async(name)=>createHash('sha256').update(await readFile(path.join(root,'server/db/migrations',name))).digest('hex');
const ident=x=>'"'+String(x).replaceAll('"','""')+'"';
const pool=new pg.Pool({connectionString:databaseUrl,max:1}),wait=ms=>new Promise(r=>setTimeout(r,ms));
let child,passed=false,pendingReport;
async function pendingMigrations(ledger){const files=(await readdir(path.join(root,'server/db/migrations'))).filter(x=>x.endsWith('.sql')).sort();return files.filter(x=>!ledger.some(y=>y.name===x));}
async function capture(){
  const client=await pool.connect();try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const identity=(await client.query("select current_database() database,current_setting('transaction_read_only') readonly")).rows[0];assert.equal(identity.database,database);assert.equal(identity.readonly,'on');
    const tables=(await client.query("select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by n.nspname,c.relname")).rows;
    const out={database,tables:{},sequences:{},default058Counts:{},ledger:(await client.query('select name,checksum,source,applied_at::text applied_at from local_schema_migrations order by name')).rows};
    for(const table of tables){
      const columns=(await client.query('select column_name name,data_type,udt_name,is_nullable from information_schema.columns where table_schema=$1 and table_name=$2 order by ordinal_position',[table.schema,table.name])).rows;
      // Store per-column-set hashes to compare the old058 report without row values.
      const name=`${table.schema}.${table.name}`,columnNames=columns.map(c=>c.name),legacy=baseline.baseline.tables[name]?.columns.map(c=>c.name)||columnNames;
      const subsets={full:[],without059:columnNames.includes('reference_images')?['reference_images']:[],legacy:columnNames.filter(c=>!legacy.includes(c))};
      const hashes={};let count;
      for(const [key,excluded] of Object.entries(subsets)){
        const expression='md5((to_jsonb(t)-$1::text[])::text)';
        const digest=(await client.query(`select count(*)::text count,md5(coalesce(string_agg(${expression},'' order by ${expression}),'')) row_hash from ${ident(table.schema)}.${ident(table.name)} t`,[excluded])).rows[0];count=digest.count;hashes[key]=digest.row_hash;
      }
      out.tables[name]={columns,count,hashes};
      const defaults058={
        'public.local_production_outputs':['production_batch_id','order_item_id','inventory_item_id','inventory_receipt_id','inventory_movement_id','created_by','valuation_status'],
        'public.local_assignments':['repair_ticket_id'],'public.local_production_job_publications':['repair_ticket_id'],
      }[name];
      if(defaults058){
        assert(defaults058.every(c=>columnNames.includes(c)),'Expected058 column missing.');
        const predicate=defaults058.map(c=>c==='valuation_status'?`${ident(c)} is distinct from 'UNVALUED'`:`${ident(c)} is not null`).join(' or ');
        out.default058Counts[name]=(await client.query(`select count(*)::text n from ${ident(table.schema)}.${ident(table.name)} where ${predicate}`)).rows[0].n;
      }
      if(name==='public.local_production_order_items'&&columnNames.includes('reference_images'))out.reference_nonnull=(await client.query('select count(*)::text n from local_production_order_items where reference_images is not null')).rows[0].n;
    }
    const sequences=(await client.query("select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by n.nspname,c.relname")).rows;
    for(const row of sequences)out.sequences[`${row.schema}.${row.name}`]=(await client.query(`select last_value::text last_value,is_called from ${ident(row.schema)}.${ident(row.name)}`)).rows[0];
    await client.query('ROLLBACK');return out;
  }finally{await client.query('ROLLBACK').catch(()=>undefined);client.release();}
}
function history(ledger){return ledger.map(x=>[previousMigration,migration].includes(x.name)?{...x,applied_at:'separate application transaction'}:x);}
async function verifyPrior058(state){
  const expected=baseline.after;assert.equal(Object.keys(state.tables).length,128);assert.deepEqual(Object.keys(state.tables),Object.keys(expected.tables));
  for(const [name,table] of Object.entries(state.tables)){
    const old=expected.tables[name];assert.deepEqual(table.columns,old.columns,`058 columns differ: ${name}`);assert.equal(table.count,old.count,`058 count differs: ${name}`);
    if(name!=='public.local_schema_migrations')assert.equal(table.hashes.legacy,old.row_hash,`058 old-column hash differs: ${name}`);
  }
  assert.deepEqual(state.sequences,expected.sequences);assert.deepEqual(history(state.ledger),history(expected.ledger));
  assert.equal(state.ledger.find(x=>x.name===previousMigration)?.checksum,await checksum(previousMigration));
  assert.deepEqual(state.default058Counts,{'public.local_assignments':'0','public.local_production_job_publications':'0','public.local_production_outputs':'0'},'058 additions differ from approved empty/default-only upgrade.');
  assert(state.ledger.some(x=>x.name==='__seed.sql'));assert(!state.ledger.some(x=>x.name===migration));
}
function compare(state,expected,{new059=false,live=false}={}){
  assert.deepEqual(Object.keys(state.tables),Object.keys(expected.tables),'Table inventory changed.');
  for(const [name,old] of Object.entries(expected.tables)){
    const actual=state.tables[name],isItem=name==='public.local_production_order_items';
    const columns=new059&&isItem?[...old.columns,{name:'reference_images',data_type:'jsonb',udt_name:'jsonb',is_nullable:'YES'}]:old.columns;
    assert.deepEqual(actual.columns,columns,`Column contract changed: ${name}`);
    if(name!=='public.local_schema_migrations'){
      assert.equal(actual.count,old.count,`Count changed: ${name}`);
      assert.equal(new059&&isItem?actual.hashes.without059:actual.hashes.full,old.hashes.full,`Existing values changed: ${name}`);
    }
  }
  assert.deepEqual(state.sequences,expected.sequences,'Sequence positions changed.');
  assert.deepEqual(state.default058Counts,expected.default058Counts,'058 additive values changed.');
  if(new059){
    assert.equal(state.reference_nonnull,'0','059 must not backfill historical photos.');
    const added=state.ledger.filter(x=>!expected.ledger.some(y=>y.name===x.name));assert.equal(added.length,1);assert.equal(added[0].name,migration);assert.equal(added[0].source,'APPLIED');
    assert.deepEqual(live?history(state.ledger.filter(x=>x.name!==migration)):state.ledger.filter(x=>x.name!==migration),live?history(expected.ledger):expected.ledger,'Historical migration/seed changed.');
  }else assert.deepEqual(live?history(state.ledger):state.ledger,live?history(expected.ledger):expected.ledger,'Migration/seed ledger changed.');
}
try{
  if(!rehearsal){
    const state=await capture();compare(state,baseline.baseline,{new059:after,live:true});
    assert.deepEqual(await pendingMigrations(state.ledger),after?[]:[migration],'Unexpected pending migrations at live gate.');
    if(after){assert.equal(state.ledger.find(x=>x.name===migration)?.checksum,await checksum(migration));assert.equal(state.ledger.find(x=>x.name===migration)?.checksum,baseline.after.ledger.find(x=>x.name===migration)?.checksum);}
    console.log(`PASS READ ONLY crm_local ${after?'after059':'before059'}:128tables,old-column hashes/counts,sequences,history/seed; no API started.`);passed=true;
  }else{
    const before=await capture();await verifyPrior058(before);
    assert.deepEqual(await pendingMigrations(before.ledger),[migration],'Only059 may be pending before child bootstrap; refuse future migrations.');
    const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
    const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','COMSPEC'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
    Object.assign(env,{NODE_ENV:'development',LOCAL_DATABASE_URL:databaseUrl,LOCAL_API_HOST:'127.0.0.1',LOCAL_API_PORT:String(port),LOCAL_SYNC_AUTO:'false',LOCAL_DEMO_AUTH:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false',LOCAL_INTEGRATION_API:'false',LOCAL_STORAGE_ROOT:path.join(runtime,'reference-upgrade-storage')});
    child=spawn(process.execPath,['--import','tsx','--import','data:text/javascript,'+encodeURIComponent('globalThis.fetch=async()=>{throw new Error("Rehearsal outbound fetch blocked")};'),'server/index.ts'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout.resume();child.stderr.resume();let health;
    for(let attempt=0;attempt<160;attempt++){
      if(child.exitCode!==null)throw new Error('Owned clone API exited before health.');
      try{const response=await fetch(`http://127.0.0.1:${port}/health`);const body=await response.json();if(response.ok&&body.ok&&body.database===clone){health=body;break;}}catch{}
      await wait(250);
    }
    assert(health,'Owned clone health missing.');assert.equal(health.capabilities?.production_workspace,4);assert.equal(health.capabilities?.production_dispatch,3);assert.equal(health.capabilities?.production_sales_workflow,1);
    const upgraded=await capture();compare(upgraded,before,{new059:true});assert.equal(upgraded.ledger.find(x=>x.name===migration)?.checksum,await checksum(migration));
    const report={status:'PASS',migration,database:clone,verifiedAt:new Date().toISOString(),baseline:before,after:upgraded,previousValidatedReport:path.basename(baselinePath),previousValidatedReportSha256:baselineSha256,outboundFetch:'blocked',sync:'false',demo:'false',integration:'false',health:{database:health.database,capabilities:health.capabilities}};
    pendingReport={path:path.join(runtime,`production-reference-upgrade-${Date.now()}.json`),data:report};
  }
}finally{
  let stopped=!child||child.exitCode!==null||child.signalCode!==null;
  if(child&&!stopped){child.kill();await Promise.race([once(child,'exit'),wait(5000)]);stopped=child.exitCode!==null||child.signalCode!==null;}
  await pool.end();
  if(!stopped){console.error(`Owned clone API PID${child.pid} exit unconfirmed; do not reuse clone.`);process.exitCode=1;}
  else{
    if(pendingReport){await mkdir(runtime,{recursive:true});await writeFile(pendingReport.path,JSON.stringify(pendingReport.data,null,2),{flag:'wx'});passed=true;console.log(`PASS059 clone rehearsal:128tables preserved,nullablephoto only,one059ledger addition; owned child exit confirmed. Report:${pendingReport.path}`);}
    console.log(`${passed?'Verification passed':'Verification incomplete'}; ${rehearsal?'owned API stopped, clone retained; live never targeted':'read-only transaction ended'}.`);
  }
}
