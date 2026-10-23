// Reuses the unprivileged, hosted-fetch-disabled, owned database harness.
import assert from 'node:assert/strict';
import { randomUUID,randomBytes,scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { build } from 'esbuild';

async function runtimeHelper(relativePath){const result=await build({entryPoints:[fileURLToPath(new URL(relativePath,import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}

export async function runPayrollReadinessTests({pool,base,token,admin,must}){
  const passed=[],failures=[],key=()=>randomUUID();
  const check=async(name,action)=>{try{await action();passed.push(name);console.log('PASS '+name);}catch(error){failures.push({name,error:error.stack});console.log('FAIL '+name+': '+error.message);}};
  const request=async(route,method='GET',body,credential=token)=>{const r=await fetch(base+route,{method,headers:{origin:'https://crm.example.com',...(credential?{authorization:'Bearer '+credential}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return {status:r.status,body:await r.json().catch(()=>null)};};
  const ok=async(...args)=>{const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.body;};
  const deny=(r,status)=>status?assert.equal(r.status,status,JSON.stringify(r)):assert.ok(r.status>=400,JSON.stringify(r));
  const actor=async(role)=>{const id=key(),email=id+'@readiness.invalid',password='ReadinessFixtureOnly!222',salt=randomBytes(16).toString('hex');await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,email,`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);await pool.query('insert into local_user_roles(user_id,role)values($1,$2)',[id,role]);return {id,token:(await must('/api/local-auth/login','POST',{email,password})).token};};
  const employee=await actor('employee'),manager=await actor('manager'),otherEmployee=await actor('employee');
  const newWorker=async(extra={})=>ok('/api/workers','POST',{employee_code:'READY-'+key(),display_name:'Synthetic readiness worker',worker_type:'HELPER',...extra});
  const patch=(w,body,credential=token)=>request('/api/payroll/workers/'+w.id,'PATCH',{reason:'Readiness worker correction',...body},credential);
  const dbWorker=async w=>(await pool.query('select * from local_workers where id=$1',[w.id])).rows[0];
  const audit=async w=>(await pool.query("select * from local_payroll_audit_events where entity_type='payroll_workers' and entity_id=$1 order by id",[w.id])).rows;
  const profileState=async()=> (await pool.query("select jsonb_build_object('form',(select to_jsonb(f) from local_employee_profile_forms f where user_id=$1),'user',(select to_jsonb(u) from local_user_profiles u where user_id=$1),'links',(select jsonb_agg(to_jsonb(w) order by id) from local_workers w where user_id=$1),'audit',(select jsonb_agg(to_jsonb(a) order by id) from local_employee_profile_audit_events a where user_id=$1),'history',(select jsonb_agg(to_jsonb(h) order by id) from local_employee_profile_history h where user_id=$1),'auth_audit',(select jsonb_agg(to_jsonb(a) order by id) from local_auth_audit_events a where entity_id=$1)) state",[employee.id])).rows[0].state;
  const submit=values=>ok('/api/my-profile/submit','POST',{profile:{first_name:'QA',last_name:'Person',phone:'0900000000',...values}},employee.token);
  const revision=async()=>{const rows=await ok('/api/profile-requests');const row=rows.find(x=>x.user_id===employee.id);assert.ok(row,'Submitted request visible');assert.match(String(row.revision),/^[1-9]\d*$/);return row.revision;};
  const review=(decision,expected,worker,credential=manager.token)=>request('/api/profile-requests/'+employee.id+'/review','POST',{decision,note:'Synthetic review reason',...(worker?{worker_id:worker.id}:{}),...(expected===undefined?{}:{expected_revision:expected})},credential);
  const link=await newWorker();
  await submit({first_name:'Approved baseline'});let r=await revision();assert.equal((await review('APPROVED',r,link)).status,200);
  for(const decision of ['APPROVED','NEEDS_INFO']){
    await check('profile '+decision+' refuses missing malformed and unauthorized revision without any writes',async()=>{
      await submit({first_name:'Current '+decision});const current=await revision(),before=await profileState();
      for(const bad of [undefined,null,'','abc','1.2',-1,{},'9007199254740993123456789']){deny(await review(decision,bad,link));assert.deepEqual(await profileState(),before);}
      deny(await review(decision,current,link,otherEmployee.token),403);assert.deepEqual(await profileState(),before);
    });
    await check('profile '+decision+' rejects stale viewed revision after employee edits and resubmits',async()=>{
      await submit({first_name:'Viewed A '+decision});const viewed=await revision();await ok('/api/my-profile','PATCH',{profile:{first_name:'Unseen B '+decision}},employee.token);await submit({first_name:'Unseen B '+decision});const current=await revision();assert.notEqual(String(current),String(viewed));const before=await profileState();deny(await review(decision,viewed,link),409);assert.deepEqual(await profileState(),before);
      assert.equal((await review(decision,current,link)).status,200);const after=await profileState();assert.equal(after.form.status,decision);assert.equal(after.form.reviewed_by,manager.id);assert.equal(after.audit.at(-1)?.actor_id===manager.id||after.audit.some(x=>x.actor_id===manager.id),true);if(decision==='APPROVED'){assert.equal(after.form.approved_data.first_name,'Unseen B '+decision);assert.equal(String(after.form.approved_revision),String(current));assert.equal(after.links[0].id,link.id);}
    });
  }
  await check('simultaneous reviewers cannot both decide one viewed profile revision',async()=>{
    await submit({first_name:'Concurrent review'});const current=await revision(),before=await profileState();const result=await Promise.all([review('APPROVED',current,link),review('NEEDS_INFO',current,link,token)]);assert.equal(result.filter(x=>x.status===200).length,1,JSON.stringify(result));assert.equal(result.filter(x=>x.status>=400).length,1,JSON.stringify(result));const after=await profileState();assert.equal(after.audit.length,before.audit.length+1);assert.equal(after.history.length,before.history.length+1);
  });
  await check('profile approval audit failure rolls back approved snapshot user link and review metadata',async()=>{
    await submit({first_name:'Must rollback'});const current=await revision(),before=await profileState();await pool.query("create function qa_fail_profile_audit() returns trigger language plpgsql as $$ begin if NEW.action='APPROVE' then raise exception 'QA injected profile audit failure'; end if; return NEW; end $$;create trigger qa_fail_profile_audit before insert on local_employee_profile_audit_events for each row execute function qa_fail_profile_audit()");try{deny(await review('APPROVED',current,link));}finally{await pool.query('drop trigger qa_fail_profile_audit on local_employee_profile_audit_events;drop function qa_fail_profile_audit()');}assert.deepEqual(await profileState(),before);
  });
  await check('worker PATCH validates real dates enums and merged start/end/status before writing',async()=>{
    const w=await newWorker();assert.equal((await patch(w,{employment_start_date:'2026-01-10',employment_end_date:'2026-08-10',payroll_status:'ACTIVE'})).status,200);const before=await dbWorker(w),events=await audit(w);
    for(const body of [{employment_start_date:'2026-08-11'},{employment_end_date:'2026-01-09'},{employment_start_date:'2026-02-30'},{employment_end_date:'2026-13-01'},{employmentStartDate:'2026-02-29'},{payroll_status:'UNKNOWN'},{payroll_status:null}]){deny(await patch(w,body));assert.deepEqual(await dbWorker(w),before);assert.deepEqual(await audit(w),events);}
    assert.equal((await patch(w,{employment_start_date:'2024-02-29',employment_end_date:'2026-08-10',payroll_status:'TERMINATED'})).status,200);
  });
  await check('worker PATCH requires terminated end date and supports intentional null clear using merged state',async()=>{
    const w=await newWorker();assert.equal((await patch(w,{employment_start_date:'2026-01-10'})).status,200);deny(await patch(w,{payroll_status:'TERMINATED'}));assert.equal((await patch(w,{employment_end_date:'2026-08-10',payroll_status:'TERMINATED'})).status,200);const before=await dbWorker(w);deny(await patch(w,{employment_end_date:null}));assert.deepEqual(await dbWorker(w),before);
    assert.equal((await patch(w,{payroll_status:'ACTIVE',employment_end_date:null})).status,200);assert.equal((await dbWorker(w)).employment_end_date,null);assert.equal((await patch(w,{employment_start_date:null,location_code:null,position_title:null})).status,200);const cleared=await dbWorker(w);assert.equal(cleared.employment_start_date,null);assert.equal(cleared.location_code,null);assert.equal(cleared.position_title,null);
  });
  await check('worker PATCH requires nonblank reason before master or audit writes',async()=>{
    const w=await newWorker(),before=await dbWorker(w),events=await audit(w);
    for(const reason of [undefined,null,'','   ']){deny(await request('/api/payroll/workers/'+w.id,'PATCH',{position_title:'Missing reason',...(reason===undefined?{}:{reason})}));assert.deepEqual(await dbWorker(w),before);assert.deepEqual(await audit(w),events);}
  });
  await check('worker PATCH audit actor is authenticated caller and unauthorized request cannot write',async()=>{
    const w=await newWorker(),before=await dbWorker(w);deny(await patch(w,{position_title:'Unauthorized'},otherEmployee.token),403);assert.deepEqual(await dbWorker(w),before);assert.equal((await patch(w,{position_title:'Reviewed role',actor_id:otherEmployee.id,reason:'Caller-owned audit'},manager.token)).status,200);const events=await audit(w),updated=events.find(x=>x.action==='UPDATE'&&x.reason==='Caller-owned audit');assert.equal(updated.actor_id,manager.id);assert.notEqual(updated.actor_id,otherEmployee.id);assert.notEqual(manager.id,admin);
  });
  await check('worker PATCH injected audit failure atomically rolls back worker and permits safe retry',async()=>{
    const w=await newWorker(),before=await dbWorker(w),events=await audit(w);await pool.query("create function qa_fail_worker_audit() returns trigger language plpgsql as $$ begin if NEW.entity_type='payroll_workers' and NEW.action='UPDATE' then raise exception 'QA injected worker audit failure'; end if; return NEW; end $$;create trigger qa_fail_worker_audit before insert on local_payroll_audit_events for each row execute function qa_fail_worker_audit()");try{const result=await patch(w,{position_title:'Must rollback',reason:'Audit atomic QA'});deny(result);assert.match(JSON.stringify(result.body),/QA injected/);}finally{await pool.query('drop trigger qa_fail_worker_audit on local_payroll_audit_events;drop function qa_fail_worker_audit()');}assert.deepEqual(await dbWorker(w),before);assert.deepEqual(await audit(w),events);assert.equal((await patch(w,{position_title:'Safe retry'})).status,200);
  });
  const group=await ok('/api/payroll/policy-groups','POST',{code:'READY-'+key(),name:'Readiness fixture group',reason:'isolated QA'});
  const bundleBody=w=>({worker_id:w.id,compensation_type:'MONTHLY_HELPER',payroll_policy_group_id:group.id,effective_from:'2026-01-01',primary_amount:2600000,reason:'Readiness bundle',idempotency_key:key()});
  const configState=async w=>(await pool.query("select jsonb_build_object('worker',(select to_jsonb(w) from local_workers w where id=$1),'assignments',(select jsonb_agg(to_jsonb(x)order by id)from local_worker_compensation_assignments x where worker_id=$1),'rates',(select jsonb_agg(to_jsonb(x)order by id)from local_worker_rates x where worker_id=$1),'profiles',(select jsonb_agg(to_jsonb(x)order by id)from local_worker_payroll_profiles x where worker_id=$1),'receipts',(select jsonb_agg(to_jsonb(x)order by idempotency_key)from local_payroll_bundle_approvals x where worker_id=$1),'audit',(select jsonb_agg(to_jsonb(x)order by id)from local_payroll_audit_events x where entity_id=$1))state",[w.id])).rows[0].state;
  await check('bundle shares merged real-date and terminated validation without config or receipt writes',async()=>{
    const w=await newWorker();assert.equal((await patch(w,{employment_start_date:'2026-01-10',employment_end_date:'2026-08-10'})).status,200);const before=await configState(w);
    for(const fields of [{employment_start_date:'2026-08-11',employment_end_date:'2026-08-10'},{employment_start_date:'2026-01-10',employment_end_date:'2026-01-09'},{employment_start_date:'2026-02-30'},{payroll_status:'TERMINATED',employment_end_date:null}]){deny(await request('/api/payroll/worker-profile-bundle','POST',{...bundleBody(w),...fields}));assert.deepEqual(await configState(w),before);}
  });
  await check('bundle committed exact receipt replays and changed payload conflicts without duplicate versions',async()=>{
    const w=await newWorker(),body={...bundleBody(w),employment_start_date:'2024-02-29',employment_end_date:null,payroll_status:'ACTIVE'};const first=await ok('/api/payroll/worker-profile-bundle','POST',body);const before=await configState(w);const replay=await ok('/api/payroll/worker-profile-bundle','POST',body);assert.equal(replay.reused,true);assert.equal(replay.assignment.id,first.assignment.id);assert.deepEqual(await configState(w),before);deny(await request('/api/payroll/worker-profile-bundle','POST',{...body,primary_amount:2700000}),409);assert.deepEqual(await configState(w),before);
  });
  await check('bundle retains full replacement master semantics when optional fields are omitted',async()=>{
    const w=await newWorker();assert.equal((await patch(w,{employment_start_date:'2026-01-10',employment_end_date:'2026-08-10',location_code:'KEEP-ONLY-WHEN-PATCHED',position_title:'Old position',payroll_status:'SUSPENDED'})).status,200);
    await ok('/api/payroll/worker-profile-bundle','POST',bundleBody(w));const current=await dbWorker(w);assert.equal(current.employment_start_date,null);assert.equal(current.employment_end_date,null);assert.equal(current.location_code,null);assert.equal(current.position_title,null);assert.equal(current.payroll_status,'ACTIVE');
  });
  await check('actual overtime retry helper preserves key after committed response loss and API stores one source',async()=>{
    const {overtimeRetryKey}=await runtimeHelper('../src/lib/attendance-retry.ts'),w=await newWorker(),otEmployee=await actor('employee');await pool.query('update local_workers set user_id=$2 where id=$1',[w.id,otEmployee.id]);const bundle=await ok('/api/payroll/worker-profile-bundle','POST',{...bundleBody(w),overtime_enabled:true});for(const[route,item]of[['compensation-assignments',bundle.assignment],['rates',bundle.rate],['worker-profiles',bundle.profile]])if(item)await ok('/api/payroll/'+route+'/'+item.id+'/approve','POST',{reason:'Readiness OT approved fixture'});
    const keys=new Map(),payload={worker_id:w.id,work_date:'2026-09-15',overtime_type:'NORMAL_OVERTIME',overtime_minutes:60,reason:'Retry after response loss'};let generated=0;const make=()=>{generated++;return key();};
    const first=overtimeRetryKey(keys,payload,make),send=retry=>ok('/api/my-attendance/overtime','POST',{work_date:payload.work_date,overtime_type:payload.overtime_type,overtime_minutes:payload.overtime_minutes,reason:payload.reason,idempotency_key:retry.key},otEmployee.token);
    await send(first); // Treat the response as lost: leave the helper's pending key in place.
    const retry=overtimeRetryKey(keys,{...payload,reason:'  '+payload.reason+'  '},make);assert.equal(retry.key,first.key);assert.equal(generated,1);await send(retry);
    assert.equal((await pool.query('select count(*)::int n from local_overtime where worker_id=$1 and work_date=$2',[w.id,payload.work_date])).rows[0].n,1);
    keys.delete(retry.fingerprint);assert.notEqual(overtimeRetryKey(keys,payload,make).key,first.key,'Known success permits a later intentional request');
  });
  await check('Excel NHAN_SU validates merged worker state and rolls back preceding workbook changes',async()=>{
    const w=await newWorker();assert.equal((await patch(w,{employment_start_date:'2026-01-10',employment_end_date:'2026-08-10'})).status,200);const before=await dbWorker(w),newCode='READY-ROLLBACK-'+key();const book={template_key:'payroll-v1',source_name:'qa-readiness.xlsx',rows:[{sheet:'NHAN_SU',row:2,values:{ma_nv:newCode,ho_ten:'Must rollback'}},{sheet:'NHAN_SU',row:3,values:{ma_nv:w.employee_code,ho_ten:'Must preserve',ngay_vao:'2026-09-01'}}]};const p=await ok('/api/payroll/import/preview','POST',book);deny(await request('/api/payroll/import/apply','POST',{...book,fingerprint:p.fingerprint,preview_token:p.preview_token}));assert.deepEqual(await dbWorker(w),before);assert.equal((await pool.query('select count(*)::int n from local_workers where employee_code=$1',[newCode])).rows[0].n,0);
    const terminated={...book,source_name:'qa-terminated.xlsx',rows:[{sheet:'NHAN_SU',row:2,values:{ma_nv:'READY-TERM-'+key(),ho_ten:'No termination date',trang_thai_luong:'TERMINATED'}}]},q=await ok('/api/payroll/import/preview','POST',terminated);deny(await request('/api/payroll/import/apply','POST',{...terminated,fingerprint:q.fingerprint,preview_token:q.preview_token}));
  });
  console.log(JSON.stringify({suite:'readiness',passed:passed.length,failed:failures.length,failures},null,2));if(failures.length)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const child=spawn(process.execPath,['scripts/test-payroll-integrity-isolated.mjs','--readiness',...process.argv.slice(2)],{cwd:new URL('..',import.meta.url),windowsHide:true,stdio:'inherit',env:process.env});const[code]=await once(child,'exit');process.exitCode=code;}
