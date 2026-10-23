// Tests only: unique unprivileged database, production authentication, no .env.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import pg from 'pg';

const suffix = process.pid + '_' + Date.now();
const database = 'closure_import_qa_' + suffix, role = 'closure_import_role_' + suffix;
const secret = randomBytes(24).toString('hex');
const connectionString = `postgres://${role}:${secret}@127.0.0.1:55432/${database}`;
const control = sql => {
  const result = spawnSync('docker', ['exec', 'crm-joliefam-local-postgres', 'psql', '-U', 'crm_local', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Disposable SQL control failed: ' + result.stderr);
  return result.stdout;
};
let api, pool, base, token, admin, created = false, logs = '';
const failures = [], passed = [], key = () => randomUUID();
const call = async (route, method = 'GET', body, actorToken = token) => {
  const response = await fetch(base + route, { method, headers: { origin: 'https://crm.example.com', ...(actorToken ? { authorization: 'Bearer ' + actorToken } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const must = async (...args) => { const r = await call(...args); assert.ok(r.status < 300, args[0] + ': ' + JSON.stringify(r)); return r.body; };
const denied = (r, status) => status ? assert.equal(r.status, status, JSON.stringify(r)) : assert.ok(r.status >= 400, JSON.stringify(r));
const check = async (label, action) => { try { await action(); passed.push(label); console.log('PASS ' + label); } catch (error) { failures.push({ label, error: error.message }); console.log('FAIL ' + label + ': ' + error.message); } };
const makeActor = async actorRole => {
  const id = key(), email = actorRole + '-' + key() + '@fixture.invalid', password = 'DisposableClosureFixture!222', salt = randomBytes(16).toString('hex');
  await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)', [id, email, `scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);
  await pool.query('insert into local_user_roles(user_id,role)values($1,$2)', [id, actorRole]);
  return { id, token: (await must('/api/local-auth/login', 'POST', { email, password }, null)).token };
};
const workbook = rows => ({ template_key: 'payroll-v1', source_name: 'QA-' + key() + '.xlsx', rows });
const closureRow = (worker, date, target = 'EMPLOYEE_CONFIRMED', extra = {}, row = 2) => ({ sheet: 'CHOT_NGAY', row, values: { ma_nv: worker.employee_code, ngay: date, trang_thai_de_nghi: target, ly_do: 'Manager reviewed every source; employee unavailable', ...extra } });
const preview = (body, actor = token) => must('/api/payroll/import/preview', 'POST', body, actor);
const applyBody = (book, reviewed) => ({ ...book, fingerprint: reviewed.fingerprint, preview_token: reviewed.preview_token });
const apply = (book, reviewed, actor = token) => call('/api/payroll/import/apply', 'POST', applyBody(book, reviewed), actor);
const applied = async (...args) => { const r = await apply(...args); assert.equal(r.status,200,JSON.stringify(r)); return r; };
const summary = (worker, date) => must('/api/attendance/day-summary?worker_id=' + worker.id + '&date=' + date);
const newAttendance = (worker, date) => must('/api/attendance', 'POST', { worker_id: worker.id, attendance_method: 'DAY', work_date: date, day_units: 1, idempotency_key: key() });
const newOT = (worker, date) => must('/api/attendance/overtime', 'POST', { worker_id: worker.id, work_date: date, overtime_type: 'NORMAL_OVERTIME', overtime_minutes: 45, reason: 'Disposable OT source', idempotency_key: key() });
const approveAttendance = row => must('/api/attendance/status', 'POST', { attendance_record_id: row.id, target_status: 'APPROVED', reason: 'Reviewed QA source', idempotency_key: key() });
const directConfirm = async (worker, date) => { const s = await summary(worker,date); return must('/api/attendance/closures', 'POST', { worker_id: worker.id, work_date: date, target_status: 'EMPLOYEE_CONFIRMED', expected_revision: s.current_revision, reason: 'Direct canonical QA confirmation', idempotency_key: key() }); };
const closureState = async (worker, date) => (await pool.query('select * from local_day_closures where worker_id=$1 and work_date=$2', [worker.id,date])).rows[0] || null;
const expire = reviewed => pool.query("update local_payroll_import_previews set expires_at=now()-interval '1 minute' where token_hash=$1", [createHash('sha256').update(reviewed.preview_token).digest('hex')]);
let dateIndex = 0;
const nextDate = () => new Date(Date.UTC(2026, 6, ++dateIndex)).toISOString().slice(0,10);

try {
  control(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${secret}'`);
  control(`create database ${database} owner ${role}`); created = true;
  const listener = createServer(); listener.listen(0,'127.0.0.1'); await once(listener,'listening'); const port = listener.address().port; await new Promise(resolve => listener.close(resolve)); base = 'http://127.0.0.1:' + port;
  api = spawn(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent('globalThis.fetch=async()=>{throw new Error("QA denies hosted requests")};'), 'server-dist/index.js'], { cwd: new URL('..',import.meta.url), windowsHide: true, stdio: ['ignore','pipe','pipe'], env: { ...process.env, NODE_ENV: 'production', PUBLIC_APP_URL: 'https://crm.example.com', LOCAL_DATABASE_URL: connectionString, LOCAL_API_PORT: String(port), LOCAL_API_HOST: '127.0.0.1', LOCAL_SYNC_AUTO: 'false', LOCAL_AUTH_SUPABASE_BRIDGE: 'false', LOCAL_DEMO_AUTH: 'false', LOCAL_INTEGRATION_API: 'false' } });
  api.stdout.on('data', x => logs += x); api.stderr.on('data', x => logs += x);
  let ready = false;
  for (let n = 0; n < 160; n++) { if (api.exitCode !== null) throw new Error('QA API exited before health'); try { if ((await (await fetch(base + '/health')).json()).database === database) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve,250)); }
  assert.ok(ready,'Disposable API ready');
  pool = new pg.Pool({ connectionString }); assert.equal((await pool.query('select current_database() db')).rows[0].db,database); assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,false);
  const firstAdmin = await makeActor('admin'); admin = firstAdmin.id; token = firstAdmin.token;
  const otherAdmin = await makeActor('admin');
  const w = await must('/api/workers','POST',{employee_code:'CLOSE-'+key(),display_name:'Disposable closure import worker',worker_type:'HELPER'});
  const group = await must('/api/payroll/policy-groups','POST',{code:'CLOSE-'+key(),name:'Disposable import policy',reason:'isolated QA'});
  const bundle = await must('/api/payroll/worker-profile-bundle','POST',{worker_id:w.id,compensation_type:'MONTHLY_HELPER',payroll_policy_group_id:group.id,effective_from:'2026-01-01',primary_amount:2600000,overtime_enabled:true,reason:'isolated QA',idempotency_key:key()});
  for(const [route,item] of [['compensation-assignments',bundle.assignment],['rates',bundle.rate],['worker-profiles',bundle.profile]])if(item)await must('/api/payroll/'+route+'/'+item.id+'/approve','POST',{reason:'isolated QA'});
  const product = await must('/api/catalog/products','POST',{sku:'CLOSE-'+key(),name:'Disposable closure production',piece_rate_code:'QA-'+key(),rate:12500,rate_unit:'PIECE',effective_from:'2026-01-01',rate_reason:'isolated QA'});
  const newProduction = date => must('/api/production/entries','POST',{worker_id:w.id,product_id:product.id,work_date:date,quantity:3,idempotency_key:key()});

  await check('preview opaque token persists only hash and reviews every day without money or raw signatures',async()=>{
    const dates = [nextDate(),nextDate()]; await newAttendance(w,dates[0]); await newOT(w,dates[1]);
    const book = workbook(dates.map((d,i)=>closureRow(w,d,'EMPLOYEE_CONFIRMED',{},i+2))), p = await preview(book);
    assert.ok(p.preview_token && p.preview_token !== p.fingerprint); assert.equal(p.closure_reviews.length,2);
    assert.deepEqual(p.closure_reviews.map(x=>x.summary.work_date).sort(),dates.sort());
    for(const item of p.closure_reviews){assert.equal(item.employee_code,w.employee_code);assert.equal(item.target_status,'EMPLOYEE_CONFIRMED');assert.equal(item.reason,book.rows[0].values.ly_do);assert.ok(item.summary.sources.length);}
    assert.ok(!/rate_amount|calculated_amount|employee_amount|hourly_rate|monthly_rate|sourceSignature|source_signature/.test(JSON.stringify(p.closure_reviews)));
    const stored=(await pool.query('select * from local_payroll_import_previews where token_hash=$1',[createHash('sha256').update(p.preview_token).digest('hex')])).rows[0];
    assert.equal(stored.actor_id,admin);assert.equal(stored.fingerprint,p.fingerprint);assert.ok(!JSON.stringify(stored).includes(p.preview_token));assert.ok(new Date(stored.expires_at)>new Date());
  });
  await check('valid imported proxy confirmation and seal preserve canonical actor reason revision and audit',async()=>{
    const d=nextDate(), a=await newAttendance(w,d);await approveAttendance(a);
    const confirmBook=workbook([closureRow(w,d)]),cp=await preview(confirmBook);assert.equal((await apply(confirmBook,cp)).status,200);
    const confirmed=await closureState(w,d);assert.equal(confirmed.confirmation_actor_id,admin);assert.equal(confirmed.confirmation_kind,'PROXY');assert.equal(confirmed.confirmation_reason,confirmBook.rows[0].values.ly_do);assert.equal(String(confirmed.confirmed_revision),(await summary(w,d)).current_revision);assert.ok(confirmed.confirmed_at);
    const sealBook=workbook([closureRow(w,d,'LEADER_CONFIRMED')]),sp=await preview(sealBook);await applied(sealBook,sp);
    const sealed=await closureState(w,d);assert.equal(sealed.status,'LEADER_CONFIRMED');assert.equal(sealed.confirmation_actor_id,admin);assert.equal(sealed.confirmation_kind,'PROXY');assert.equal(sealed.confirmation_reason,confirmed.confirmation_reason);assert.equal(String(sealed.confirmed_revision),String(confirmed.confirmed_revision));assert.equal(new Date(sealed.confirmed_at).toISOString(),new Date(confirmed.confirmed_at).toISOString());
    const events=(await pool.query("select * from local_attendance_workflow_events where entity_type='DAY_CLOSURE' and entity_id=$1 order by created_at",[sealed.id])).rows;assert.ok(events.length>=2);assert.ok(events.every(e=>e.actor_id===admin));
  });
  await check('canonical direct leader seal accepts a fresh confirmed day with all sources approved',async()=>{
    const d=nextDate(),a=await newAttendance(w,d);await approveAttendance(a);await directConfirm(w,d);const s=await summary(w,d);
    const result=await call('/api/attendance/closures','POST',{worker_id:w.id,work_date:d,target_status:'LEADER_CONFIRMED',expected_revision:s.current_revision,reason:'Canonical seal after complete review',idempotency_key:key()});
    assert.equal(result.status,200,JSON.stringify(result));assert.equal((await closureState(w,d)).status,'LEADER_CONFIRMED');
  });
  await check('missing forged fingerprint-as-token and expired token cannot mutate an uncommitted workbook',async()=>{
    const d=nextDate();await newAttendance(w,d);const book=workbook([closureRow(w,d)]),p=await preview(book),body=applyBody(book,p);
    for(const candidate of [undefined,key(),p.fingerprint])denied(await call('/api/payroll/import/apply','POST',{...body,preview_token:candidate}));
    await expire(p);denied(await apply(book,p));assert.equal(await closureState(w,d),null);
    assert.equal((await pool.query('select count(*)::int n from local_payroll_import_batches where fingerprint=$1',[p.fingerprint])).rows[0].n,0);
  });
  await check('token cannot cross actor workbook or source name',async()=>{
    const d=nextDate();await newAttendance(w,d);const book=workbook([closureRow(w,d)]),p=await preview(book);
    denied(await apply(book,p,otherAdmin.token));
    const changed=workbook([closureRow(w,d)]),q=await preview(changed);denied(await apply(changed,{...q,preview_token:p.preview_token}));
    denied(await call('/api/payroll/import/apply','POST',{...applyBody(book,p),source_name:'other.xlsx'}));assert.equal(await closureState(w,d),null);
  });
  await check('reason remains mandatory and empty or rejected-only day cannot be confirmed',async()=>{
    const d=nextDate();await newAttendance(w,d);const missing=workbook([closureRow(w,d,'EMPLOYEE_CONFIRMED',{ly_do:''})]),p=await preview(missing);assert.ok(p.invalid_rows>0);denied(await apply(missing,p));
    for(const rejected of [false,true]){const date=nextDate();if(rejected){const a=await newAttendance(w,date);await must('/api/attendance/status','POST',{attendance_record_id:a.id,target_status:'REJECTED',reason:'QA invalid source',idempotency_key:key()});}const book=workbook([closureRow(w,date)]),q=await preview(book);denied(await apply(book,q));assert.equal(await closureState(w,date),null);}
  });
  const staleCase=async(label,change)=>check(label,async()=>{const d=nextDate(),a=await newAttendance(w,d),book=workbook([closureRow(w,d)]),p=await preview(book);await change(d,a);denied(await apply(book,p),409);assert.equal(await closureState(w,d),null);});
  await staleCase('same source ID content edit invalidates preview with 409',async(d,a)=>pool.query("update local_attendance set notes='edited after preview' where id=$1",[a.id]));
  await staleCase('new source after preview invalidates complete day snapshot with 409',async d=>newOT(w,d));
  await staleCase('reject and resubmit same ID invalidates preview even restored to submitted',async(d,a)=>{for(const target_status of ['REJECTED','SUBMITTED'])await must('/api/attendance/status','POST',{attendance_record_id:a.id,target_status,reason:'QA reject resubmit',idempotency_key:key()});});
  await staleCase('day status and meal facts after preview invalidate snapshot with 409',async d=>must('/api/attendance/day-status','POST',{worker_id:w.id,work_date:d,status:'PRESENT',meal_eligible:true,reason:'QA new day fact',idempotency_key:key()}));
  await check('closure-only change after preview invalidates snapshot despite unchanged sources',async()=>{
    const d=nextDate();await newAttendance(w,d);const book=workbook([closureRow(w,d)]),p=await preview(book);await directConfirm(w,d);denied(await apply(book,p),409);assert.equal((await closureState(w,d)).idempotency_key===book.rows[0].values.idempotency_key,false);
  });
  await check('duplicate worker day is rejected despite distinct custom keys and duplicate keys across days rejected',async()=>{
    const d=nextDate(),e=nextDate();await newAttendance(w,d);await newAttendance(w,e);
    for(const rows of [[closureRow(w,d,'EMPLOYEE_CONFIRMED',{idempotency_key:key()},2),closureRow(w,d,'EMPLOYEE_CONFIRMED',{idempotency_key:key()},3)],(()=>{const k=key();return [closureRow(w,d,'EMPLOYEE_CONFIRMED',{idempotency_key:k},2),closureRow(w,e,'EMPLOYEE_CONFIRMED',{idempotency_key:k},3)];})()]){const book=workbook(rows),p=await preview(book);assert.ok(p.invalid_rows>0);denied(await apply(book,p));}
    assert.equal(await closureState(w,d),null);assert.equal(await closureState(w,e),null);
  });
  await check('confirm or seal mixed with real nonclosure sheet is rejected atomically while example rows ignored',async()=>{
    const d=nextDate();await newAttendance(w,d);
    const extra={sheet:'NHAN_SU',row:2,values:{ma_nv:'MIX-'+key(),ho_ten:'Must not be imported'}};
    const book=workbook([closureRow(w,d),extra]),p=await preview(book);assert.ok(p.invalid_rows>0);denied(await apply(book,p));assert.equal((await pool.query('select count(*)::int n from local_workers where employee_code=$1',[extra.values.ma_nv])).rows[0].n,0);assert.equal(await closureState(w,d),null);
    const exampleBook=workbook([closureRow(w,d),{...extra,values:{...extra.values,__example:'DEMO'}}]),q=await preview(exampleBook);assert.equal(q.invalid_rows,0);assert.equal(q.closure_reviews.length,1);assert.equal((await apply(exampleBook,q)).status,200);
  });
  for(const target of ['OPEN','REOPENED'])await check('mixed '+target+' closure and source workbook is rejected before acquiring incompatible row locks',async()=>{
    const d=nextDate();await newAttendance(w,d);
    if(target==='OPEN')await directConfirm(w,d);else{const s=await summary(w,d);await must('/api/attendance/approve-close','POST',{worker_id:w.id,work_date:d,expected_revision:s.current_revision,source_fingerprint:s.source_fingerprint,proxy_confirm:true,reason:'Prepare sealed day for mixed reopen test',idempotency_key:key()});}
    const before=await closureState(w,d),sourceDate=nextDate();
    const book=workbook([closureRow(w,d,target,{},2),{sheet:'CHAM_CONG_NGAY',row:3,values:{ma_nv:w.employee_code,ngay:sourceDate,so_cong:1}}]),p=await preview(book);
    assert.ok(p.invalid_rows>0);denied(await apply(book,p),400);assert.equal((await closureState(w,d)).status,before.status);assert.equal((await summary(w,sourceDate)).sources.length,0);
  });
  await check('all three pending source kinds block imported seal without silently approving sources',async()=>{
    for(const kind of ['ATTENDANCE','PRODUCTION_ENTRY','OVERTIME']){const d=nextDate();const source=kind==='ATTENDANCE'?await newAttendance(w,d):kind==='OVERTIME'?await newOT(w,d):await newProduction(d);await directConfirm(w,d);const book=workbook([closureRow(w,d,'LEADER_CONFIRMED')]),p=await preview(book);denied(await apply(book,p));const s=await summary(w,d);assert.equal(s.closure.status,'EMPLOYEE_CONFIRMED');assert.equal(s.sources.find(x=>x.id===source.id).status,'SUBMITTED');}
  });
  await check('seal refuses stale confirmation even if preview itself is current',async()=>{
    const d=nextDate(),a=await newAttendance(w,d);await approveAttendance(a);await directConfirm(w,d);await pool.query("update local_attendance set notes='requires reconfirmation' where id=$1",[a.id]);const book=workbook([closureRow(w,d,'LEADER_CONFIRMED')]),p=await preview(book);denied(await apply(book,p));assert.equal((await closureState(w,d)).status,'EMPLOYEE_CONFIRMED');
  });
  await check('nonmanager proxy and team leader global import are denied at API boundary',async()=>{
    const accountant=await makeActor('accountant'),leader=await makeActor('team_leader');
    for(const actor of [accountant,leader])await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'payroll_worker_manage',true),($1,'production_manage',true),($1,'production_attendance_approve',true)",[actor.id]);
    const d=nextDate();await newAttendance(w,d);const book=workbook([closureRow(w,d)]);const result=await call('/api/payroll/import/preview','POST',book,accountant.token);
    if(result.status<300)denied(await apply(book,result.body,accountant.token),403);else denied(result,403);
    denied(await call('/api/payroll/import/preview','POST',book,leader.token),403);assert.equal(await closureState(w,d),null);
  });
  await check('revoked attendance permission is checked at apply and committed replay',async()=>{
    const accountant=await makeActor('accountant');await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'payroll_worker_manage',true),($1,'production_manage',true)",[accountant.id]);
    const d=nextDate(),a=await newAttendance(w,d);await approveAttendance(a);await directConfirm(w,d);const book=workbook([closureRow(w,d,'LEADER_CONFIRMED')]),p=await preview(book,accountant.token);
    await pool.query("update local_employee_permissions set enabled=false where user_id=$1 and permission_type='production_manage'",[accountant.id]);denied(await apply(book,p,accountant.token),403);assert.equal((await closureState(w,d)).status,'EMPLOYEE_CONFIRMED');
    await pool.query("update local_employee_permissions set enabled=true where user_id=$1 and permission_type='production_manage'",[accountant.id]);await applied(book,p,accountant.token);
    await pool.query("update local_employee_permissions set enabled=false where user_id=$1 and permission_type='production_manage'",[accountant.id]);denied(await apply(book,p,accountant.token),403);
  });
  await check('exact committed replay survives token expiry and later source edit without repeating audit',async()=>{
    const d=nextDate(),a=await newAttendance(w,d),book=workbook([closureRow(w,d)]),p=await preview(book);assert.equal((await apply(book,p)).status,200);const before=await closureState(w,d),events=(await pool.query('select count(*)::int n from local_attendance_workflow_events')).rows[0].n;
    await expire(p);await pool.query("update local_attendance set notes='source revised after committed confirmation' where id=$1",[a.id]);const replay=await apply(book,p);assert.equal(replay.status,200,JSON.stringify(replay));assert.equal(replay.body.reused,true);assert.equal((await pool.query('select count(*)::int n from local_attendance_workflow_events')).rows[0].n,events);assert.equal(String((await closureState(w,d)).confirmed_revision),String(before.confirmed_revision));assert.equal((await summary(w,d)).confirmation_current,false);
  });
  await check('later row failure rolls back earlier closure audit and batch receipt',async()=>{
    const d=nextDate(),empty=nextDate();await newAttendance(w,d);const book=workbook([closureRow(w,d,'EMPLOYEE_CONFIRMED',{},2),closureRow(w,empty,'EMPLOYEE_CONFIRMED',{},3)]),p=await preview(book),before=(await pool.query('select count(*)::int n from local_attendance_workflow_events')).rows[0].n;denied(await apply(book,p));assert.equal(await closureState(w,d),null);assert.equal((await pool.query('select count(*)::int n from local_attendance_workflow_events')).rows[0].n,before);assert.equal((await pool.query('select count(*)::int n from local_payroll_import_batches where fingerprint=$1',[p.fingerprint])).rows[0].n,0);
  });
  await check('audit failure on second row rolls back every row and same token can safely retry',async()=>{
    const d=nextDate(),e=nextDate();await newAttendance(w,d);await newAttendance(w,e);const book=workbook([closureRow(w,d,'EMPLOYEE_CONFIRMED',{},2),closureRow(w,e,'EMPLOYEE_CONFIRMED',{},3)]),p=await preview(book),before=(await pool.query('select count(*)::int n from local_attendance_workflow_events')).rows[0].n;
    await pool.query(`create function qa_fail_import_audit() returns trigger language plpgsql as $$ begin if NEW.entity_type='DAY_CLOSURE' and exists(select 1 from local_day_closures where id=NEW.entity_id::uuid and work_date='${e}') then raise exception 'QA injected import audit failure'; end if; return NEW; end $$; create trigger qa_fail_import_audit before insert on local_attendance_workflow_events for each row execute function qa_fail_import_audit()`);
    try{const r=await apply(book,p);denied(r);assert.match(JSON.stringify(r.body),/QA injected/);}finally{await pool.query('drop trigger qa_fail_import_audit on local_attendance_workflow_events;drop function qa_fail_import_audit()');}
    assert.equal(await closureState(w,d),null);assert.equal(await closureState(w,e),null);assert.equal((await pool.query('select count(*)::int n from local_attendance_workflow_events')).rows[0].n,before);assert.equal((await apply(book,p)).status,200);
  });
  await check('opposite day order concurrent imports and same workbook race do not deadlock or duplicate audit',async()=>{
    const d=nextDate(),e=nextDate();await newAttendance(w,d);await newAttendance(w,e);const a=workbook([closureRow(w,d,'EMPLOYEE_CONFIRMED',{},2),closureRow(w,e,'EMPLOYEE_CONFIRMED',{},3)]),b=workbook([closureRow(w,e,'EMPLOYEE_CONFIRMED',{},2),closureRow(w,d,'EMPLOYEE_CONFIRMED',{},3)]),pa=await preview(a),pb=await preview(b);
    const outcomes=await Promise.all([apply(a,pa),apply(b,pb)]);assert.equal(outcomes.filter(x=>x.status===200).length,1,JSON.stringify(outcomes));assert.equal(outcomes.filter(x=>x.status===409).length,1,JSON.stringify(outcomes));
    const f=nextDate();await newAttendance(w,f);const book=workbook([closureRow(w,f)]),p=await preview(book);const before=(await pool.query('select count(*)::int n from local_attendance_workflow_events')).rows[0].n;const replay=await Promise.all([apply(book,p),apply(book,p)]);assert.ok(replay.every(r=>r.status===200),JSON.stringify(replay));assert.equal(replay.filter(r=>r.body.reused===true).length,1);assert.equal((await pool.query('select count(*)::int n from local_attendance_workflow_events')).rows[0].n,before+1);
  });
  await check('import racing canonical approval close cannot overwrite or duplicate the sealed day',async()=>{
    const d=nextDate();await newAttendance(w,d);const book=workbook([closureRow(w,d)]),p=await preview(book),s=await summary(w,d);
    const [imported,sealed]=await Promise.all([apply(book,p),call('/api/attendance/approve-close','POST',{worker_id:w.id,work_date:d,expected_revision:s.current_revision,source_fingerprint:s.source_fingerprint,proxy_confirm:true,reason:'Concurrent canonical action reviewed all sources',idempotency_key:key()})]);
    assert.ok([200,409].includes(imported.status),JSON.stringify(imported));assert.equal(sealed.status,200,JSON.stringify(sealed));
    const current=await summary(w,d);assert.equal(current.closure.status,'LEADER_CONFIRMED');assert.ok(current.sources.every(x=>x.status!=='SUBMITTED'));assert.equal(current.confirmation_current,true);
  });
  await check('ordinary import remains compatible without closure preview token',async()=>{
    const code='ORDINARY-'+key(),book=workbook([{sheet:'NHAN_SU',row:2,values:{ma_nv:code,ho_ten:'Ordinary workbook remains supported'}}]),p=await preview(book),body=applyBody(book,p);delete body.preview_token;assert.equal((await call('/api/payroll/import/apply','POST',body)).status,200);assert.equal((await pool.query('select count(*)::int n from local_workers where employee_code=$1',[code])).rows[0].n,1);
  });
  await check('sealed day blocks reconfirmation and payroll lock blocks imported reopen',async()=>{
    const d='2026-09-09',a=await newAttendance(w,d);await approveAttendance(a);await directConfirm(w,d);const sealBook=workbook([closureRow(w,d,'LEADER_CONFIRMED')]),sp=await preview(sealBook);await applied(sealBook,sp);
    const confirmBook=workbook([closureRow(w,d)]),cp=await preview(confirmBook);denied(await apply(confirmBook,cp));assert.equal((await closureState(w,d)).status,'LEADER_CONFIRMED');
    const reopenBook=workbook([closureRow(w,d,'REOPENED')]),rp=await preview(reopenBook);const period=(await pool.query("insert into local_payroll_periods(period_start,period_end,standard_days,status)values('2026-09-01','2026-09-30',26,'OPEN')returning id")).rows[0].id;await pool.query("insert into local_payroll_runs(period_id,run_number,status,input_hash,idempotency_key)values($1,1,'LOCKED','qa-lock',$2)",[period,key()]);denied(await apply(reopenBook,rp));assert.equal((await closureState(w,d)).status,'LEADER_CONFIRMED');
  });
  console.log(JSON.stringify({passed:passed.length,failed:failures.length,failures},null,2));if(failures.length)process.exitCode=1;
} finally {
  if(api && api.exitCode===null){api.kill();await Promise.race([once(api,'exit'),new Promise(resolve=>setTimeout(resolve,5000))]);}
  await pool?.end();if(created)control(`drop database ${database} with (force)`);control(`drop role if exists ${role}`);assert.ok(!logs.includes(secret));console.log('CLEANUP own closure-import database role and API removed');
}
