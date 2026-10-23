// Own disposable PostgreSQL database only. Never loads .env or hosted data.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { approveLegacyPayrollFixture } from './payroll-approved-fixtures.mjs';

const suffix = process.pid + '_' + Date.now(), database = 'attendance_redesign_qa_' + suffix, role = 'attendance_redesign_role_' + suffix;
const secret = randomBytes(24).toString('hex'), connectionString = `postgres://${role}:${secret}@127.0.0.1:55432/${database}`;
const baseline = process.argv.includes('--baseline');
const control = sql => {
  const result = spawnSync('docker', ['exec', 'crm-joliefam-local-postgres', 'psql', '-U', 'crm_local', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Disposable SQL control failed: ' + result.stderr);
  return result.stdout;
};
let api, pool, base, token, created = false, logs = '';
const findings = [], failures = [];
const call = async (path, method = 'GET', body) => {
  if (pool && !process.argv.includes('--policies') && !process.argv.includes('--optimization') && !process.argv.includes('--console')) {
    const query = new URL(path, 'http://fixture.invalid').searchParams;
    const start = body?.period_start || query.get('period_start'), end = body?.period_end || query.get('period_end');
    if (start && end && (/^\/api\/payroll\/preflight\?/.test(path) || (path === '/api/payroll/runs' && method === 'POST'))) await approveLegacyPayrollFixture(pool,start,end,body?.standard_days || query.get('standard_days') || 26);
  }
  const response = await fetch(base + path, { method, headers: { origin: 'https://crm.example.com', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const must = async (path, method = 'GET', body) => { const r = await call(path, method, body); assert.ok(r.status < 300, path + ': ' + JSON.stringify(r)); return r.body; };
const check = async (label, action) => { try { await action(); findings.push(label); console.log('PASS ' + label); } catch (error) { failures.push({ label, error: error.message }); console.log('FAIL ' + label + ': ' + error.message); } };
const key = () => randomUUID();
async function worker(start, overtime = false) {
  await pool.query("update local_workers set payroll_status='SUSPENDED' where payroll_status='ACTIVE'");
  const w = await must('/api/workers', 'POST', { employee_code: 'PI-' + key(), display_name: 'Payroll integrity fixture', worker_type: 'HELPER' });
  const group = await must('/api/payroll/policy-groups', 'POST', { code: 'PI-' + key(), name: 'Payroll integrity fixture', reason: 'isolated QA' });
  const bundle = await must('/api/payroll/worker-profile-bundle', 'POST', { worker_id: w.id, compensation_type: 'MONTHLY_HELPER', payroll_policy_group_id: group.id, effective_from: start, primary_amount: 2600000, overtime_enabled: overtime, reason: 'isolated QA', idempotency_key: key() });
  for (const [path, item] of [['compensation-assignments', bundle.assignment], ['rates', bundle.rate], ['worker-profiles', bundle.profile]]) if (item) await must('/api/payroll/' + path + '/' + item.id + '/approve', 'POST', { reason: 'isolated QA' });
  return { ...w, bundle };
}
const period = (month, workerId) => ({ period_start: `2026-${month}-01`, period_end: `2026-${month}-${['04','06','09','11'].includes(month) ? '30' : '31'}`, standard_days: 26, worker_ids: [workerId], idempotency_key: key() });
const preview = body => must('/api/payroll/runs', 'POST', body);
async function attendance(w, date) {
  const row = await must('/api/attendance', 'POST', { worker_id: w.id, attendance_method: 'DAY', work_date: date, day_units: 1, idempotency_key: key() });
  await must('/api/attendance/status', 'POST', { attendance_record_id: row.id, target_status: 'APPROVED', reason: 'isolated QA', idempotency_key: key() }); return row;
}
try {
  control(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${secret}'`); control(`create database ${database} owner ${role}`); created = true;
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening'); const port = listener.address().port; await new Promise(resolve => listener.close(resolve)); base = 'http://127.0.0.1:' + port;
  api = spawn(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent('globalThis.fetch=async()=>{throw new Error("QA denies hosted requests")};'), 'server-dist/index.js'], { cwd: new URL('..', import.meta.url), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'production', PUBLIC_APP_URL: 'https://crm.example.com', LOCAL_DATABASE_URL: connectionString, LOCAL_API_PORT: String(port), LOCAL_API_HOST: '127.0.0.1', LOCAL_SYNC_AUTO: 'false', LOCAL_AUTH_SUPABASE_BRIDGE: 'false', LOCAL_DEMO_AUTH: 'false', LOCAL_INTEGRATION_API: 'false' } });
  api.stdout.on('data', x => logs += x); api.stderr.on('data', x => logs += x);
  let ready = false; for (let n = 0; n < 160; n++) { if (api.exitCode !== null) throw new Error('QA API exited before health'); try { if ((await (await fetch(base + '/health')).json()).database === database) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 250)); } assert.ok(ready, 'Disposable API ready');
  pool = new pg.Pool({ connectionString }); assert.equal((await pool.query('select current_database() db')).rows[0].db, database); assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper, false);
  const admin = randomUUID(), password = 'PayrollFixtureOnly!222', salt = randomBytes(16).toString('hex'), hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
  await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)', [admin, 'payroll-integrity@fixture.invalid', hash]); await pool.query("insert into local_user_roles(user_id,role)values($1,'admin')", [admin]); token = (await must('/api/local-auth/login', 'POST', { email: 'payroll-integrity@fixture.invalid', password })).token;

  const date='2026-09-15';
  const w=await worker('2026-09-01',true);
  const employee=randomUUID(), salt2=randomBytes(16).toString('hex'), pass2='AttendanceFixtureOnly!222';
  await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[employee,'attendance-employee@fixture.invalid',`scrypt$${salt2}$${scryptSync(pass2,salt2,64).toString('hex')}`]);
  await pool.query("insert into local_user_roles(user_id,role)values($1,'employee')",[employee]);await pool.query('update local_workers set user_id=$2 where id=$1',[w.id,employee]);
  const employeeToken=(await must('/api/local-auth/login','POST',{email:'attendance-employee@fixture.invalid',password:pass2})).token;
  const self=async(path,method='GET',body)=>{const old=token;try{token=employeeToken;return await call(path,method,body);}finally{token=old;}};
  const summary=()=>must('/api/attendance/day-summary?worker_id='+w.id+'&date='+date);
  const fact=await must('/api/attendance','POST',{worker_id:w.id,attendance_method:'DAY',work_date:date,day_units:1,idempotency_key:key()});
  await check('pending attendance cannot be sealed via API or direct SQL',async()=>{
    let x=await summary();assert.ok(Number(x.current_revision)>0);
    assert.equal((await call('/api/attendance/closures','POST',{worker_id:w.id,work_date:date,target_status:'EMPLOYEE_CONFIRMED',expected_revision:x.current_revision,reason:'proxy QA',idempotency_key:key()})).status,200);
    x=await summary();assert.equal((await call('/api/attendance/closures','POST',{worker_id:w.id,work_date:date,target_status:'LEADER_CONFIRMED',expected_revision:x.current_revision,idempotency_key:key()})).status,400);
    await assert.rejects(pool.query("update local_day_closures set status='LEADER_CONFIRMED' where worker_id=$1 and work_date=$2",[w.id,date]),/chờ duyệt/);
  });
  await check('approval metadata does not stale confirmation; notes and new OT do',async()=>{
    const before=await summary();await must('/api/attendance/status','POST',{attendance_record_id:fact.id,target_status:'APPROVED',idempotency_key:key()});
    const approved=await summary();assert.equal(approved.current_revision,before.current_revision);assert.equal(approved.confirmation_current,true);
    await pool.query("update local_attendance set notes='meaningful changed content' where id=$1",[fact.id]);
    const stale=await summary();assert.ok(Number(stale.current_revision)>Number(approved.current_revision));assert.equal(stale.confirmation_current,false);
    const reject=await self('/api/my-attendance/day-confirm','POST',{work_date:date,expected_revision:approved.current_revision,idempotency_key:key()});assert.equal(reject.status,409);
    const confirmed=await self('/api/my-attendance/day-confirm','POST',{work_date:date,expected_revision:stale.current_revision,idempotency_key:key()});assert.equal(confirmed.status,200,JSON.stringify(confirmed));
    await must('/api/attendance/overtime','POST',{worker_id:w.id,work_date:date,overtime_type:'NORMAL_OVERTIME',overtime_minutes:60,reason:'OT QA',idempotency_key:key()});assert.equal((await summary()).confirmation_current,false);
  });
  await check('atomic proxy approve and seal requires reason and replays once',async()=>{
    const current=await summary(), request={worker_id:w.id,work_date:date,expected_revision:current.current_revision,source_fingerprint:current.source_fingerprint,proxy_confirm:true,idempotency_key:key()};
    assert.equal((await call('/api/attendance/approve-close','POST',request)).status,403);
    const body={...request,reason:'Employee unavailable; manager reviewed all sources'};
    const result=await must('/api/attendance/approve-close','POST',body);assert.equal(result.status,'LEADER_CONFIRMED');assert.equal(result.confirmation_kind,'PROXY');assert.equal(result.confirmation_actor_id,admin);assert.equal(result.confirmation_reason,body.reason);
    assert.equal((await must('/api/attendance/approve-close','POST',body)).reused,true);assert.equal((await summary()).sources.some(x=>x.status==='SUBMITTED'),false);
  });
  await check('empty day confirmation blocked; self summary ignores another worker injection',async()=>{
    const result=await self('/api/my-attendance/day-summary?date=2026-09-16&worker_id='+randomUUID());assert.equal(result.body.worker_id,w.id);
    assert.ok((await self('/api/my-attendance/day-confirm','POST',{work_date:'2026-09-16',expected_revision:'0',idempotency_key:key()})).status>=400);
  });
  await check('bulk preview exposes exact IDs counts and rejects expanded scope atomically',async()=>{
    const input={month:'2026-09',worker_ids:[w.id],source_types:['ATTENDANCE','PRODUCTION_ENTRY','OVERTIME'],target_status:'APPROVED'};
    const a=await must('/api/attendance','POST',{worker_id:w.id,attendance_method:'DAY',work_date:'2026-09-17',day_units:1,idempotency_key:key()});
    const preview=await must('/api/attendance/bulk-preview','POST',input);assert.equal(preview.record_count,1);assert.equal(preview.worker_day_count,1);assert.equal(preview.candidates[0].id,a.id);assert.ok(!JSON.stringify(preview).includes('sourceSignature'));assert.ok(!JSON.stringify(preview).includes('rate_amount'));
    await must('/api/attendance/overtime','POST',{worker_id:w.id,work_date:'2026-09-17',overtime_type:'NORMAL_OVERTIME',overtime_minutes:30,reason:'added after preview',idempotency_key:key()});
    const stale=await call('/api/attendance/bulk-workflow','POST',{...input,preview_fingerprint:preview.fingerprint,idempotency_key:key()});assert.equal(stale.status,409);assert.equal((await pool.query('select workflow_status from local_attendance where id=$1',[a.id])).rows[0].workflow_status,'SUBMITTED');
    const fresh=await must('/api/attendance/bulk-preview','POST',input);const approved=await must('/api/attendance/bulk-workflow','POST',{...input,preview_fingerprint:fresh.fingerprint,idempotency_key:key()});assert.equal(approved.processed.count,2);
  });
  // Independent adversarial coverage uses only this owned disposable database.
  const onDate=d=>must('/api/attendance/day-summary?worker_id='+w.id+'&date='+d);
  const newAttendance=d=>must('/api/attendance','POST',{worker_id:w.id,attendance_method:'DAY',work_date:d,day_units:1,idempotency_key:key()});
  const newOT=d=>must('/api/attendance/overtime','POST',{worker_id:w.id,work_date:d,overtime_type:'NORMAL_OVERTIME',overtime_minutes:60,reason:'independent QA',idempotency_key:key()});
  const confirm=async d=>{const s=await onDate(d);return must('/api/attendance/closures','POST',{worker_id:w.id,work_date:d,target_status:'EMPLOYEE_CONFIRMED',expected_revision:s.current_revision,reason:'Manager reviewed employee day',idempotency_key:key()});};
  const closeBody=async d=>{const s=await onDate(d);return {worker_id:w.id,work_date:d,expected_revision:s.current_revision,source_fingerprint:s.source_fingerprint,proxy_confirm:true,reason:'Independent QA proxy',idempotency_key:key()};};
  const product=await must('/api/catalog/products','POST',{sku:'REDESIGN-'+key(),name:'Disposable production fixture',piece_rate_code:'QA-'+key(),rate:12500,rate_unit:'PIECE',effective_from:'2026-09-01',rate_reason:'isolated QA'});
  const newProduction=d=>must('/api/production/entries','POST',{worker_id:w.id,product_id:product.id,work_date:d,quantity:3,idempotency_key:key(),notes:'independent QA'});
  await check('OT-only pending blocks leader seal through API and SQL',async()=>{
    const d='2026-09-18';await newOT(d);await confirm(d);const s=await onDate(d);
    assert.equal((await call('/api/attendance/closures','POST',{worker_id:w.id,work_date:d,target_status:'LEADER_CONFIRMED',expected_revision:s.current_revision,idempotency_key:key()})).status,400);
    await assert.rejects(pool.query("update local_day_closures set status='LEADER_CONFIRMED' where worker_id=$1 and work_date=$2",[w.id,d]),/chờ duyệt/);
  });
  await check('production and OT approval preserve semantic revision and confirmation',async()=>{
    const d='2026-09-19',p=await newProduction(d),o=await newOT(d);await confirm(d);const before=await onDate(d);
    await must('/api/production/entries/status','POST',{production_entry_id:p.id,target_status:'APPROVED',reason:'QA',idempotency_key:key()});
    await must('/api/attendance/overtime/status','POST',{overtime_record_id:o.id,target_status:'APPROVED',reason:'QA',idempotency_key:key()});
    const after=await onDate(d);assert.equal(after.current_revision,before.current_revision);assert.equal(after.confirmation_current,true);
  });
  await check('reject resubmit day-status change and reversal invalidate confirmation',async()=>{
    const d='2026-09-20',a=await newAttendance(d);await confirm(d);let before=await onDate(d);
    await must('/api/attendance/status','POST',{attendance_record_id:a.id,target_status:'REJECTED',reason:'Correct this source',idempotency_key:key()});
    let after=await onDate(d);assert.ok(BigInt(after.current_revision)>BigInt(before.current_revision));assert.equal(after.confirmation_current,false);
    before=after;await must('/api/attendance/status','POST',{attendance_record_id:a.id,target_status:'SUBMITTED',reason:'Corrected source',idempotency_key:key()});
    after=await onDate(d);assert.ok(BigInt(after.current_revision)>BigInt(before.current_revision));await confirm(d);
    await must('/api/attendance/day-status','POST',{worker_id:w.id,work_date:d,status:'PRESENT',meal_eligible:false,reason:'Present QA',idempotency_key:key()});assert.equal((await onDate(d)).confirmation_current,false);
    await confirm(d);await pool.query('update local_day_statuses set meal_eligible=true where worker_id=$1 and work_date=$2',[w.id,d]);assert.equal((await onDate(d)).confirmation_current,false);
    await confirm(d);await pool.query("update local_attendance set is_reversed=true,reversal_reason='QA correction' where id=$1",[a.id]);assert.equal((await onDate(d)).confirmation_current,false);
  });
  await check('historical null confirmation must be explicitly reconfirmed',async()=>{
    const d='2026-09-21';await newAttendance(d);await confirm(d);
    await pool.query('alter table local_day_closures disable trigger day_confirmation_revision_guard');
    try{await pool.query('update local_day_closures set confirmed_revision=null,confirmation_kind=null,confirmation_actor_id=null where worker_id=$1 and work_date=$2',[w.id,d]);}finally{await pool.query('alter table local_day_closures enable trigger day_confirmation_revision_guard');}
    assert.equal((await onDate(d)).confirmation_current,false);await confirm(d);assert.equal((await onDate(d)).confirmation_current,true);
  });
  await check('atomic failure after three approvals rolls back sources closure events and receipt',async()=>{
    const d='2026-09-22',a=await newAttendance(d),p=await newProduction(d),o=await newOT(d),body=await closeBody(d);
    const countBefore=(await pool.query('select count(*)::int n from local_attendance_workflow_events')).rows[0].n;
    await pool.query("create function qa_fail_final_seal() returns trigger language plpgsql as $$ begin if NEW.entity_type='DAY_CLOSURE' and NEW.to_status='LEADER_CONFIRMED' then raise exception 'QA injected final audit failure'; end if; return NEW; end $$; create trigger qa_fail_final_seal before insert on local_attendance_workflow_events for each row execute function qa_fail_final_seal()");
    try{const r=await call('/api/attendance/approve-close','POST',body);assert.ok(r.status>=400);assert.match(r.body.error||r.body.message||JSON.stringify(r.body),/QA injected/);}finally{await pool.query('drop trigger qa_fail_final_seal on local_attendance_workflow_events; drop function qa_fail_final_seal()');}
    for(const [table,column,id] of [['local_attendance','workflow_status',a.id],['local_production_entries','workflow_status',p.id],['local_overtime','status',o.id]])assert.equal((await pool.query(`select ${column} status from ${table} where id=$1`,[id])).rows[0].status,'SUBMITTED');
    assert.equal((await onDate(d)).closure,null);assert.equal((await pool.query('select count(*)::int n from local_attendance_day_action_receipts where idempotency_key=$1',[body.idempotency_key])).rows[0].n,0);
    assert.equal((await pool.query('select count(*)::int n from local_attendance_workflow_events')).rows[0].n,countBefore);
    assert.equal((await must('/api/attendance/approve-close','POST',body)).processed,3);
    const eventCount=(await pool.query('select count(*)::int n from local_attendance_workflow_events')).rows[0].n;
    assert.equal((await must('/api/attendance/approve-close','POST',body)).reused,true);assert.equal((await pool.query('select count(*)::int n from local_attendance_workflow_events')).rows[0].n,eventCount);
    assert.equal((await call('/api/attendance/approve-close','POST',{...body,reason:'different reason same key'})).status,409);
  });
  await check('source insertion racing atomic close cannot leave new pending fact in sealed day',async()=>{
    const d='2026-09-23';await newAttendance(d);const body=await closeBody(d);
    const [seal,source]=await Promise.all([call('/api/attendance/approve-close','POST',body),call('/api/attendance/overtime','POST',{worker_id:w.id,work_date:d,overtime_type:'NORMAL_OVERTIME',overtime_minutes:30,reason:'race QA',idempotency_key:key()})]);
    const s=await onDate(d);assert.ok(!(seal.status<300&&source.status<300),'close and inserted source cannot both win');
    if(seal.status<300){assert.equal(s.closure.status,'LEADER_CONFIRMED');assert.ok(s.sources.every(x=>x.status!=='SUBMITTED'));}else{assert.equal(seal.status,409);assert.ok(source.status<300);}
  });
  await check('bulk same ID reject resubmit and changed scope stale with no partial approvals',async()=>{
    const d='2026-09-24',a=await newAttendance(d),input={month:'2026-09',worker_ids:[w.id],source_types:['ATTENDANCE'],target_status:'APPROVED'};
    const reviewed=await must('/api/attendance/bulk-preview','POST',input);
    await must('/api/attendance/status','POST',{attendance_record_id:a.id,target_status:'REJECTED',reason:'QA rejection',idempotency_key:key()});await must('/api/attendance/status','POST',{attendance_record_id:a.id,target_status:'SUBMITTED',reason:'QA resubmit',idempotency_key:key()});
    assert.equal((await call('/api/attendance/bulk-workflow','POST',{...input,preview_fingerprint:reviewed.fingerprint,idempotency_key:key()})).status,409);
    const current=await must('/api/attendance/bulk-preview','POST',input);
    for(const item of current.candidates){assert.deepEqual(Object.keys(item).sort(),['currentStatus','id','sourceType','workDate','workerId'].sort());}
    assert.equal((await call('/api/attendance/bulk-workflow','POST',{...input,source_types:['ATTENDANCE','OVERTIME'],preview_fingerprint:current.fingerprint,idempotency_key:key()})).status,409);
    assert.equal((await pool.query('select workflow_status from local_attendance where id=$1',[a.id])).rows[0].workflow_status,'SUBMITTED');
  });
  await check('employee summary cannot expose another worker or raw financial fields',async()=>{
    const r=await self('/api/my-attendance/day-summary?date=2026-09-19&worker_id='+randomUUID());assert.equal(r.status,200);assert.equal(r.body.worker_id,w.id);
    assert.ok(!/rate_amount|calculated_amount|employee_amount|hourly_rate|monthly_rate|cost_visible/.test(JSON.stringify(r.body)));
    const denied=await self('/api/attendance/day-summary?worker_id='+w.id+'&date=2026-09-19');assert.equal(denied.status,403);
  });
  const createActor=async actorRole=>{
    const id=randomUUID(),email=actorRole+'-'+key()+'@fixture.invalid',password='DisposableActorOnly!333',salt=randomBytes(16).toString('hex');
    await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,email,`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);await pool.query('insert into local_user_roles(user_id,role)values($1,$2)',[id,actorRole]);
    return {id,token:(await must('/api/local-auth/login','POST',{email,password})).token};
  };
  const asActor=async(actor,path,method='GET',body)=>{const saved=token;try{token=actor.token;return await call(path,method,body);}finally{token=saved;}};
  await check('team leader own out-of-team maker revoked permission denied and assigned source accepted',async()=>{
    const leader=await createActor('team_leader');
    await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'production_attendance_approve',true),($1,'production_view',true),($1,'production_operations',true)",[leader.id]);
    const supervisor=await worker('2026-09-01',true);await pool.query('update local_workers set user_id=$2 where id=$1',[supervisor.id,leader.id]);
    const d='2026-09-25';await newAttendance(d);let body=await closeBody(d);body.proxy_confirm=false;
    assert.equal((await asActor(leader,'/api/attendance/approve-close','POST',body)).status,403);
    await pool.query("insert into local_payroll_team_assignments(supervisor_worker_id,worker_id,effective_from,reason,created_by)values($1,$2,'2026-09-01','QA assignment',$3)",[supervisor.id,w.id,admin]);
    await confirm(d);body=await closeBody(d);body.proxy_confirm=false;
    assert.equal((await asActor(leader,'/api/attendance/approve-close','POST',body)).status,200);
    const own=await must('/api/attendance/day-summary?worker_id='+supervisor.id+'&date='+d);
    assert.equal((await asActor(leader,'/api/attendance/approve-close','POST',{worker_id:supervisor.id,work_date:d,expected_revision:own.current_revision,source_fingerprint:own.source_fingerprint,idempotency_key:key()})).status,403);
    const makerDate='2026-09-26',created=await asActor(leader,'/api/attendance','POST',{worker_id:w.id,attendance_method:'DAY',work_date:makerDate,day_units:1,idempotency_key:key()});assert.ok(created.status<300,JSON.stringify(created));await confirm(makerDate);
    const makerBody={...await closeBody(makerDate),proxy_confirm:false};assert.equal((await asActor(leader,'/api/attendance/approve-close','POST',makerBody)).status,403);
    assert.equal((await onDate(makerDate)).sources[0].status,'SUBMITTED');
    await pool.query("update local_employee_permissions set enabled=false where user_id=$1 and permission_type='production_attendance_approve'",[leader.id]);
    assert.equal((await asActor(leader,'/api/attendance/approve-close','POST',{...makerBody,idempotency_key:key()})).status,403);
    await pool.query("update local_employee_permissions set enabled=true where user_id=$1 and permission_type='production_attendance_approve'",[leader.id]);
    assert.equal((await asActor(leader,'/api/attendance/approve-close','POST',{...makerBody,proxy_confirm:true,idempotency_key:key()})).status,403,'leader never gets manager proxy');
  });
  await check('accountant existing source approval works and manager-only proxy is denied',async()=>{
    const accountant=await createActor('accountant');await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'production_attendance_approve',true),($1,'production_view',true)",[accountant.id]);
    const d='2026-09-27',a=await newAttendance(d);assert.equal((await asActor(accountant,'/api/attendance/status','POST',{attendance_record_id:a.id,target_status:'APPROVED',reason:'Accountant QA',idempotency_key:key()})).status,200);
    assert.equal((await asActor(accountant,'/api/attendance/approve-close','POST',await closeBody(d))).status,403);
    const bulkWorker=await worker('2026-09-01');
    const source=await must('/api/attendance','POST',{worker_id:bulkWorker.id,attendance_method:'DAY',work_date:'2026-09-28',day_units:1,idempotency_key:key()});
    const scope={month:'2026-09',worker_ids:[bulkWorker.id],source_types:['ATTENDANCE'],target_status:'APPROVED',reason:'Accountant approved dedicated bulk source'};
    const reviewed=await asActor(accountant,'/api/attendance/bulk-preview','POST',scope);assert.equal(reviewed.status,200,JSON.stringify(reviewed));assert.equal(reviewed.body.record_count,1);assert.equal(reviewed.body.candidates[0].id,source.id);
    const approved=await asActor(accountant,'/api/attendance/bulk-workflow','POST',{...scope,preview_fingerprint:reviewed.body.fingerprint,idempotency_key:key()});assert.equal(approved.status,200,JSON.stringify(approved));assert.equal(approved.body.processed.count,1);
    assert.equal((await pool.query('select workflow_status from local_attendance where id=$1',[source.id])).rows[0].workflow_status,'APPROVED');
  });
  await check('locked payroll day rejects reopening closure closing source and new facts',async()=>{
    const d='2026-10-01',a=await newAttendance(d);await must('/api/attendance/approve-close','POST',await closeBody(d));
    const periodId=(await pool.query("insert into local_payroll_periods(period_start,period_end,standard_days,status)values('2026-10-01','2026-10-31',26,'OPEN')returning id")).rows[0].id;
    await pool.query("insert into local_payroll_runs(period_id,run_number,status,input_hash,idempotency_key)values($1,1,'LOCKED','qa-locked-snapshot',$2)",[periodId,key()]);
    const revision=(await onDate(d)).current_revision;
    for(const target_status of ['REOPENED','LEADER_CONFIRMED'])assert.ok((await call('/api/attendance/closures','POST',{worker_id:w.id,work_date:d,target_status,reason:'QA locked period',expected_revision:revision,idempotency_key:key()})).status>=400);
    assert.ok((await call('/api/attendance','POST',{worker_id:w.id,attendance_method:'DAY',work_date:d,day_units:0.5,idempotency_key:key()})).status>=400);
    await assert.rejects(pool.query("update local_attendance set notes='locked edit' where id=$1",[a.id]),/khóa|locked/i);
  });
  console.log(JSON.stringify({passed:findings.length,failed:failures.length,failures},null,2));if(failures.length)process.exitCode=1;
} finally {
  if (api && api.exitCode === null) { api.kill(); await Promise.race([once(api, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]); }
  await pool?.end(); if (created) control(`drop database ${database} with (force)`); control(`drop role if exists ${role}`); assert.ok(!logs.includes(secret)); console.log('CLEANUP own disposable payroll database role and API removed');
}
