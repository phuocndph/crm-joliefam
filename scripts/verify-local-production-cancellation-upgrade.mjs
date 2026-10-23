// Coordinator-only060 rehearsal and READ ONLY live gates. No .env, restore,
// database create/drop or automatic live upgrade. Read fully before execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const root=fileURLToPath(new URL('../',import.meta.url)),runtime=path.join(root,'.local-staging-runtime');
const clone='crm_local_qa_production_20261019_pre058',migration='060_local_production_uncut_cancellations.sql',photo='059_local_production_reference_images.sql',newTable='public.local_production_uncut_cancellations';
const args=process.argv.slice(2),modes=args.filter(x=>['--rehearse','--reverify060','--before','--after060'].includes(x));assert.equal(modes.length,1);
const rehearsal=modes[0]==='--rehearse',reverify=modes[0]==='--reverify060',usesClone=rehearsal||reverify,after=modes[0]==='--after060',database=usesClone?clone:'crm_local',index=args.indexOf('--baseline');assert(index>=0&&args[index+1]);
const reportPath=path.resolve(args[index+1]);assert.equal(path.dirname(reportPath),runtime);
assert((rehearsal?/^production-reference-upgrade-\d+\.json$/:/^production-cancellation-upgrade-\d+\.json$/).test(path.basename(reportPath)));
const bytes=await readFile(reportPath),baseline=JSON.parse(bytes.toString('utf8'));assert.equal(baseline.status,'PASS');assert.equal(baseline.database,clone);assert.equal(baseline.migration,rehearsal?photo:migration);
const sha=data=>createHash('sha256').update(data).digest('hex');
const original060Report='production-cancellation-upgrade-1792469879714.json',original060Sha256='380b24bf027ad9a970de2488f27e36cea2215efc454982080090d504d4e82965';
if(reverify){const at=args.indexOf('--baseline-sha256');assert(at>=0&&args[at+1],'Required immutable --baseline-sha256.');assert.equal(args[at+1],original060Sha256);assert.equal(path.basename(reportPath),original060Report);assert.equal(sha(bytes),original060Sha256,'Original060 report changed.');}
const fileHash=async(name)=>sha(await readFile(path.join(root,'server/db/migrations',name)));
const productionFiles=['server/index.ts','server/db/bootstrap.ts','server/production-workspace.ts','server/production-dispatch.ts','server/production-sales-workflow.ts','server/production-reference-images.ts','server/production-uncut-cancellations.ts','server/db/migrations/058_local_production_workspace.sql','server/db/migrations/059_local_production_reference_images.sql','server/db/migrations/060_local_production_uncut_cancellations.sql','src/pages/ProductionWorkspacePage.tsx','src/pages/ProductionOrdersPage.tsx','src/components/ProductionWorkspaceDetail.tsx','src/components/ProductionReferenceImages.tsx','src/components/MyProductionDispatch.tsx','src/components/ProductionDispatchJobs.tsx','src/components/ProductionTaskMaterials.tsx','src/components/ProductionReportRepair.tsx','src/components/CuttingEstimatePanel.tsx','src/components/ProductionSalesQueue.tsx','src/lib/local-api.ts','src/lib/production-workspace-types.ts','src/lib/production-dispatch-types.ts','scripts/start-local.ps1','scripts/verify-local-production-cancellation-upgrade.mjs'];
productionFiles.push('src/components/ProductionBulkWork.tsx','src/components/ProductionDispatchPanel.tsx','src/lib/production-bulk-queue.ts','src/lib/production-workspace-context.ts','src/hooks/useProductionBulkQueue.ts','src/lib/local-auth.ts');
const originalProductionFiles=[...productionFiles];
productionFiles.push('src/components/ProductionReviewQueue.tsx');
if(reverify)assert.deepEqual(Object.keys(baseline.productionSourceSha256||{}),originalProductionFiles,'Expected original060 source manifest; no missing historical runtime file.');
async function sourceManifest(){return Object.fromEntries(await Promise.all(productionFiles.map(async name=>[name,sha(await readFile(path.join(root,name)))])));}
async function assertMigrationFiles(ledger){for(const row of ledger.filter(x=>x.name!=='__seed.sql')){assert(/^\d{3}_[a-z0-9_]+\.sql$/.test(row.name),'Unexpected migration ledger name.');assert.equal(row.checksum,await fileHash(row.name),`Applied migration file changed:${row.name}`);}}
function scopedUrl(value,expected){assert(value,'Explicit scoped database URL required.');const parsed=new URL(value);assert(['postgres:','postgresql:'].includes(parsed.protocol));assert.equal(parsed.search,'');assert.equal(parsed.hash,'');assert(['localhost','127.0.0.1'].includes(parsed.hostname)&&parsed.port==='55432');assert.equal(decodeURIComponent(parsed.pathname.slice(1)),expected);return value;}
const url=scopedUrl(process.env[usesClone?'LOCAL_UPGRADE_DATABASE_URL':'LOCAL_FINGERPRINT_DATABASE_URL'],database);
for(const key of ['PGOPTIONS','PGHOSTADDR','PGSSLMODE','PGSERVICE','PGSERVICEFILE'])assert(!process.env[key],`${key} override forbidden.`);
if(usesClone)assert(args.includes('--run-approved-clone'));
const ident=x=>'"'+String(x).replaceAll('"','""')+'"',pool=new pg.Pool({connectionString:url,max:1}),wait=ms=>new Promise(r=>setTimeout(r,ms));
const history=rows=>rows.map(x=>x.name==='058_local_production_workspace.sql'?{...x,applied_at:'separate application transaction'}:x);
let child,pendingReport,livePool,passed=false;
async function stopChild(){let stopped=!child||child.exitCode!==null||child.signalCode!==null;if(child&&!stopped){child.kill();await Promise.race([once(child,'exit'),wait(5000)]);stopped=child.exitCode!==null||child.signalCode!==null;}return stopped;}
async function pending(ledger){return(await readdir(path.join(root,'server/db/migrations'))).filter(x=>x.endsWith('.sql')&&!ledger.some(y=>y.name===x)).sort();}
async function capture(targetPool=pool,expectedDatabase=database){const client=await targetPool.connect();try{
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const identity=(await client.query("select current_database() database,current_setting('transaction_read_only') readonly")).rows[0];assert.equal(identity.database,expectedDatabase);assert.equal(identity.readonly,'on');
 const out={database:expectedDatabase,tables:{},sequences:{},default058Counts:{},ledger:(await client.query('select name,checksum,source,applied_at::text applied_at from local_schema_migrations order by name')).rows};
 const tables=(await client.query("select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by n.nspname,c.relname")).rows;
 for(const t of tables){const name=`${t.schema}.${t.name}`,columns=(await client.query('select column_name name,data_type,udt_name,is_nullable from information_schema.columns where table_schema=$1 and table_name=$2 order by ordinal_position',[t.schema,t.name])).rows,hashes={};let count;
  for(const [key,excluded] of Object.entries({full:[],without059:columns.some(c=>c.name==='reference_images')?['reference_images']:[]})){
   const expression='md5((to_jsonb(t)-$1::text[])::text)',digest=(await client.query(`select count(*)::text count,md5(coalesce(string_agg(${expression},'' order by ${expression}),'')) row_hash from ${ident(t.schema)}.${ident(t.name)} t`,[excluded])).rows[0];count=digest.count;hashes[key]=digest.row_hash;
  }out.tables[name]={columns,count,hashes};
  const defaults={'public.local_production_outputs':['production_batch_id','order_item_id','inventory_item_id','inventory_receipt_id','inventory_movement_id','created_by','valuation_status'],'public.local_assignments':['repair_ticket_id'],'public.local_production_job_publications':['repair_ticket_id']}[name];
  if(defaults){const predicate=defaults.map(c=>c==='valuation_status'?`${ident(c)} is distinct from 'UNVALUED'`:`${ident(c)} is not null`).join(' or ');out.default058Counts[name]=(await client.query(`select count(*)::text n from ${ident(t.schema)}.${ident(t.name)} where ${predicate}`)).rows[0].n;}
  if(name==='public.local_production_order_items'&&columns.some(c=>c.name==='reference_images'))out.reference_nonnull=(await client.query('select count(*)::text n from local_production_order_items where reference_images is not null')).rows[0].n;
 }
 const sequences=(await client.query("select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by n.nspname,c.relname")).rows;
 for(const s of sequences)out.sequences[`${s.schema}.${s.name}`]=(await client.query(`select last_value::text last_value,is_called from ${ident(s.schema)}.${ident(s.name)}`)).rows[0];await client.query('ROLLBACK');return out;
}finally{await client.query('ROLLBACK').catch(()=>undefined);client.release();}}
function compare(state,expected,{add060=false,add059=false,live=false}={}){
 assert.deepEqual(Object.keys(state.tables),[...Object.keys(expected.tables),...(add060?[newTable]:[])].sort(),'Unexpected table inventory.');
 for(const [name,old] of Object.entries(expected.tables)){
  const table=state.tables[name],newPhoto=add059&&name==='public.local_production_order_items';assert.deepEqual(table.columns,newPhoto?[...old.columns,{name:'reference_images',data_type:'jsonb',udt_name:'jsonb',is_nullable:'YES'}]:old.columns,`Column contract changed:${name}`);
  if(name!=='public.local_schema_migrations'){assert.equal(table.count,old.count,`Row count changed:${name}`);assert.equal(table.hashes[newPhoto?'without059':'full'],old.hashes.full,`Existing values changed:${name}`);}
 }
 if(add060)assert.equal(state.tables[newTable].count,'0','New cancellation ledger must be empty.');
 assert.deepEqual(state.sequences,expected.sequences);assert.deepEqual(state.default058Counts,expected.default058Counts);
 const additions=[...(add059?[photo]:[]),...(add060?[migration]:[])];
 const added=state.ledger.filter(x=>!expected.ledger.some(y=>y.name===x.name));assert.deepEqual(added.map(x=>x.name),additions);
 for(const row of added)assert.equal(row.source,'APPLIED');
 assert.deepEqual(live?history(state.ledger.filter(x=>!additions.includes(x.name))):state.ledger.filter(x=>!additions.includes(x.name)),live?history(expected.ledger):expected.ledger,'Historical ledger/seed changed.');
 if(add059)assert.equal(state.reference_nonnull,'0');
}
try{
 if(reverify){
  // This mode does NOT upgrade anything. Both databases must already be060.
  // The original060 report is immutable; the fresh report adds a source freeze
  // and an exact live060 baseline instead of relaxing old058 upgrade gates.
  assert.equal(baseline.sourceOnly060,undefined,'Use the original060 rehearsal report.');
  assert.equal(baseline.after.database,clone);assert.equal(Object.keys(baseline.after.tables).length,129);
  const before=await capture();assert.deepEqual(before,baseline.after,'Clone060 differs from the complete original060 fingerprint.');await assertMigrationFiles(before.ledger);assert.deepEqual(await pending(before.ledger),[],'Source-only verification cannot apply pending migrations.');
  for(const name of ['058_local_production_workspace.sql',photo,migration])assert.equal(before.ledger.find(x=>x.name===name)?.checksum,await fileHash(name));
  const liveUrl=scopedUrl(process.env.LOCAL_FINGERPRINT_DATABASE_URL,'crm_local');livePool=new pg.Pool({connectionString:liveUrl,max:1});
  const liveBefore=await capture(livePool,'crm_local');
  assert.equal(baseline.liveBaseline058.database,clone);assert.equal(Object.keys(baseline.liveBaseline058.tables).length,128);
  compare(liveBefore,baseline.liveBaseline058,{add059:true,add060:true,live:true});
  assert.equal(Object.keys(liveBefore.tables).length,129);assert.equal(Number(liveBefore.tables['public.local_schema_migrations'].count),Number(baseline.liveBaseline058.tables['public.local_schema_migrations'].count)+2);
  await assertMigrationFiles(liveBefore.ledger);assert.deepEqual(await pending(liveBefore.ledger),[]);
  for(const name of ['058_local_production_workspace.sql',photo,migration])assert.equal(liveBefore.ledger.find(x=>x.name===name)?.checksum,before.ledger.find(x=>x.name===name)?.checksum);
  assert.deepEqual(liveBefore.tables[newTable],before.tables[newTable],'060 cancellation ledger schema/content differs from original rehearsal.');
  const frozenSource=await sourceManifest();
  const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
  const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','COMSPEC'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));Object.assign(env,{NODE_ENV:'development',LOCAL_DATABASE_URL:url,LOCAL_API_HOST:'127.0.0.1',LOCAL_API_PORT:String(port),LOCAL_SYNC_AUTO:'false',LOCAL_DEMO_AUTH:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false',LOCAL_INTEGRATION_API:'false',LOCAL_STORAGE_ROOT:path.join(runtime,'cancellation-reverify-storage')});
  child=spawn(process.execPath,['--import','tsx','--import','data:text/javascript,'+encodeURIComponent('globalThis.fetch=async()=>{throw new Error("Outbound rehearsal fetch blocked")};'),'server/index.ts'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.resume();child.stderr.resume();let health;
  for(let attempt=0;attempt<160;attempt++){if(child.exitCode!==null)throw new Error('Owned source-only clone API exited before health.');try{const response=await fetch(`http://127.0.0.1:${port}/health`),body=await response.json();if(response.ok&&body.ok&&body.database===clone){health=body;break;}}catch{}await wait(250);}
  assert(health);assert.equal(health.capabilities?.production_workspace,5);assert.equal(health.capabilities?.production_dispatch,3);assert.equal(health.capabilities?.production_sales_workflow,1);
  assert(await stopChild(),'Owned clone API exit must be confirmed before final fingerprints/report.');
  const verified=await capture(),liveAfter=await capture(livePool,'crm_local');
  assert.deepEqual(verified,before,'Source-only API changed clone tables/schema/values/sequences/ledger.');assert.deepEqual(liveAfter,liveBefore,'Live060 fingerprint changed during source-only verification.');
  await assertMigrationFiles(verified.ledger);await assertMigrationFiles(liveAfter.ledger);assert.deepEqual(await pending(verified.ledger),[]);assert.deepEqual(await sourceManifest(),frozenSource,'Production source changed during source-only verification.');assert.equal(sha(await readFile(reportPath)),original060Sha256,'Original060 report changed during verification.');
  pendingReport={path:path.join(runtime,`production-cancellation-upgrade-${Date.now()}.json`),data:{status:'PASS',migration,database:clone,sourceOnly060:true,verifiedAt:new Date().toISOString(),productionSourceSha256:frozenSource,baseline:before,liveBaseline058:baseline.liveBaseline058,liveBaseline060:liveAfter,after:verified,previousValidatedReport:original060Report,previousValidatedReportSha256:original060Sha256,outboundFetch:'blocked',sync:'false',demo:'false',integration:'false',bootstrapMutations:'none; full clone/live fingerprints unchanged after confirmed child exit',health:{database:health.database,capabilities:health.capabilities}}};
 }else if(rehearsal){
  assert.equal(baseline.baseline.database,clone);assert.equal(baseline.after.database,clone);assert.equal(Object.keys(baseline.after.tables).length,128);
  const before=await capture();compare(before,baseline.after);await assertMigrationFiles(before.ledger);const frozenSource=await sourceManifest();assert.equal(before.reference_nonnull,'0');assert(before.ledger.some(x=>x.name==='__seed.sql'));assert.equal(before.ledger.find(x=>x.name===photo)?.checksum,await fileHash(photo));assert.deepEqual(await pending(before.ledger),[migration],'Only060 may be pending.');
  const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
  const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','COMSPEC'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));Object.assign(env,{NODE_ENV:'development',LOCAL_DATABASE_URL:url,LOCAL_API_HOST:'127.0.0.1',LOCAL_API_PORT:String(port),LOCAL_SYNC_AUTO:'false',LOCAL_DEMO_AUTH:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false',LOCAL_INTEGRATION_API:'false',LOCAL_STORAGE_ROOT:path.join(runtime,'cancellation-upgrade-storage')});
  child=spawn(process.execPath,['--import','tsx','--import','data:text/javascript,'+encodeURIComponent('globalThis.fetch=async()=>{throw new Error("Outbound rehearsal fetch blocked")};'),'server/index.ts'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.resume();child.stderr.resume();let health;
  for(let attempt=0;attempt<160;attempt++){if(child.exitCode!==null)throw new Error('Owned clone API exited before health.');try{const response=await fetch(`http://127.0.0.1:${port}/health`),body=await response.json();if(response.ok&&body.ok&&body.database===clone){health=body;break;}}catch{}await wait(250);}
  assert(health);assert.equal(health.capabilities?.production_workspace,5);assert.equal(health.capabilities?.production_dispatch,3);assert.equal(health.capabilities?.production_sales_workflow,1);
  const upgraded=await capture();compare(upgraded,before,{add060:true});await assertMigrationFiles(upgraded.ledger);assert.equal(upgraded.ledger.find(x=>x.name===migration)?.checksum,await fileHash(migration));assert.deepEqual(await pending(upgraded.ledger),[]);assert.deepEqual(await sourceManifest(),frozenSource,'Production source changed during rehearsal.');
  pendingReport={path:path.join(runtime,`production-cancellation-upgrade-${Date.now()}.json`),data:{status:'PASS',migration,database:clone,verifiedAt:new Date().toISOString(),productionSourceSha256:frozenSource,baseline:before,liveBaseline058:baseline.baseline,after:upgraded,previousValidatedReport:path.basename(reportPath),previousValidatedReportSha256:sha(bytes),outboundFetch:'blocked',sync:'false',demo:'false',integration:'false',health:{database:health.database,capabilities:health.capabilities}}};
 }else if(baseline.sourceOnly060===true){
  assert.equal(baseline.previousValidatedReport,original060Report);assert.equal(baseline.previousValidatedReportSha256,original060Sha256);assert.equal(sha(await readFile(path.join(runtime,original060Report))),original060Sha256,'Original060 report is no longer immutable.');
  assert.equal(baseline.liveBaseline060?.database,'crm_local');assert.equal(baseline.after.database,clone);assert.equal(Object.keys(baseline.liveBaseline060.tables).length,129);assert.equal(Object.keys(baseline.after.tables).length,129);
  assert.deepEqual(Object.keys(baseline.productionSourceSha256||{}),productionFiles);assert.deepEqual(await sourceManifest(),baseline.productionSourceSha256,'Production source differs from frozen source-only060 verification.');
  const state=await capture();await assertMigrationFiles(state.ledger);assert.deepEqual(await pending(state.ledger),[]);assert.deepEqual(state,baseline.liveBaseline060,'Live060 changed: source-only restart must not apply or normalize any schema/data/ledger.');
  for(const name of ['058_local_production_workspace.sql',photo,migration])assert.equal(state.ledger.find(x=>x.name===name)?.checksum,baseline.after.ledger.find(x=>x.name===name)?.checksum);
  passed=true;console.log(`PASS READ ONLY crm_local ${after?'after':'before'} source-only060 fingerprint; all129 tables/schema/sequences/ledger exact; no migration or API mutation.`);
 }else{
  assert.equal(baseline.liveBaseline058.database,clone);assert.equal(Object.keys(baseline.liveBaseline058.tables).length,128);
  assert.equal(Object.keys(baseline.after.tables).length,129);assert.deepEqual(Object.keys(baseline.productionSourceSha256||{}),productionFiles);assert.deepEqual(await sourceManifest(),baseline.productionSourceSha256,'Production source differs from frozen060 rehearsal.');
  const state=await capture();await assertMigrationFiles(state.ledger);compare(state,baseline.liveBaseline058,{add059:after,add060:after,live:true});assert.deepEqual(await pending(state.ledger),after?[]:[photo,migration]);
  if(after)assert.deepEqual(state.tables[newTable],baseline.after.tables[newTable],'060 ledger schema or content differs from rehearsal.');
  if(after)for(const name of [photo,migration]){assert.equal(state.ledger.find(x=>x.name===name)?.checksum,await fileHash(name));assert.equal(state.ledger.find(x=>x.name===name)?.checksum,baseline.after.ledger.find(x=>x.name===name)?.checksum);}
  passed=true;console.log(`PASS READ ONLY crm_local ${after?'after060':'before059+060'} fingerprint; no API or mutation.`);
 }
}finally{
 const stopped=await stopChild();await pool.end();if(livePool)await livePool.end();
 if(!stopped){console.error(`Owned clone API PID${child.pid} exit unconfirmed; no PASS report published.`);process.exitCode=1;}
 else{if(pendingReport){await mkdir(runtime,{recursive:true});await writeFile(pendingReport.path,JSON.stringify(pendingReport.data,null,2),{flag:'wx'});passed=true;console.log(`PASS060 ${reverify?'source-only verification':'rehearsal'}; owned API exit confirmed. Report:${pendingReport.path}`);}console.log(`${passed?'Passed':'Incomplete'}; ${usesClone?reverify?'clone retained; live READ ONLY fingerprint verified':'clone retained, live never targeted':'READ ONLY transaction ended'}.`);}
}
