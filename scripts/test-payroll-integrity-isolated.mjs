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

const suffix = process.pid + '_' + Date.now(), database = 'payroll_integrity_qa_' + suffix, role = 'payroll_integrity_role_' + suffix;
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
  if (process.argv.includes('--readiness')) {
    const { runPayrollReadinessTests } = await import('./test-payroll-readiness-isolated.mjs');
    await runPayrollReadinessTests({ pool, base, token, admin, call, must });
  } else if (process.argv.includes('--simplification')) {
    const { runPayrollSimplificationTests } = await import('./test-payroll-simplification-isolated.mjs');
    await runPayrollSimplificationTests({ pool, base, token, admin, call, must });
  } else if (process.argv.includes('--policies')) {
    const { runPayrollPolicyTests } = await import('./test-payroll-policies-isolated.mjs');
    await runPayrollPolicyTests({ pool, base, token, admin, call, must });
  } else if (process.argv.includes('--v2')) {
    await pool.query("insert into local_payroll_calendar_versions(period_start,period_end,location_code,standard_days,daily_minutes,reason,source_reference,created_by,status,approved_by,approved_at)values('2026-09-01','2026-09-30','__UNASSIGNED__',26,480,'V2 isolated fixture','approved synthetic golden calendar','qa-fixture','APPROVED','qa-fixture',now())");
    // Reuse the established fixture/assertions, excluding its legacy env-loading
    // bootstrap and privileged database owner. The enclosing harness owns cleanup.
    const source = await readFile(new URL('test-local-payroll-v2.ps1', import.meta.url), 'utf8');
    const helpers = source.slice(source.indexOf('function Invoke-LocalSql'), source.indexOf('function Stop-TestApi')).replace('-U crm_local', '-U $env:LOCAL_TEST_ROLE');
    const body = source.slice(source.indexOf('  # The bootstrap seed'), source.lastIndexOf('\n}\nfinally')).replace('  $workers = @(', `  Invoke-LocalSql "insert into local_payroll_rule_versions(policy_group_id,rule_kind,overtime_type,calculation_method,multiplier,effective_from,effective_to,reason,source_reference,created_by,status,approved_by,approved_at)values('$($group.id)','OT','NORMAL','BASE_RATE_MULTIPLIER',1.5,'2026-09-01','2026-09-30','V2 isolated fixture','approved synthetic golden OT','qa-fixture','APPROVED','qa-fixture',now());"\n  $workers = @(`);
    assert.ok(helpers.includes('function Assert-Decimal') && body.includes('Local payroll V2 regression passed'), 'known fixture boundaries');
    const directory = await mkdtemp(path.join(tmpdir(), 'payroll-v2-owned-'));
    try {
      const script = path.join(directory, 'fixture.ps1');
      await writeFile(script, `$ErrorActionPreference='Stop'\n$port=$env:LOCAL_API_PORT\n$database=$env:LOCAL_TEST_DATABASE\n$container='crm-joliefam-local-postgres'\nfunction Get-LocalAuthHeaders([string]$Base){return @{Authorization=('Bearer '+$env:LOCAL_TEST_AUTH_TOKEN);Origin='https://crm.example.com'}}\n` + helpers + body);
      const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: 'inherit', env: { ...process.env, LOCAL_API_PORT: String(port), LOCAL_TEST_DATABASE: database, LOCAL_TEST_ROLE: role, LOCAL_TEST_AUTH_TOKEN: token } });
      const [code] = await once(child, 'exit'); assert.equal(code, 0, 'established payroll V2 financial regression');
    } finally { await rm(directory, { recursive: true, force: true }); }
  } else if (process.argv.includes('--console')) {
    const { runPayrollConsoleTests } = await import('./test-payroll-console-isolated.mjs');
    await runPayrollConsoleTests({ pool, base, token, admin, call, must });
  } else if (process.argv.includes('--optimization')) {
    const { runPayrollFlowOptimizationTests } = await import('./test-payroll-flow-optimization-isolated.mjs');
    await runPayrollFlowOptimizationTests({ pool, base, token, admin, call, must });
  } else if (process.argv.includes('--scope-concurrency')) {
    const child = spawn(process.execPath, ['scripts/test-local-payroll-scope-concurrency.mjs'], { cwd: new URL('..', import.meta.url), windowsHide: true, stdio: 'inherit', env: { ...process.env, LOCAL_API_URL: base, LOCAL_DATABASE_URL: connectionString, LOCAL_TEST_DATABASE: database, LOCAL_TEST_ISOLATED: '1', LOCAL_SYNC_AUTO: 'false', LOCAL_TEST_AUTH_TOKEN: token, LOCAL_TEST_ORIGIN: 'https://crm.example.com' } });
    const [code] = await once(child, 'exit'); assert.equal(code, 0, 'existing scope/concurrency regression');
  } else {
  await check('new approved attendance invalidates earlier preview lock', async () => {
    const w = await worker('2026-01-01'), p = period('01', w.id), run = await preview(p); await attendance(w, '2026-01-15');
    const immutable = (await pool.query('select * from local_payroll_runs where id=$1', [run.id])).rows;
    const audits = (await pool.query('select count(*)::int n from local_payroll_audit_events where entity_id=$1', [run.id])).rows[0].n;
    const result = await call('/api/payroll/runs/' + run.id + '/lock', 'POST', {}); assert.equal(result.status, 409, `stale lock status=${result.status} snapshotGross=${result.body?.gross_total}`);
    assert.equal((await pool.query('select status from local_payroll_runs where id=$1', [run.id])).rows[0].status, 'PREVIEW');
    assert.deepEqual((await pool.query('select * from local_payroll_runs where id=$1', [run.id])).rows, immutable);
    assert.equal((await pool.query('select status from local_payroll_periods where id=$1', [run.period_id])).rows[0].status, 'OPEN');
    assert.equal((await pool.query('select count(*)::int n from local_payroll_audit_events where entity_id=$1', [run.id])).rows[0].n, audits);
    assert.equal(Number((await must('/api/payroll/runs/' + run.id)).gross_total), 0);
    const fresh = await preview({ ...p, idempotency_key: key() }); const locked = await must('/api/payroll/runs/' + fresh.id + '/lock', 'POST', {}); assert.equal(locked.status, 'LOCKED'); assert.equal(Number(locked.gross_total), 100000);
    assert.deepEqual(await must('/api/payroll/runs/' + fresh.id + '/lock', 'POST', {}), locked, 'locked replay must preserve snapshot');
  });
  await check('pending adjustment blocks closure; resolved adjustment remains immutable after closure', async () => {
    const w = await worker('2026-03-01'), p = period('03', w.id), run = await preview(p);
    const a = await must('/api/payroll/adjustments', 'POST', { ...p, worker_id: w.id, item_type: 'BONUS', item_direction: 'EARNING', amount: 500000, reason: 'isolated QA', idempotency_key: key() });
    await must('/api/payroll/adjustments/' + a.id + '/submit', 'POST', { reason: 'isolated QA' });
    assert.equal((await call('/api/payroll/runs/' + run.id + '/lock', 'POST', {})).status,409);
    assert.equal((await pool.query('select status from local_payroll_periods where id=$1',[run.period_id])).rows[0].status,'OPEN');
    await must('/api/payroll/adjustments/'+a.id+'/reject','POST',{reason:'resolve pending before closing'});
    const fresh=await preview({...p,idempotency_key:key()}); await must('/api/payroll/runs/' + fresh.id + '/lock', 'POST', {});
    const before = (await pool.query('select * from local_payroll_runs where id=$1', [run.id])).rows; const audit = (await pool.query("select count(*)::int n from local_payroll_audit_events where entity_id=$1 and action='APPROVE'", [a.id])).rows[0].n;
    const result = await call('/api/payroll/adjustments/' + a.id + '/approve', 'POST', { reason: 'must reject closed period' }); assert.ok(result.status >= 400 && result.status < 500, 'closed approval response=' + JSON.stringify(result));
    assert.equal((await pool.query('select status from local_payroll_adjustments where id=$1', [a.id])).rows[0].status, 'REJECTED'); assert.deepEqual((await pool.query('select * from local_payroll_runs where id=$1', [run.id])).rows, before); assert.equal((await pool.query("select count(*)::int n from local_payroll_audit_events where entity_id=$1 and action='APPROVE'", [a.id])).rows[0].n, audit);
  });
  await check('approved overtime lacking rate on its work date is blocking instead of silently omitted', async () => {
    const w = await worker('2026-05-01', true), p = period('05', w.id); await pool.query("update local_worker_rates set effective_from='2026-05-15' where worker_id=$1", [w.id]);
    const source = (await pool.query("insert into local_overtime(worker_id,work_date,overtime_type,overtime_minutes,reason,status,idempotency_key)values($1,'2026-05-05','NORMAL_OVERTIME',120,'historical imported approved QA','APPROVED',$2)returning id", [w.id, key()])).rows[0];
    const preflight = await must('/api/payroll/preflight?standard_days=26&period_start=' + p.period_start + '&period_end=' + p.period_end + '&worker_ids=' + w.id); assert.equal(preflight.is_ready, false, 'per-day missing rate preflight=' + JSON.stringify(preflight));
    assert.ok(preflight.issues.some(x => x.severity === 'BLOCKING' && x.source_id === source.id), 'must identify exact missing-rate source');
    const result = await call('/api/payroll/runs', 'POST', p); assert.ok(result.status >= 400 || Number(result.body.blocking_exception_count) > 0, 'run must not permit a silently incomplete payroll');
  });
  await check('direct SQL cannot move source out of locked original period', async () => {
    const w = await worker('2026-07-01'), row = await attendance(w, '2026-07-15'), run = await preview(period('07', w.id)); await must('/api/payroll/runs/' + run.id + '/lock', 'POST', {});
    await assert.rejects(pool.query("update local_attendance set work_date='2026-08-15' where id=$1", [row.id]), /khóa|đóng|locked|closed/i);
    assert.equal((await pool.query('select work_date::text work_day from local_attendance where id=$1', [row.id])).rows[0].work_day, '2026-07-15');
  });
  await check('same attendance cannot be paid again in a different overlapping period', async () => {
    const w = await worker('2026-09-01'), row = await attendance(w, '2026-09-15'), run = await preview(period('09', w.id));
    assert.equal(Number(run.gross_total), 100000, 'numeric monthly2.6m /26days golden amount'); await must('/api/payroll/runs/' + run.id + '/lock', 'POST', {});
    const next = await call('/api/payroll/runs', 'POST', { period_start: '2026-09-10', period_end: '2026-09-20', standard_days: 26, worker_ids: [w.id], idempotency_key: key() });
    if (next.status < 300) { const lock = await call('/api/payroll/runs/' + next.body.id + '/lock', 'POST', {}); assert.ok(lock.status >= 400, `duplicate source ${row.id} paid again gross=${lock.body?.gross_total}, status=${lock.status}`); }
    else assert.ok(next.status < 500, 'overlap rejected as business conflict');
  });
  await check('approved fact before payroll profile coverage must block instead of borrowing later profile', async () => {
    const w = await worker('2026-06-01', true), p = period('06', w.id); await pool.query("update local_worker_payroll_profiles set effective_from='2026-06-15' where worker_id=$1", [w.id]);
    await pool.query("insert into local_overtime(worker_id,work_date,overtime_type,overtime_minutes,reason,status,idempotency_key)values($1,'2026-06-05','NORMAL_OVERTIME',120,'historical imported approved QA','APPROVED',$2)", [w.id, key()]);
    const preflight = await must('/api/payroll/preflight?standard_days=26&period_start=' + p.period_start + '&period_end=' + p.period_end + '&worker_ids=' + w.id);
    assert.equal(preflight.is_ready, false, 'fact before profile gap must be blocking'); assert.ok(preflight.issues.some(x => x.severity === 'BLOCKING'));
  });
  if (!baseline) {
    await check('adjustment concurrent retries actor audit rollback financial totals and closed mutations are atomic', async () => {
      const w = await worker('2025-01-01'); await attendance(w, '2025-01-15');
      const p = { period_start: '2025-01-01', period_end: '2025-01-31', standard_days: 26, worker_ids: [w.id], idempotency_key: key() };
      const payload = { ...p, worker_id: w.id, item_type: 'BONUS', item_direction: 'EARNING', amount: 25000, reason: 'isolated QA bonus', idempotency_key: key() };
      const attempts = await Promise.all([1,2].map(() => must('/api/payroll/adjustments', 'POST', payload)));
      assert.equal(attempts[0].id, attempts[1].id); const earning = attempts[0];
      assert.equal((await pool.query("select count(*)::int n from local_payroll_audit_events where entity_id=$1 and action='CREATE'", [earning.id])).rows[0].n, 1);
      const conflict = await call('/api/payroll/adjustments', 'POST', { ...payload, amount: 25001 }); assert.equal(conflict.status, 409);
      const createAdjustment = (amount, direction = 'EARNING') => must('/api/payroll/adjustments', 'POST', { ...payload, item_type: direction === 'DEDUCTION' ? 'SALARY_ADVANCE' : 'BONUS', item_direction: direction, amount, idempotency_key: key() });
      const deduction = await createAdjustment(10000, 'DEDUCTION'), draft = await createAdjustment(1111), submitted = await createAdjustment(2222);
      for (const a of [earning, deduction, submitted]) await must('/api/payroll/adjustments/' + a.id + '/submit', 'POST', { reason: 'isolated QA submit' });
      await pool.query(`create function qa_fail_payroll_audit()returns trigger language plpgsql as $$begin if new.entity_id='${earning.id}' and new.action='APPROVE' then raise exception 'QA injected audit failure';end if;return new;end$$;create trigger qa_fail_payroll_audit before insert on local_payroll_audit_events for each row execute function qa_fail_payroll_audit()`);
      try { const failed = await call('/api/payroll/adjustments/' + earning.id + '/approve', 'POST', { reason: 'isolated QA rollback' }); assert.ok(failed.status >= 400); assert.equal((await pool.query('select status,approved_by from local_payroll_adjustments where id=$1', [earning.id])).rows[0].status, 'SUBMITTED'); }
      finally { await pool.query('drop trigger qa_fail_payroll_audit on local_payroll_audit_events;drop function qa_fail_payroll_audit()'); }
      for (const a of [earning, deduction]) await must('/api/payroll/adjustments/' + a.id + '/approve', 'POST', { reason: 'isolated QA approve' });
      const actors = (await pool.query('select created_by,submitted_by,approved_by from local_payroll_adjustments where id=$1', [earning.id])).rows[0]; for (const actor of Object.values(actors)) assert.ok(String(actor).includes(admin), 'real caller attribution');
      const auditActors = (await pool.query('select actor_id from local_payroll_audit_events where entity_id=$1', [earning.id])).rows; assert.ok(auditActors.every(row => String(row.actor_id).includes(admin)));
      const blocked=await call('/api/payroll/runs','POST',p); assert.equal(blocked.status,409,'draft/submitted adjustments require resolution');
      for(const adjustment of [draft,submitted]) await must('/api/payroll/adjustments/'+adjustment.id+'/reject','POST',{reason:'resolve unpaid draft before lock'});
      const run = await preview({...p,idempotency_key:key()}); assert.equal(Number(run.gross_total), 125000); assert.equal(Number(run.deductions_total), 10000); assert.equal(Number(run.net_total), 115000); assert.equal(Number(run.payment_total), 115000);
      const locked = await must('/api/payroll/runs/' + run.id + '/lock', 'POST', {}); assert.deepEqual(await must('/api/payroll/runs/' + run.id + '/lock', 'POST', {}), locked);
      for (const [id, action, method, body] of [[draft.id, '', 'PATCH', { item_type: 'BONUS', item_direction: 'EARNING', amount: 9999, reason: 'closed patch' }], [draft.id, '/submit', 'POST', { reason: 'closed submit' }], [submitted.id, '/reject', 'POST', { reason: 'closed reject' }]]) { const result = await call('/api/payroll/adjustments/' + id + action, method, body); assert.equal(result.status, 409, action + ' must reject closed'); }
      assert.equal((await pool.query('select status from local_payroll_adjustments where id=$1', [draft.id])).rows[0].status, 'REJECTED'); assert.equal((await pool.query('select status from local_payroll_adjustments where id=$1', [submitted.id])).rows[0].status, 'REJECTED');
    });
    await check('same-flag profile versions permit exact boundary overtime; changed flag fails closed', async () => {
      const w = await worker('2025-06-01', true); await pool.query("update local_worker_payroll_profiles set effective_to='2025-06-14' where worker_id=$1", [w.id]);
      await pool.query("insert into local_worker_payroll_profiles(worker_id,overtime_enabled,effective_from,status,reason,idempotency_key,request_hash)values($1,true,'2025-06-15','APPROVED','isolated QA',$2,'fixture')", [w.id, key()]);
      for (const date of ['2025-06-14','2025-06-15']) await pool.query("insert into local_overtime(worker_id,work_date,overtime_type,overtime_minutes,reason,status,idempotency_key)values($1,$2,'NORMAL_OVERTIME',120,'historical approved QA','APPROVED',$3)", [w.id, date, key()]);
      const url = '/api/payroll/preflight?standard_days=26&period_start=2025-06-01&period_end=2025-06-30&worker_ids=' + w.id; assert.equal((await must(url)).is_ready, true);
      const run = await preview({ period_start: '2025-06-01', period_end: '2025-06-30', standard_days: 26, worker_ids: [w.id], idempotency_key: key() }); assert.equal(run.items.filter(x => x.source_type === 'OVERTIME').length, 2); assert.ok(Math.abs(Number(run.gross_total) - 75000) < 0.01);
      await pool.query("update local_worker_payroll_profiles set overtime_enabled=false where worker_id=$1 and effective_from='2025-06-15'", [w.id]); assert.equal((await must(url)).is_ready, false);
    });
    await check('concurrent adjustment approval versus payroll lock cannot silently omit approved money', async () => {
      const w = await worker('2025-11-01'), p = { period_start: '2025-11-01', period_end: '2025-11-30', standard_days: 26, worker_ids: [w.id], idempotency_key: key() }; const run = await preview(p);
      const a = await must('/api/payroll/adjustments', 'POST', { ...p, worker_id: w.id, item_type: 'BONUS', item_direction: 'EARNING', amount: 500000, reason: 'isolated race QA', idempotency_key: key() }); await must('/api/payroll/adjustments/' + a.id + '/submit', 'POST', { reason: 'isolated race QA' });
      const [lock, approve] = await Promise.all([call('/api/payroll/runs/' + run.id + '/lock', 'POST', {}), call('/api/payroll/adjustments/' + a.id + '/approve', 'POST', { reason: 'isolated race QA' })]);
      assert.ok(!(lock.status < 300 && approve.status < 300), 'lock and post-preview approval cannot both succeed'); assert.ok(lock.status < 300 || approve.status < 300, 'one serialized operation succeeds');
      const saved = (await pool.query('select status from local_payroll_adjustments where id=$1', [a.id])).rows[0].status; assert.equal(saved, approve.status < 300 ? 'APPROVED' : 'SUBMITTED');
      assert.equal((await pool.query('select status from local_payroll_runs where id=$1', [run.id])).rows[0].status, lock.status < 300 ? 'LOCKED' : 'PREVIEW');
    });
    await check('direct adjustment SQL and period-first API mutation avoid inverse row-lock cycle', async () => {
      const w = await worker('2025-12-01');
      const a = await must('/api/payroll/adjustments', 'POST', { worker_id: w.id, period_start: '2025-12-01', period_end: '2025-12-31', item_type: 'BONUS', item_direction: 'EARNING', amount: 4444, reason: 'isolated lock order QA', idempotency_key: key() });
      const holder = await pool.connect(), direct = await pool.connect(); let directUpdate, apiPatch;
      try {
        await holder.query('begin'); await holder.query("set local statement_timeout='5s'"); await holder.query("select pg_advisory_xact_lock_shared(hashtextextended('local-attendance-payroll-source-guard',0))"); await holder.query('select id from local_payroll_periods where id=$1 for update', [a.period_id]);
        apiPatch = call('/api/payroll/adjustments/' + a.id, 'PATCH', { item_type: 'BONUS', item_direction: 'EARNING', amount: 5555, reason: 'API after direct SQL' });
        await direct.query('begin'); await direct.query("set local statement_timeout='3s'");
        directUpdate = direct.query("update local_payroll_adjustments set reason='direct SQL audit fixture' where id=$1", [a.id]);
        let timer; try { const finished = await Promise.race([directUpdate.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 2000); })]); assert.equal(finished, true, 'row trigger must not wait for the period row while holding adjustment row'); } finally { clearTimeout(timer); }
        await directUpdate; await direct.query('commit'); await holder.query('commit'); const response = await apiPatch; assert.equal(response.status, 200, JSON.stringify(response));
        assert.equal(Number((await pool.query('select amount from local_payroll_adjustments where id=$1', [a.id])).rows[0].amount), 5555);
      } finally {
        await holder.query('rollback').catch(() => undefined); await directUpdate?.catch(() => undefined); await direct.query('rollback').catch(() => undefined); await apiPatch?.catch(() => undefined); holder.release(); direct.release();
      }
    });
  }
  console.log(JSON.stringify({ mode: baseline ? 'baseline' : 'regression', passed: findings.length, failed: failures.length, failures }, null, 2));
  if (!baseline && failures.length) process.exitCode = 1;
  }
} finally {
  if (api && api.exitCode === null) { api.kill(); await Promise.race([once(api, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]); }
  await pool?.end(); if (created) control(`drop database ${database} with (force)`); control(`drop role if exists ${role}`); assert.ok(!logs.includes(secret)); console.log('CLEANUP own disposable payroll database role and API removed');
}
