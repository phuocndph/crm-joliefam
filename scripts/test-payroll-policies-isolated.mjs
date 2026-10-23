// Explicit approved fixture policies, no defaults. Reuses the owned database
// bootstrap; never reads .env, real business data, or starts browser automation.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createServer, request as httpRequest } from 'node:http';
import { readFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function runPayrollPolicyTests({ pool, base, token, admin, call, must }) {
  const checks = [], failures = [], uuid = () => randomUUID();
  const check = async (label, action) => { try { await action(); checks.push(label); console.log('PASS ' + label); } catch (error) { failures.push({ label, error: error.message }); console.log('FAIL ' + label + ': ' + error.message); } };
  const period = month => ({ period_start: `2024-${month}-01`, period_end: `2024-${month}-${['04','06','09','11'].includes(month) ? '30' : month === '02' ? '29' : '31'}` });
  const range = p => 'period_start=' + p.period_start + '&period_end=' + p.period_end;
  const preflight = async(p, workers, days) => {const result=await must('/api/payroll/preflight?' + range(p) + '&worker_ids=' + workers.map(w => w.id).join(',') + (days === undefined ? '' : '&standard_days=' + days)); if(process.env.PAYROLL_QA_DIAGNOSTICS==='1')console.log('PREFLIGHT '+p.period_start+' '+JSON.stringify(result.issues));return result;};
  const preview = (p, workers, extras = {}) => must('/api/payroll/runs', 'POST', { ...p, worker_ids: workers.map(w => w.id), idempotency_key: uuid(), ...extras });
  async function worker(start, { overtime = false, meal = false, location = 'QA-A', type = 'MONTHLY_HELPER' } = {}) {
    await pool.query("update local_workers set payroll_status='SUSPENDED' where payroll_status='ACTIVE'");
    const w = await must('/api/workers', 'POST', { employee_code: 'POLICY-' + uuid(), display_name: 'Nhân sự chính sách QA', worker_type: 'HELPER' });
    await pool.query('update local_workers set location_code=$2 where id=$1', [w.id, location]);
    const group = await must('/api/payroll/policy-groups', 'POST', { code: 'POLICY-' + uuid(), name: 'Nhóm chính sách QA', reason: 'isolated approved fixture' });
    const bundle = await must('/api/payroll/worker-profile-bundle', 'POST', { worker_id: w.id, compensation_type: type, payroll_policy_group_id: group.id, effective_from: start, ...(type === 'PIECE_RATE' ? {} : { primary_amount: 2600000 }), overtime_enabled: overtime, meal_enabled: meal, reason: 'isolated fixture', idempotency_key: uuid() });
    await pool.query('update local_workers set location_code=$2 where id=$1', [w.id, location]);
    for (const [path, item] of [['compensation-assignments', bundle.assignment], ['rates', bundle.rate], ['worker-profiles', bundle.profile]]) if (item) await must('/api/payroll/' + path + '/' + item.id + '/approve', 'POST', { reason: 'isolated fixture approval' });
    return { ...w, group, bundle, location };
  }
  async function calendar(p, { location = 'QA-A', days = 26, minutes = 480, approve = true } = {}) {
    const draft = await must('/api/payroll/calendar-versions', 'POST', { ...p, location_code: location, standard_days: days, daily_minutes: minutes, reason: 'isolated calendar', source_reference: 'QA calendar signed fixture' });
    if (approve) await must('/api/payroll/calendar-versions/' + draft.id + '/approve', 'POST', { reason: 'isolated calendar approval' }); return draft;
  }
  async function rule(w, p, { kind = 'OT', type = 'NORMAL', method = 'BASE_RATE_MULTIPLIER', value = 1.5, location = w.location, approve = true, start = p.period_start, end = p.period_end } = {}) {
    const body = { policy_group_id: w.group.id, location_code: location, rule_kind: kind, effective_from: start, effective_to: end, reason: 'isolated bounded rule', source_reference: 'QA signed rule fixture' };
    if (kind === 'MEAL') body.meal_rate = value; else { body.overtime_type = type; body.calculation_method = method; body[method === 'FIXED_RATE' ? 'fixed_rate' : 'multiplier'] = value; }
    const draft = await must('/api/payroll/rule-versions', 'POST', body); if (approve) await must('/api/payroll/rule-versions/' + draft.id + '/approve', 'POST', { reason: 'isolated rule approval' }); return draft;
  }
  async function overtime(w, date, type = 'NORMAL') { return (await pool.query("insert into local_overtime(worker_id,work_date,overtime_type,overtime_minutes,reason,status,idempotency_key)values($1,$2,$3,120,'isolated imported approved source','APPROVED',$4)returning id", [w.id, date, type, uuid()])).rows[0]; }
  async function meal(w, date) { return (await pool.query("insert into local_day_statuses(worker_id,work_date,status,meal_eligible,reason,idempotency_key)values($1,$2,'PRESENT',true,'isolated meal source',$3)returning id", [w.id, date, uuid()])).rows[0]; }
  async function attendance(w, date) { const a = await must('/api/attendance', 'POST', { worker_id: w.id, attendance_method: 'DAY', work_date: date, day_units: 1, idempotency_key: uuid() }); await must('/api/attendance/status', 'POST', { attendance_record_id: a.id, target_status: 'APPROVED', reason: 'isolated fixture', idempotency_key: uuid() }); return a; }

  await check('missing or draft calendar blocks; approved exact calendar is authoritative, never caller fallback', async () => {
    const p = period('01'), w = await worker(p.period_start);
    assert.equal((await preflight(p, [w], 26)).is_ready, false, 'caller days cannot supply missing approval');
    const c = await calendar(p, { approve: false }); assert.equal((await preflight(p, [w], 26)).is_ready, false, 'draft calendar is not effective');
    await must('/api/payroll/calendar-versions/' + c.id + '/approve', 'POST', { reason: 'isolated approval' }); assert.equal((await preflight(p, [w])).is_ready, true);
    const assertion = await call('/api/payroll/runs', 'POST', { ...p, worker_ids: [w.id], standard_days: 25, idempotency_key: uuid() }); assert.ok(assertion.status >= 400 || assertion.body.blocking_exception_count > 0, 'caller days mismatch fails closed');
    await attendance(w, '2024-01-15'); const run = await preview(p, [w]); assert.equal(Number(run.gross_total), 100000, '2.6m / approved26days');
    assert.ok(JSON.stringify(run.config_snapshot).includes(c.id), 'calendar version captured in run');
  });
  await check('OT type exact date methods and meal versions calculate numeric golden without legacy defaults', async () => {
    const p = period('02'), w = await worker(p.period_start, { overtime: true, meal: true }); await calendar(p);
    const sources = []; sources.push(await overtime(w, '2024-02-14')); sources.push(await overtime(w, '2024-02-15')); sources.push(await overtime(w, '2024-02-18', 'SUNDAY')); sources.push(await overtime(w, '2024-02-20', 'HOLIDAY')); await meal(w, '2024-02-14'); await meal(w, '2024-02-15');
    assert.equal((await preflight(p, [w])).is_ready, false, 'no rate or multiplier implied');
    const rules = [await rule(w, p, { end: '2024-02-14' }), await rule(w, p, { start: '2024-02-15', method: 'FIXED_RATE', value: 40000 }), await rule(w, p, { type: 'SUNDAY', method: 'FIXED_RATE', value: 50000 }), await rule(w, p, { type: 'HOLIDAY', method: 'FIXED_RATE', value: 60000 }), await rule(w, p, { kind: 'MEAL', value: 20000, end: '2024-02-14' }), await rule(w, p, { kind: 'MEAL', value: 30000, start: '2024-02-15' })];
    assert.equal((await preflight(p, [w])).is_ready, true); const run = await preview(p, [w]);
    assert.equal(Number(run.gross_total), 387500, 'OT37500+80000+100000+120000 +meals20000+30000');
    for (const source of sources) assert.ok(run.items.some(i => i.source_id === source.id), 'every approved source included');
    for (const r of rules) assert.ok(JSON.stringify(run.items).includes(r.id), 'item references exact monetary rule');
    const locked = await must('/api/payroll/runs/' + run.id + '/lock', 'POST', {}); assert.equal(locked.status, 'LOCKED'); assert.deepEqual(await must('/api/payroll/runs/' + run.id + '/lock', 'POST', {}), locked);
  });
  await check('calendar daily minutes drive monthly OT denominator and location rules never bleed', async () => {
    const p = period('03'), w = await worker(p.period_start, { overtime: true }); await calendar(p, { days: 20, minutes: 600 }); await overtime(w, '2024-03-15');
    await rule(w, p, { location: 'QA-B' }); assert.equal((await preflight(p, [w])).is_ready, false, 'other location policy cannot pay');
    await rule(w, p); const run = await preview(p, [w]); assert.equal(Number(run.gross_total), 39000, '2.6m /20days /10hours ×2hours ×1.5');
  });
  await check('approved rule calendar bounds conflicts immutability permissions and audit are enforced', async () => {
    const p = period('04'), w = await worker(p.period_start, { overtime: true }); const c = await calendar(p), r = await rule(w, p);
    for (const [endpoint, id] of [['rule-versions', r.id], ['calendar-versions', c.id]]) {
      assert.ok((await call('/api/payroll/' + endpoint + '/' + id, 'PATCH', { reason: 'illegal approved edit' })).status >= 400);
      assert.ok((await call('/api/payroll/' + endpoint + '/' + id, 'DELETE')).status >= 400);
    }
    const duplicate = await rule(w, p, { location: null, approve: false }); assert.ok((await call('/api/payroll/rule-versions/' + duplicate.id + '/approve', 'POST', { reason: 'overlap must reject' })).status >= 400);
    const duplicateCalendar = await calendar(p, { approve: false }); assert.ok((await call('/api/payroll/calendar-versions/' + duplicateCalendar.id + '/approve', 'POST', { reason: 'overlap must reject' })).status >= 400);
    assert.equal((await pool.query('select status from local_payroll_rule_versions where id=$1', [duplicate.id])).rows[0].status, 'DRAFT');
    for (const malformed of [
      { rule_kind: 'OT', overtime_type: 'NORMAL', calculation_method: 'BASE_RATE_MULTIPLIER', multiplier: null },
      { rule_kind: 'OT', overtime_type: 'NORMAL', calculation_method: 'FIXED_RATE', fixed_rate: null },
      { rule_kind: 'MEAL', meal_rate: null },
    ]) {
      const response = await call('/api/payroll/rule-versions', 'POST', { policy_group_id: w.group.id, effective_from: '2023-01-01', effective_to: '2023-01-31', reason: 'invalid null numeric QA', source_reference: 'fixture', ...malformed });
      if (response.status < 300) assert.ok((await call('/api/payroll/rule-versions/' + response.body.id + '/approve', 'POST', { reason: 'must reject null money' })).status >= 400, 'null numeric cannot become approved');
      else assert.ok(response.status < 500);
    }
    for (const role of ['accountant', 'employee', 'manager']) {
      const id = uuid(), password = 'PolicyFixtureOnly!222', salt = randomBytes(16).toString('hex'), hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
      await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)', [id, role + '@policy.invalid', hash]); await pool.query('insert into local_user_roles(user_id,role)values($1,$2)', [id, role]); const session = await must('/api/local-auth/login', 'POST', { email: role + '@policy.invalid', password });
      const headers = { origin: 'https://crm.example.com', authorization: 'Bearer ' + session.token, 'content-type': 'application/json' };
      const read = await fetch(base + '/api/payroll/rule-versions', { headers }); assert.equal(read.status, role === 'employee' ? 403 : 200, role + ' exact read permission');
      const response = await fetch(base + '/api/payroll/rule-versions', { method: 'POST', headers, body: JSON.stringify({ policy_group_id: w.group.id, rule_kind: 'OT', overtime_type: 'NORMAL', calculation_method: 'FIXED_RATE', fixed_rate: 1, effective_from: '2023-01-01', effective_to: '2023-01-31', reason: 'manager fixture policy', source_reference: 'signed fixture' }) }); assert.equal(response.status, role === 'manager' ? 201 : 403, role + ' exact write permission');
    }
    const row = (await pool.query('select created_by,approved_by from local_payroll_rule_versions where id=$1', [r.id])).rows[0]; assert.ok(Object.values(row).every(actor => String(actor).includes(admin)), 'normal caller attributed');
  });
  await check('inactive source settlement included, no-facts suspended excluded, locked identity immutable', async () => {
    const p = period('05'), w = await worker(p.period_start); await calendar(p); const source = await attendance(w, '2024-05-15');
    const empty = await must('/api/workers', 'POST', { employee_code: 'EMPTY-' + uuid(), display_name: 'Suspended no facts', worker_type: 'HELPER' });
    await pool.query("update local_workers set is_active=false,payroll_status='SUSPENDED',employment_end_date='2024-05-20' where id=$1", [w.id]); await pool.query("update local_workers set payroll_status='SUSPENDED' where id=$1", [empty.id]);
    await pool.query("update local_worker_payroll_profiles set effective_to='2024-05-20' where worker_id=$1", [w.id]);
    const before = await preflight(p, [w, empty]); assert.deepEqual(before.resolved_worker_ids, [w.id]);
    const run = await preview(p, [w, empty]); assert.equal(run.record_count, 1); assert.equal(Number(run.gross_total), 100000); assert.ok(run.items.some(i => i.source_id === source.id));
    const locked = await must('/api/payroll/runs/' + run.id + '/lock', 'POST', {}), record = locked.records[0]; assert.equal(record.worker_name, w.display_name); assert.equal(record.employee_code, w.employee_code);
    await pool.query("update local_workers set display_name='Master changed after close',employee_code=$2,worker_type='CUTTER',location_code='QA-CHANGED' where id=$1", [w.id, 'CHANGED-' + uuid()]);
    const reread = await must('/api/payroll/runs/' + run.id); assert.equal(reread.records[0].worker_name, record.worker_name); assert.equal(reread.records[0].employee_code, record.employee_code); assert.equal(reread.records[0].worker_type, record.worker_type);
    await assert.rejects(pool.query("update local_payroll_records set employee_identity_snapshot='{}'::jsonb where id=$1", [record.id]), /khóa|bất biến|locked|immutable/i, 'locked identity snapshot rejects direct SQL edits');
    const csv = await fetch(base + '/api/payroll/runs/' + run.id + '/export.csv', { headers: { origin: 'https://crm.example.com', authorization: 'Bearer ' + token } }); const text = await csv.text(); assert.equal(csv.status, 200); assert.ok(text.includes(w.employee_code)); assert.ok(!text.includes('Master changed after close'));
  });
  await check('recurring rates ambiguous on same date block instead of latest created wins', async () => {
    const p = period('06'), w = await worker(p.period_start); await calendar(p);
    await pool.query("insert into local_worker_rates(worker_id,compensation_type,attendance_method,rate_amount,effective_from,status,reason)values($1,'MONTHLY_HELPER','DAY',3000000,$2,'APPROVED','isolated overlapping historical fixture')", [w.id, p.period_start]);
    assert.equal((await preflight(p, [w])).is_ready, false); const result = await call('/api/payroll/runs', 'POST', { ...p, worker_ids: [w.id], idempotency_key: uuid() }); assert.ok(result.status >= 400 || result.body.blocking_exception_count > 0);
  });
  await check('new source requiring additional rule invalidates earlier preview and missing rule blocks fresh run', async () => {
    const p = period('07'), w = await worker(p.period_start, { overtime: true }); await calendar(p); await rule(w, p); await overtime(w, '2024-07-15'); const run = await preview(p, [w]); await overtime(w, '2024-07-21', 'SUNDAY');
    assert.equal((await call('/api/payroll/runs/' + run.id + '/lock', 'POST', {})).status, 409); assert.equal((await preflight(p, [w])).is_ready, false);
    await rule(w, p, { type: 'SUNDAY', method: 'FIXED_RATE', value: 50000 }); const fresh = await preview(p, [w]); assert.equal(Number(fresh.gross_total), 137500); assert.equal((await must('/api/payroll/runs/' + fresh.id + '/lock', 'POST', {})).status, 'LOCKED');
  });
  await check('policy approval and audit roll back together; concurrent direct SQL overlapping approvals serialize', async () => {
    const p = period('08'), w = await worker(p.period_start, { overtime: true }), draft = await rule(w, p, { approve: false });
    await pool.query(`create function qa_fail_policy_audit()returns trigger language plpgsql as $$begin if new.entity_id='${draft.id}' and new.action='APPROVE' then raise exception 'QA injected policy audit failure';end if;return new;end$$;create trigger qa_fail_policy_audit before insert on local_payroll_audit_events for each row execute function qa_fail_policy_audit()`);
    try { assert.ok((await call('/api/payroll/rule-versions/' + draft.id + '/approve', 'POST', { reason: 'rollback QA' })).status >= 400); assert.equal((await pool.query('select status from local_payroll_rule_versions where id=$1', [draft.id])).rows[0].status, 'DRAFT'); }
    finally { await pool.query('drop trigger qa_fail_policy_audit on local_payroll_audit_events;drop function qa_fail_policy_audit()'); }
    await must('/api/payroll/rule-versions/' + draft.id + '/approve', 'POST', { reason: 'normal approved QA' });
    assert.equal((await pool.query("select count(*)::int n from local_payroll_audit_events where entity_id=$1 and action='APPROVE'", [draft.id])).rows[0].n, 1);
    const generic = await rule(w, p, { type: 'SUNDAY', location: null, approve: false }), located = await rule(w, p, { type: 'SUNDAY', location: 'QA-A', approve: false });
    const raced = await Promise.allSettled([generic, located].map(r => pool.query("update local_payroll_rule_versions set status='APPROVED',approved_by=$2,approved_at=now() where id=$1", [r.id, admin])));
    assert.equal(raced.filter(r => r.status === 'fulfilled').length, 1); assert.equal((await pool.query("select count(*)::int n from local_payroll_rule_versions where id=any($1::uuid[]) and status='APPROVED'", [[generic.id, located.id]])).rows[0].n, 1);
  });
  await check('FIXED OT for piece worker requires no base rate and out-of-employment source blocks', async () => {
    const p = period('09'), w = await worker(p.period_start, { overtime: true, type: 'PIECE_RATE' }); await calendar(p); await rule(w, p, { method: 'FIXED_RATE', value: 55000 }); await overtime(w, '2024-09-15');
    assert.equal((await pool.query('select count(*)::int n from local_worker_rates where worker_id=$1', [w.id])).rows[0].n, 0);
    assert.equal((await preflight(p, [w])).is_ready, true); assert.equal(Number((await preview(p, [w])).gross_total), 110000);
    await pool.query("update local_workers set employment_end_date='2024-09-10' where id=$1", [w.id]); assert.equal((await preflight(p, [w])).is_ready, false, 'source after employment is not payable silently');
  });
  await check('two locations resolve distinct monthly day and OT denominators; omitted inactive settlement blocks lock', async () => {
    const p = period('10'), a = await worker(p.period_start, { overtime: true, location: 'QA-A' }); await calendar(p, { days: 20, minutes: 600 }); await rule(a, p); await attendance(a, '2024-10-15'); await overtime(a, '2024-10-15');
    const b = await worker(p.period_start, { overtime: true, location: 'QA-B' }); await calendar(p, { location: 'QA-B' }); await rule(b, p); await attendance(b, '2024-10-15'); await overtime(b, '2024-10-15');
    await pool.query("update local_workers set is_active=false,payroll_status='SUSPENDED' where id=any($1::uuid[])", [[a.id,b.id]]);
    const partial = await preview(p, [b]); assert.equal((await call('/api/payroll/runs/' + partial.id + '/lock', 'POST', {})).status, 409, 'cannot omit inactive worker with earned source');
    const run = await preview(p, [a,b]); assert.equal(Number(run.gross_total), 306500, 'Aday130k+OT39k; Bday100k+OT37.5k'); assert.equal(run.record_count, 2); assert.equal((await must('/api/payroll/runs/' + run.id + '/lock', 'POST', {})).status, 'LOCKED');
  });
  await check('later disabled profile never silently erases earlier enabled-date approved overtime', async () => {
    const p = period('11'), w = await worker(p.period_start, { overtime: true }); await calendar(p); await rule(w,p); const source = await overtime(w,'2024-11-10');
    await pool.query("update local_worker_payroll_profiles set effective_to='2024-11-14' where worker_id=$1", [w.id]);
    await pool.query("insert into local_worker_payroll_profiles(worker_id,overtime_enabled,effective_from,status,reason,idempotency_key,request_hash)values($1,false,'2024-11-15','APPROVED','later disabled fixture',$2,'fixture')", [w.id,uuid()]);
    const result = await preflight(p,[w]); assert.equal(result.is_ready,true,'supported per-date profile transition');
    const run = await preview(p,[w]); assert.ok(run.items.some(i=>i.source_id===source.id)); assert.equal(Number(run.gross_total),37500);
    await overtime(w,'2024-11-20'); const disabled = await preflight(p,[w]); assert.equal(disabled.is_ready,false,'approved money source on a disabled profile date must be explicit blocking'); assert.ok(disabled.issues.some(i=>i.severity==='BLOCKING'));
  });
  await check('approved legacy OUTPUT attendance is explicitly blocked rather than silently omitted',async()=>{
    const p=period('12'),w=await worker(p.period_start);await calendar(p);
    const source=(await pool.query("insert into local_attendance(worker_id,attendance_method,work_date,output_quantity,rate_amount,calculated_amount,workflow_status,idempotency_key)values($1,'OUTPUT','2024-12-15',42,18000,756000,'APPROVED',$2)returning id",[w.id,uuid()])).rows[0];
    const result=await preflight(p,[w]);assert.equal(result.is_ready,false);assert.ok(result.issues.some(i=>i.severity==='BLOCKING'&&i.source_id===source.id),'diagnose actual OUTPUT source');
    const run=await call('/api/payroll/runs','POST',{...p,worker_ids:[w.id],idempotency_key:uuid()});assert.equal(run.status,409);
  });
  console.log(JSON.stringify({ suite: 'payroll policy versions', passed: checks.length, failed: failures.length, failures }, null, 2));
  if (failures.length) throw new Error(failures.length + ' payroll policy regression groups failed');
  if (process.argv.includes('--serve')) {
    const root = path.resolve(String(process.env.CRM_PAYROLL_QA_DIST || '')); assert.ok(process.env.CRM_PAYROLL_QA_DIST, 'explicit fixture frontend directory required'); await stat(path.join(root,'index.html'));
    const guiPassword='PolicyFixtureOnly!222';
    for(const [email,role]of [['gui-admin@policy.invalid','admin'],['gui-manager@policy.invalid','manager'],['gui-accountant@policy.invalid','accountant'],['gui-employee@policy.invalid','employee']]) {
      const id=uuid(),salt=randomBytes(16).toString('hex'),hash=`scrypt$${salt}$${scryptSync(guiPassword,salt,64).toString('hex')}`;
      await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,email,hash]); await pool.query('insert into local_user_roles(user_id,role)values($1,$2)',[id,role]);
    }
    const directory=await mkdtemp(path.join(tmpdir(),'crm-payroll-policy-ui-')),stopfile=path.join(directory,'stop');
    const frontend=createServer(async(req,res)=>{
      if(req.url.startsWith('/api/')||req.url==='/health') {const upstream=httpRequest(base+req.url,{method:req.method,headers:{...req.headers,origin:'https://crm.example.com',host:'crm.example.com'}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);return;}
      try {let file=path.resolve(root,'.'+new URL(req.url,'http://127.0.0.1').pathname);if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}try{if(!(await stat(file)).isFile())file=path.join(root,'index.html');}catch{file=path.join(root,'index.html');}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(500);res.end();}
    });
    try {frontend.listen(0,'127.0.0.1');await once(frontend,'listening');console.log(JSON.stringify({fixtureOrigin:'http://127.0.0.1:'+frontend.address().port,stopfile,expiresInMinutes:10,logins:['gui-admin@policy.invalid','gui-manager@policy.invalid','gui-accountant@policy.invalid','gui-employee@policy.invalid'],fixturePassword:guiPassword}));const deadline=Date.now()+600000;while(Date.now()<deadline){if(await stat(stopfile).then(()=>true,()=>false))break;await new Promise(resolve=>setTimeout(resolve,500));}}
    finally{await new Promise(resolve=>frontend.close(resolve));await rm(directory,{recursive:true,force:true});console.log('CLEANUP GUI fixture frontend and stop directory removed');}
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const child = spawn(process.execPath, ['scripts/test-payroll-integrity-isolated.mjs', '--policies', ...process.argv.slice(2)], { cwd: new URL('..', import.meta.url), windowsHide: true, stdio: 'inherit', env: process.env }); const [code] = await once(child, 'exit'); process.exitCode = code;
}
