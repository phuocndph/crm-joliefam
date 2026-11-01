// Focused actual API/PostgreSQL checks. Disposable tmpfs container; no .env or business DB.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {randomBytes,randomUUID,scryptSync} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';

const key=()=>randomUUID(),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const image='sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
const owner=key(),name='attendance-name-only-'+owner,secret=randomBytes(24).toString('hex');
const stage='.local-staging-runtime/attendance-name-only-20261030';
const results=[];let container,control,pool,api,storage,base,token,logs='';
const cleanEnv=()=>Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,(r.stderr||'Docker failed').replaceAll(secret,'[redacted]'));return r.stdout.trim();}
const call=async(url,method='GET',body,auth=token)=>{
 const r=await fetch(base+url,{method,headers:{origin:'https://fixture.invalid',...(auth?{authorization:'Bearer '+auth}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 return {status:r.status,body:await r.json().catch(()=>null)};
};
const must=async(...args)=>{const r=await call(...args);assert.ok(r.status<300,JSON.stringify({url:args[0],...r}));return r.body;};
async function check(label,fn){try{await fn();results.push({label,status:'PASS'});console.log('PASS '+label);}catch(e){results.push({label,status:'FAIL',error:e.stack?.replaceAll(secret,'[redacted]')});console.log('FAIL '+label+': '+e.message.replaceAll(secret,'[redacted]'));}}
const date='2026-09-15';
const day=(worker,d=date)=>({worker_id:worker,attendance_method:'DAY',work_date:d,day_units:1,idempotency_key:key()});
const approve=(id,extra={})=>({attendance_record_id:id,target_status:'APPROVED',reason:'Focused isolated verification',idempotency_key:key(),...extra});
const row=async id=>(await pool.query('select *,rate_amount::text rate_text,calculated_amount::text amount_text from local_attendance where id=$1',[id])).rows[0];
const freshWorker=()=>must('/api/workers','POST',{display_name:'Name only '+key()});
async function approvedRate(worker,method,amount){
 const rate=await must('/api/payroll/rates','POST',{worker_id:worker,compensation_type:method==='DAY'?'MONTHLY_HELPER':'HOURLY',rate_amount:amount,effective_from:'2026-09-01',reason:'Explicit manager-entered fixture amount'});
 await must('/api/payroll/rates/'+rate.id+'/approve','POST',{reason:'Explicit approval in disposable test'});
 return rate;
}
try{
 await mkdir(stage,{recursive:true});
 container=docker(['run','--pull=never','-d','--name',name,'--label','crm.qa.owner='+owner,'--tmpfs','/var/lib/postgresql/data:rw,size=536870912','-p','127.0.0.1::5432','-e','POSTGRES_USER=fixture_owner','-e','POSTGRES_PASSWORD='+secret,'-e','POSTGRES_DB=fixture_control',image]);
 const inspection=JSON.parse(docker(['inspect',container]))[0];assert.equal(inspection.Config.Labels['crm.qa.owner'],owner);assert.equal(inspection.Image,image);
 const binding=inspection.NetworkSettings.Ports['5432/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');
 const port=binding.HostPort;control=new pg.Pool({connectionString:`postgres://fixture_owner:${secret}@127.0.0.1:${port}/fixture_control`});
 let ready=false;for(let i=0;i<100;i++){try{await control.query('select 1');ready=true;break;}catch{}await delay(100);}assert.ok(ready,'Disposable PostgreSQL ready');
 await control.query(`create role fixture_app login nosuperuser nocreatedb nocreaterole password '${secret}'`);await control.query('create database name_only_fixture owner fixture_app');
 const connectionString=`postgres://fixture_app:${secret}@127.0.0.1:${port}/name_only_fixture`;pool=new pg.Pool({connectionString});
 storage=await mkdtemp(path.join(tmpdir(),'name-only-attendance-'));
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const apiPort=listener.address().port;await new Promise(r=>listener.close(r));base='http://127.0.0.1:'+apiPort;
 const denyFetch='globalThis.fetch=async()=>{throw Error("Test denies external requests")};';
 api=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(denyFetch),'server-dist/index.js'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...cleanEnv(),NODE_ENV:'production',PUBLIC_APP_URL:'https://fixture.invalid',LOCAL_ALLOWED_ORIGINS:'https://fixture.invalid',LOCAL_DATABASE_URL:connectionString,LOCAL_STORAGE_ROOT:storage,LOCAL_API_HOST:'127.0.0.1',LOCAL_API_PORT:String(apiPort),LOCAL_DB_STARTUP_MODE:'normal',LOCAL_SYNC_AUTO:'false',LOCAL_INTEGRATION_API:'false',LOCAL_ZCRM_API:'false',LOCAL_DEMO_AUTH:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false'}});
 api.stdout.on('data',x=>logs+=x);api.stderr.on('data',x=>logs+=x);ready=false;
 for(let i=0;i<300;i++){assert.equal(api.exitCode,null,'Fixture API exited');try{if((await(await fetch(base+'/health',{signal:AbortSignal.timeout(1000)})).json()).database==='name_only_fixture'){ready=true;break;}}catch{}await delay(100);}assert.ok(ready,'Fixture API ready');
 assert.equal((await pool.query('select current_database() db')).rows[0].db,'name_only_fixture');
 const actor=key(),password='FixtureOnly!93231',salt=randomBytes(16).toString('hex');
 await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[actor,'name-only@fixture.invalid',`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);await pool.query("insert into local_user_roles(user_id,role)values($1,'admin')",[actor]);
 token=(await must('/api/local-auth/login','POST',{email:'name-only@fixture.invalid',password},null)).token;assert.ok(token);
 let worker,dayRecord,hourRecord;
 await check('1 name alone creates worker without financial/account setup',async()=>{
  worker=await freshWorker();assert.ok(worker.id);assert.equal(worker.user_id,null);
  for(const table of ['local_worker_rates','local_worker_compensation_assignments','local_worker_payroll_profiles','local_payroll_bank_accounts'])assert.equal(Number((await pool.query(`select count(*) n from ${table} where worker_id=$1`,[worker.id])).rows[0].n),0,table);
 });
 await check('2 DAY records actual work with null money and idempotent retry',async()=>{
  const body=day(worker.id);dayRecord=await must('/api/attendance','POST',body);const saved=await row(dayRecord.id);assert.equal(saved.workflow_status,'SUBMITTED');assert.equal(Number(saved.day_units),1);assert.equal(saved.rate_id,null);assert.equal(saved.rate_amount,null);assert.equal(saved.calculated_amount,null);assert.equal(saved.monthly_salary_snapshot,null);assert.equal(dayRecord.calculated_amount,null);
  const retry=await must('/api/attendance','POST',body);assert.equal(retry.id,dayRecord.id);assert.equal(retry.calculated_amount,null);assert.equal(retry.reused,true);
 });
 await check('3 HOUR records hours without inventing rates',async()=>{
  hourRecord=await must('/api/attendance','POST',{worker_id:worker.id,attendance_method:'HOUR',work_date:'2026-09-16',check_in_time:'08:00',check_out_time:'17:00',break_minutes:60,idempotency_key:key()});const saved=await row(hourRecord.id);assert.equal(Number(saved.worked_minutes),480);assert.equal(saved.rate_amount,null);assert.equal(saved.calculated_amount,null);assert.equal(saved.workflow_status,'SUBMITTED');assert.equal(Number((await pool.query('select count(*) n from local_worker_rates where worker_id=$1',[worker.id])).rows[0].n),0);
 });
 await check('4 single and bulk approval reject unpriced facts atomically',async()=>{
  const single=await call('/api/attendance/status','POST',approve(dayRecord.id));assert.ok(single.status>=400,JSON.stringify(single));
  const request={month:'2026-09',worker_ids:[worker.id],source_types:['ATTENDANCE'],target_status:'APPROVED'};const preview=await must('/api/attendance/bulk-preview','POST',request);
  const bulk=await call('/api/attendance/bulk-workflow','POST',{...request,preview_fingerprint:preview.fingerprint,idempotency_key:key()});assert.ok(bulk.status>=400,JSON.stringify(bulk));assert.equal((await row(dayRecord.id)).workflow_status,'SUBMITTED');assert.equal((await row(hourRecord.id)).workflow_status,'SUBMITTED');
 });
 await check('5 approve-close refuses unpriced facts without stale confirmation or writes',async()=>{
  const summary=await must('/api/attendance/day-summary?worker_id='+worker.id+'&date='+date);const before=await row(dayRecord.id);
  const result=await call('/api/attendance/approve-close','POST',{worker_id:worker.id,work_date:date,expected_revision:summary.current_revision,source_fingerprint:summary.source_fingerprint,proxy_confirm:true,reason:'Focused test manager confirmation',idempotency_key:key()});assert.ok(result.status>=400,JSON.stringify(result));const after=await row(dayRecord.id);assert.equal(after.workflow_status,before.workflow_status);assert.equal(after.calculated_amount,null);assert.equal((await must('/api/attendance/day-summary?worker_id='+worker.id+'&date='+date)).current_revision,summary.current_revision);
 });
 await check('6 explicit approved DAY rate hydrates previously unpriced approval exactly once',async()=>{
  const rate=await approvedRate(worker.id,'DAY',2600000);
  const duplicate=(await pool.query("insert into local_worker_rates(worker_id,compensation_type,attendance_method,rate_amount,effective_from,status)values($1,'MONTHLY_HELPER','DAY',2700000,'2026-09-01','APPROVED')returning id",[worker.id])).rows[0];
  const ambiguous=await call('/api/attendance/status','POST',approve(dayRecord.id));assert.ok(ambiguous.status>=400,JSON.stringify(ambiguous));assert.equal((await row(dayRecord.id)).calculated_amount,null);await pool.query('delete from local_worker_rates where id=$1',[duplicate.id]);
  const body=approve(dayRecord.id);await must('/api/attendance/status','POST',body);const saved=await row(dayRecord.id);assert.equal(saved.workflow_status,'APPROVED');assert.equal(saved.rate_id,rate.id);assert.equal(Number(saved.rate_amount),2600000);assert.equal(Number(saved.monthly_salary_snapshot),2600000);assert.equal(Number(saved.calculated_amount),100000);assert.equal((await must('/api/attendance/status','POST',body)).reused,true);
 });
 await check('7 HOUR bulk hydration works and existing priced DAY snapshot stays unchanged',async()=>{
  await approvedRate(worker.id,'HOUR',50000);const request={month:'2026-09',worker_ids:[worker.id],source_types:['ATTENDANCE'],target_status:'APPROVED'};const preview=await must('/api/attendance/bulk-preview','POST',request);await must('/api/attendance/bulk-workflow','POST',{...request,preview_fingerprint:preview.fingerprint,idempotency_key:key()});assert.equal(Number((await row(hourRecord.id)).calculated_amount),400000);assert.equal(Number((await row(dayRecord.id)).calculated_amount),100000);
  const body=day(worker.id,'2026-09-17'),created=await must('/api/attendance','POST',body),before=await row(created.id);assert.equal(Number(before.calculated_amount),100000);await must('/api/attendance/status','POST',approve(created.id));const after=await row(created.id);assert.equal(after.rate_id,before.rate_id);assert.equal(after.amount_text,before.amount_text);
 });
 await check('8 unauthorized creation denied and unpriced rejection remains available',async()=>{
  assert.equal((await call('/api/workers','POST',{display_name:'Unauthorized'},null)).status,401);
  const w=await freshWorker(),fact=await must('/api/attendance','POST',day(w.id));await must('/api/attendance/status','POST',approve(fact.id,{target_status:'REJECTED'}));assert.equal((await row(fact.id)).workflow_status,'REJECTED');assert.equal((await row(fact.id)).calculated_amount,null);
 });
}catch(e){results.push({label:'fixture',status:'FAIL',error:e.stack?.replaceAll(secret,'[redacted]')});console.log('FAIL fixture '+e.message.replaceAll(secret,'[redacted]'));}
finally{
 if(api&&api.exitCode===null&&api.signalCode===null){const exit=once(api,'exit');api.kill();await Promise.race([exit,delay(3000)]);if(api.exitCode===null&&api.signalCode===null)api.kill('SIGKILL');}
 await pool?.end();await control?.end();
 if(container){const actual=JSON.parse(docker(['inspect',container]))[0];assert.equal(actual.Id,container);assert.equal(actual.Name,'/'+name);assert.equal(actual.Config.Labels['crm.qa.owner'],owner);docker(['rm','-f',container]);}
 if(storage){const resolved=path.resolve(storage);assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(resolved).startsWith('name-only-attendance-'));await rm(resolved,{recursive:true,force:true});}
 await mkdir(stage,{recursive:true});const output=path.join(stage,'focused-api-'+Date.now()+'.json');await writeFile(output,JSON.stringify({results,api_stopped:!api||api.exitCode!==null||api.signalCode!==null,container_removed:!!container,source_business_writes:0},null,2));await writeFile(output.replace('.json','.log'),logs.replaceAll(secret,'[redacted]'));
 console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,output}));if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
}
