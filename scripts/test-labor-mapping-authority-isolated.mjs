// Independent owned synthetic fixture only. No .env, existing database/container or remote service.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomBytes,randomUUID,scryptSync} from 'node:crypto';
import {once} from 'node:events';
import {mkdir,mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {tsImport} from 'tsx/esm/api';
const mode=process.argv.find(x=>x.startsWith('--mode='))?.slice(7);
assert.ok(['baseline','fixed'].includes(mode),'Explicit --mode=baseline or --mode=fixed is required');
const fixedPin=process.argv.find(x=>x.startsWith('--mapping-pin='))?.slice(14);
if(mode==='fixed')assert.match(fixedPin||'',/^[a-f0-9]{64}$/,'Root-approved fixed mapping source pin is required');
const stage='.local-staging-runtime/item5-mapping-authority-20261030/'+(mode==='fixed'?'fixed':'prechange');
const image='sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
const pins={"server/product-labor-requirements.ts":"ae2f43fd81e2bd28e17252c2dc980d118fc35ce41abe318516796ec1443ef6f1","server/product-labor-mappings.ts":"511d5ff5016db24be03ce2d290f7724dfdda1cea1babc0293e3285d7b681871e","server/index.ts":"a46502b0cff64188c1311bd7b24945d92d4a5575b960c9600b08abf1bf4efc39","server/product-rate-authoring.ts":"b70a03b7ac1721e618ff8f5bb0be4fd761f93eeec0dcbda87f340d5b6b29e156"};
if(mode==='fixed')pins['server/product-labor-mappings.ts']=fixedPin;
const hash=x=>createHash('sha256').update(x).digest('hex'),key=()=>randomUUID(),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function verifyPins(){for(const [file,pin]of Object.entries(pins))assert.equal(hash(await readFile(file)),pin,file);}
await verifyPins();await mkdir(stage,{recursive:true});
const ownership=key(),name='mapping-authority-tester-'+ownership,label='crm.qa.owner',secret=randomBytes(24).toString('hex');
let cid,admin,pool,api,storage,base,token,logs='',paths;
const proof={mode,scope:'Fresh tester-owned tmpfs PostgreSQL and loopback API; no business runtime',pins,passed:[],failures:[],started_at:new Date().toISOString()};
const docker=(args)=>{const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,(r.stderr||'Docker failure').replaceAll(secret,'[redacted]'));return r.stdout.trim();};
function owned(){const r=JSON.parse(docker(['inspect',cid]))[0];assert.equal(r.Id,cid);assert.equal(r.Name,'/'+name);assert.equal(r.Config.Labels[label],ownership);assert.equal(r.Image,image);assert.equal(r.HostConfig.Binds?.length||0,0);assert.equal(r.HostConfig.Mounts?.length||0,0);assert.ok(r.HostConfig.Tmpfs['/var/lib/postgresql/data']);return r;}
const call=async(url,method='GET',body,credential=token)=>{const r=await fetch(base+url,{method,headers:{origin:'https://fixture.invalid',...(credential?{authorization:'Bearer '+credential}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});return{status:r.status,body:await r.json().catch(()=>null)};};
const must=async(...args)=>{const r=await call(...args);assert.ok(r.status<300,JSON.stringify({url:args[0],...r}));return r.body;};
async function check(name,fn){try{await fn();proof.passed.push(name);console.log('PASS '+name);}catch(e){proof.failures.push({name,error:e.stack?.replaceAll(secret,'[redacted]')});console.log('FAIL '+name+': '+e.message.replaceAll(secret,'[redacted]'));}}
try{
 assert.equal(JSON.parse(docker(['image','inspect',image]))[0].Id,image);
 cid=docker(['run','--pull=never','-d','--name',name,'--label',label+'='+ownership,'--tmpfs','/var/lib/postgresql/data:rw,size=536870912','-p','127.0.0.1::5432','-e','POSTGRES_USER=fixture_owner','-e','POSTGRES_PASSWORD='+secret,'-e','POSTGRES_DB=fixture_control',image]);
 const inspect=owned(),binding=inspect.NetworkSettings.Ports['5432/tcp'];assert.equal(binding.length,1);assert.equal(binding[0].HostIp,'127.0.0.1');const dbport=Number(binding[0].HostPort);
 admin=new pg.Pool({connectionString:`postgres://fixture_owner:${secret}@127.0.0.1:${dbport}/fixture_control`});let ready=false;for(let i=0;i<100;i++){try{await admin.query('select 1');ready=true;break;}catch{}await delay(100);}assert.ok(ready,'fresh PostgreSQL ready');
 await admin.query(`create role fixture_app login nosuperuser nocreatedb nocreaterole password '${secret}'`);await admin.query('create database fixture_owned owner fixture_app');
 const connectionString=`postgres://fixture_app:${secret}@127.0.0.1:${dbport}/fixture_owned`;pool=new pg.Pool({connectionString});
 storage=await mkdtemp(path.join(tmpdir(),'item5-consumption-tester-'));paths={trace:path.join(storage,'trace.jsonl'),armed:path.join(storage,'armed.json'),reached:path.join(storage,'reached.json'),release:path.join(storage,'release')};await writeFile(paths.trace,'');
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));base='http://127.0.0.1:'+port;
 const guard=`import net from 'node:net';const orig=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...a){const o=typeof a[0]==='object'?a[0]:{host:typeof a[1]==='string'?a[1]:'localhost'};if(o.host&&!['127.0.0.1','localhost','::1'].includes(o.host))throw Error('Tester blocks non-loopback sockets');return orig.apply(this,a)};globalThis.fetch=async()=>{throw Error('Tester blocks outbound fetch')};`;
 const instrument=`import pg from ${JSON.stringify(new URL('../node_modules/pg/lib/index.js',import.meta.url).href)};import{readFile,writeFile,appendFile,unlink}from'node:fs/promises';const p=${JSON.stringify(paths)},orig=pg.Client.prototype.query;async function before(c,a){const sql=typeof a[0]==='string'?a[0]:a[0]?.text;if(!sql)return;await appendFile(p.trace,JSON.stringify({pid:c.processID,sql})+'\\n');let arm;try{arm=JSON.parse(await readFile(p.armed,'utf8'));}catch{}if(arm&&sql.includes(arm.match)){await unlink(p.armed);await writeFile(p.reached,JSON.stringify({pid:c.processID,sql}));for(let i=0;i<1000;i++){try{await readFile(p.release);return;}catch{}await new Promise(r=>setTimeout(r,10));}throw Error('Tester barrier timeout');}}pg.Client.prototype.query=function(...a){const cb=a.at(-1);if(typeof cb==='function'){before(this,a).then(()=>orig.apply(this,a),e=>cb(e));return;}return before(this,a).then(()=>orig.apply(this,a));};`;
 const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'].filter(x=>process.env[x]).map(x=>[x,process.env[x]]));
 api=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(guard),'--import','data:text/javascript,'+encodeURIComponent(instrument),'--import','tsx','server/index.ts'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...env,NODE_ENV:'production',PUBLIC_APP_URL:'https://fixture.invalid',LOCAL_DATABASE_URL:connectionString,LOCAL_STORAGE_ROOT:storage,LOCAL_API_PORT:String(port),LOCAL_API_HOST:'127.0.0.1',LOCAL_DB_STARTUP_MODE:'normal',LOCAL_SYNC_AUTO:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false',LOCAL_DEMO_AUTH:'false',LOCAL_INTEGRATION_API:'false',LOCAL_ZCRM_API:'false'}});
 api.stdout.on('data',x=>logs+=x);api.stderr.on('data',x=>logs+=x);ready=false;for(let i=0;i<300;i++){assert.equal(api.exitCode,null,'Owned API exited '+logs);try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});if((await r.json()).database==='fixture_owned'){ready=true;break;}}catch{}await delay(100);}assert.ok(ready,'owned API ready');
 assert.equal((await pool.query('select current_database() db')).rows[0].db,'fixture_owned');assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,false);
 const expectedMigrations=(await readdir('server/db/migrations')).filter(x=>x.endsWith('.sql')).sort(),appliedMigrations=(await pool.query("select name,checksum from local_schema_migrations where name like '%.sql' order by name")).rows;assert.deepEqual(appliedMigrations.map(x=>x.name),expectedMigrations);for(const row of appliedMigrations)assert.equal(row.checksum,hash(await readFile('server/db/migrations/'+row.name)));proof.migrations=appliedMigrations.length;
 const actor=key(),password='SyntheticTesterOnly!123',salt=randomBytes(16).toString('hex');await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[actor,'tester@fixture.invalid',`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);await pool.query("insert into local_user_roles(user_id,role)values($1,'admin')",[actor]);token=(await must('/api/local-auth/login','POST',{email:'tester@fixture.invalid',password},null)).token;assert.ok(token);


 const basePath='/api/payroll/labor-mappings',at='2026-10-30',reqPath='/api/payroll/labor-code-requirements';
 async function resetAuthority(role='admin'){await pool.query('update local_user_profiles set is_active=true where user_id=$1',[actor]);await pool.query('update local_user_roles set role=$2,is_active=true where user_id=$1',[actor,role]);}
 const {requirementAuthoringSchema}=await tsImport('../server/product-labor-requirement-schema.ts',import.meta.url);
 const definition=structuredClone(requirementAuthoringSchema().families.find(x=>x.key==='PILLOW_CASE').template);
 definition.conditions={manufacturing_type:{op:'eq',value:'PILLOW_CASE'},material:{op:'eq',value:'COTTON'},pillow_subtype:{op:'eq',value:'BOLSTER'},joining:{op:'eq',value:'NO'},quilting:{op:'eq',value:'NO'},topstitch:{op:'eq',value:'NO'},sewing_method:{op:'eq',value:'STANDARD'},ruffle:{op:'eq',value:'NO'}};
 const code='QA-MAPPING-AUTH-'+key();
 await pool.query("insert into local_product_rates(piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,status,reason)values($1,'Synthetic mapping authority fixture',10,'PIECE','2026-01-01','APPROVED','Synthetic fixture')",[code]);
 const rd=await must(reqPath+'/code/'+code+'?date='+at),reqInput={code_key:rd.code_key,semantic_fingerprint:rd.semantic_fingerprint,source_hash:rd.source_hash,expected_stream_revision:rd.stream_revision,expected_proposal_revision:0,reason:'Synthetic fixture requirement',source_date:at,definition,submitted:true,idempotency_key:key()};
 const draft=await must(reqPath+'/proposals','POST',reqInput);
 await must(reqPath+'/approve','POST',{...reqInput,definition:undefined,submitted:undefined,source_date:undefined,proposal_id:draft.proposal_id,expected_proposal_revision:draft.proposal_revision,proposal_hash:draft.proposal_hash,effective_from:at,idempotency_key:key()});
 const catalog=(await must(basePath+'/catalog?date='+at+'&search='+code)).rows.find(x=>x.code===code);assert.ok(catalog?.requirement,'approved synthetic requirement');
 proof.synthetic_requirement={code,semantic_fingerprint:catalog.semantic_fingerprint,requirement:catalog.requirement};
 async function prepareProduct(){
  const id=key(),name='Synthetic pillow '+id;await pool.query("insert into local_products(id,sku,name,category,manager_id,tenant_id,specifications,price,cost_price)values($1,$2,$3,'Synthetic fixture',$4,'default','160x200cm',100,50)",[id,'QA-'+id,name,actor]);
  const prefix='/api/product-technical-profiles/'+id,detail=await must(prefix);
  await must(prefix,'PUT',{expected_revision:detail.revision,source_fingerprint:detail.source_fingerprint,idempotency_key:key(),reason:'Synthetic technical fixture',action:'CONFIRM',manufacturing_type:'PILLOW_CASE',technical_values:{material:'COTTON',pillow_subtype:'BOLSTER',joining:'NO',quilting:'NO',topstitch:'NO',sewing_method:'STANDARD',closure:'ENVELOPE',ruffle:'NO'}});
  const sr=(await must('/api/product-supply-classifications?search='+encodeURIComponent(name))).rows.find(x=>x.id===id);assert.ok(sr);
  await must('/api/product-supply-classifications/confirm','POST',{rows:[{product_id:id,expected_revision:sr.revision,source_fingerprint:sr.source_fingerprint,route:'SEW',use_suggestion:false}],reason:'Synthetic supply fixture',idempotency_key:key()});
  const resolved=await must(basePath+'/products/'+id+'?date='+at);assert.equal(resolved.gate,'READY');assert.equal(resolved.owner,actor);return{id,resolved};
 }
 async function prepare(batch=false){
  const one=await prepareProduct(),list=batch?[one,await prepareProduct()]:[one];
  const requirement=catalog.requirement,body={kind:'EXACT',template_product_id:one.id,expected_revision:one.resolved.exact_revision,source_fingerprint:one.resolved.source_fingerprint,action:'APPROVE',effective_from:at,reason:'Synthetic mapping authority test',idempotency_key:key(),piece_rate_code:catalog.code,code_semantic_fingerprint:catalog.semantic_fingerprint,source_unit:'PIECE',conversion_factor:'1',conversion_confirmed:false,expected_requirement_id:requirement.stream_id,expected_requirement_version:requirement.version,expected_requirement_content_hash:requirement.content_hash};
  if(batch)body.rows=list.map(x=>({template_product_id:x.id,source_fingerprint:x.resolved.source_fingerprint,expected_revision:x.resolved.exact_revision}));return body;
 }
 async function waitFor(fn,label){for(let i=0;i<300;i++){const r=await fn();if(r)return r;await delay(10);}throw Error(label);}
 const digest=async()=>Object.fromEntries(await Promise.all(['local_labor_mapping_decisions','local_labor_mapping_versions','local_labor_mapping_receipts'].map(async table=>{const rows=(await pool.query('select to_jsonb(t) value from '+table+' t')).rows.map(x=>JSON.stringify(x.value)).sort();return[table,{count:rows.length,sha256:hash(JSON.stringify(rows))}];})));
 async function queued(action,body,change,initialRole='admin'){
  const locker=await pool.connect();await locker.query('begin');await locker.query("select pg_advisory_xact_lock(hashtextextended('labor-mapping-writer',0))");const before=await digest();let finished=false;const pending=call(basePath+'/'+action,'POST',body).finally(()=>finished=true);let observed,response;
  try{observed=await waitFor(async()=>(await admin.query("select pid,query,wait_event from pg_stat_activity where datname='fixture_owned' and wait_event='advisory' and query like '%labor-mapping-writer%'")).rows[0],'request not blocked at real PG writer lock');assert.equal(finished,false);
   if(change==='inactive')await pool.query('update local_user_profiles set is_active=false where user_id=$1',[actor]);
   else if(change==='role_inactive')await pool.query('update local_user_roles set is_active=false where user_id=$1',[actor]);
   else if(change!=='unchanged')await pool.query('update local_user_roles set role=$2 where user_id=$1',[actor,change]);
   const authority=(await pool.query('select p.is_active,r.role,r.is_active role_active from local_user_profiles p join local_user_roles r on r.user_id=p.user_id where p.user_id=$1',[actor])).rows;
   await locker.query('commit');response=await pending;
   const after=await digest();proof.observations??=[];proof.observations.push({action,initial_role:initialRole,authority_change:change,committed_authority:authority,request:body,observed_wait:observed,status:response.status,body:response.body,before,after});return{response,before,after};
  }catch(e){await locker.query('rollback');await pending.catch(()=>undefined);throw e;}finally{locker.release();await resetAuthority(initialRole);}
 }
 const assertWrites=(r,batch)=>{assert.equal(r.response.status,200,JSON.stringify(r.response));assert.equal(r.response.body.reused,false);assert.equal(r.response.body.results.length,batch?2:1);assert.equal(r.after.local_labor_mapping_versions.count,r.before.local_labor_mapping_versions.count+(batch?2:1));assert.equal(r.after.local_labor_mapping_receipts.count,r.before.local_labor_mapping_receipts.count+1);};
 for(const role of ['admin','manager'])for(const batch of [false,true])await check('CONTROL '+role+' '+(batch?'batch':'single')+' write and replay',async()=>{await resetAuthority(role);const action=batch?'batch-confirm':'decisions',body=await prepare(batch),r=await queued(action,body,'unchanged',role);assertWrites(r,batch);const replay=await queued(action,body,'unchanged',role);assert.equal(replay.response.status,200);assert.equal(replay.response.body.reused,true);assert.deepEqual(replay.after,replay.before);await resetAuthority();});

 const denial=r=>{assert.equal(r.response.status,403,JSON.stringify(r.response));assert.deepEqual(r.after,r.before);};
 for(const role of (mode==='fixed'?['admin','manager']:['admin']))for(const batch of [false,true])for(const replay of [false,true])for(const change of (mode==='fixed'?['inactive','role_inactive','employee',role==='admin'?'manager':'admin']:['inactive','employee']))await check((mode==='fixed'?'REVOKED ':'KNOWN_FAIL ')+role+' '+(batch?'batch':'single')+' '+(replay?'stored replay':'new write')+' after '+change,async()=>{
  await resetAuthority(role);const action=batch?'batch-confirm':'decisions',body=await prepare(batch);if(replay)await must(basePath+'/'+action,'POST',body);const r=await queued(action,body,change,role);
  if(mode==='fixed')denial(r);else{assert.equal(r.response.status,200,JSON.stringify(r.response));if(replay){assert.equal(r.response.body.reused,true);assert.deepEqual(r.after,r.before);}else assertWrites(r,batch);proof.known_fail_observations??=[];proof.known_fail_observations.push({action,replay,authority_change:change,expected_status:403,actual_status:r.response.status,expected_no_writes:true,actual_no_writes:JSON.stringify(r.before)===JSON.stringify(r.after)});proof.production_verdict='KNOWN_FAIL';}await resetAuthority();
 });
 for(const kind of (mode==='fixed'?['RULE','EXACT','BATCH']:['RULE']))await check((mode==='fixed'?'REVOKED ':'KNOWN_FAIL ')+'pre-request admin to manager global '+kind+' receipt replay without decision_id',async()=>{
  await resetAuthority();const batch=kind==='BATCH',action=batch?'batch-confirm':'decisions',body={...await prepare(batch),kind:batch?'EXACT':kind,global:true};assert.equal(body.decision_id,undefined);
  const initial=await call(basePath+'/'+action,'POST',body);assert.equal(initial.status,200,JSON.stringify(initial));assert.equal(initial.body.reused,false);const validReplay=await call(basePath+'/'+action,'POST',body);assert.equal(validReplay.status,200);assert.equal(validReplay.body.reused,true);
  const before=await digest();await resetAuthority('manager');const authority=(await pool.query('select p.is_active,r.role,r.is_active role_active from local_user_profiles p join local_user_roles r on r.user_id=p.user_id where p.user_id=$1',[actor])).rows;
  const response=await call(basePath+'/'+action,'POST',body);const after=await digest();proof.pre_request_global_replays??=[];proof.pre_request_global_replays.push({initial,validReplay,body,committed_authority:authority,status:response.status,response:response.body,before,after,expected_status:403});
  try{if(mode==='fixed'){assert.equal(response.status,403,JSON.stringify(response));assert.deepEqual(after,before);}else{assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.reused,true);assert.deepEqual(after,before);proof.known_fail_observations.push({action,replay:true,authority_change:'admin_to_manager_before_request_global_'+kind,expected_status:403,actual_status:response.status,expected_no_writes:true,actual_no_writes:true});proof.production_verdict='KNOWN_FAIL';}}finally{await resetAuthority();}
 });
 if(mode==='fixed'){
  await check('CONTROL owner manager private RULE approve/replay and RETIRE global flag exclusion',async()=>{
   await resetAuthority('manager');const body={...await prepare(),kind:'RULE'};const before=await digest(),initial=await call(basePath+'/decisions','POST',body),after=await digest();assertWrites({response:initial,before,after},false);assert.equal(initial.body.results[0].kind,'RULE');
   const r=await call(basePath+'/decisions','POST',body);assert.equal(r.status,200);assert.equal(r.body.reused,true);assert.deepEqual(await digest(),after);
   const retirement={...body,decision_id:initial.body.results[0].decision_id,expected_revision:1,action:'RETIRE',global:true,idempotency_key:key()},retBefore=await digest(),ret=await call(basePath+'/decisions','POST',retirement),retAfter=await digest();assertWrites({response:ret,before:retBefore,after:retAfter},false);assert.equal(ret.body.results[0].action,'RETIRE');const replay=await call(basePath+'/decisions','POST',retirement);assert.equal(replay.status,200);assert.equal(replay.body.reused,true);assert.deepEqual(await digest(),retAfter);await resetAuthority();
  });
  const batchCases=[
   {name:'top true row false owner manager allowed',top:true,rows:[false,false],allow:true},
   {name:'top false row true owner manager denied',top:false,rows:[true,true],allow:false},
   {name:'top true row null owner manager allowed',top:true,rows:[null,null],allow:true},
   {name:'top true inherited owner manager denied',top:true,rows:['ABSENT','ABSENT'],allow:false},
   {name:'mixed false true atomic denial',top:false,rows:[false,true],allow:false},
   {name:'raw RETIRE forced APPROVE cannot bypass global',top:false,rows:[true,true],allow:false,retire:true},
   {name:'raw RETIRE private rows forced APPROVE still works',top:true,rows:[false,false],allow:true,retire:true},
  ];
  for(const c of batchCases)await check('BATCH effective rows '+c.name,async()=>{
   await resetAuthority('manager');const original=await prepare(true),body={...original,global:c.top,...(c.retire?{action:'RETIRE',kind:'RULE'}:{}),rows:original.rows.map((r,i)=>({...r,...(c.rows[i]==='ABSENT'?{}:{global:c.rows[i]}),...(c.retire?{action:'RETIRE',kind:'RULE'}:{})}))};const before=await digest(),response=await call(basePath+'/batch-confirm','POST',body),after=await digest();
   proof.batch_effective_rows??=[];proof.batch_effective_rows.push({name:c.name,body,status:response.status,response:response.body,before,after});
   if(c.allow){assertWrites({response,before,after},true);assert.ok(response.body.results.every(r=>r.action==='APPROVE'&&r.kind==='EXACT'));const replay=await call(basePath+'/batch-confirm','POST',body);assert.equal(replay.status,200);assert.equal(replay.body.reused,true);assert.deepEqual(await digest(),after);}else denial({response,before,after});await resetAuthority();
  });
  await check('Single nonRETIRE global flag requires admin regardless EXACT/RULE/DRAFT',async()=>{
   await resetAuthority('manager');for(const kind of ['EXACT','RULE'])for(const action of ['DRAFT','APPROVE']){const body={...await prepare(),kind,action,global:true},before=await digest(),response=await call(basePath+'/decisions','POST',body);denial({response,before,after:await digest()});}await resetAuthority();
  });
 }
 await check('No idle transactions after all barriers',async()=>{assert.equal(Number((await admin.query("select count(*) n from pg_stat_activity where datname='fixture_owned' and state='idle in transaction'")).rows[0].n),0);});
}catch(e){proof.failures.push({name:'runner',error:e.stack?.replaceAll(secret,'[redacted]')});console.log('FAIL runner '+e.message.replaceAll(secret,'[redacted]'));}
finally{
 if(api&&api.exitCode===null&&api.signalCode===null){const done=once(api,'exit');api.kill();await Promise.race([done,delay(5000)]);}proof.api_stopped=!api||api.exitCode!==null||api.signalCode!==null;
 await pool?.end();await admin?.end();if(cid){try{owned();docker(['rm','-f',cid]);proof.owned_container_removed=true;}catch(e){proof.failures.push({name:'owned cleanup',error:e.message});}}
 await verifyPins();proof.pins_unchanged=true;proof.finished_at=new Date().toISOString();const target=stage+'/integration-result-'+Date.now()+'.json';await writeFile(target,JSON.stringify(proof,null,2));await writeFile(target.replace('.json','.log'),logs.replaceAll(secret,'[redacted]'));if(storage){const resolved=path.resolve(storage);assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(resolved).startsWith('item5-consumption-tester-'));await rm(resolved,{recursive:true,force:true});}console.log(JSON.stringify({passed:proof.passed.length,failed:proof.failures.length,proof:target,api_stopped:proof.api_stopped,owned_container_removed:proof.owned_container_removed}));if(proof.failures.length||!proof.api_stopped||!proof.owned_container_removed)process.exitCode=1;
}
