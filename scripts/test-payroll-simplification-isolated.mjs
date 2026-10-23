// Runs only inside the existing owned, unprivileged, outbound-disabled fixture.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createServer, request as httpRequest } from 'node:http';
import { readFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function runPayrollSimplificationTests({ pool, base, token, admin, call, must }) {
  const passed = [], failed = [], key = () => randomUUID();
  const check = async (label, action) => { try { await action(); passed.push(label); console.log('PASS ' + label); } catch (error) { failed.push({ label, error: error.message }); console.log('FAIL ' + label + ': ' + error.message); } };
  const tables = { assignment_id: 'local_worker_compensation_assignments', profile_id: 'local_worker_payroll_profiles', rate_id: 'local_worker_rates', insurance_id: 'local_social_insurance_versions' };
  const selection = b => Object.fromEntries([['assignment_id', b.assignment], ['profile_id', b.profile], ['rate_id', b.rate], ['insurance_id', b.insurance]].filter(([, row]) => row).map(([field, row]) => [field, row.id]));
  const review = (worker, selected) => must('/api/payroll/worker-profile-bundle/review', 'POST', { worker_id: worker.id, selection: selected });
  const request = (worker, selected, r, extras = {}) => ({ worker_id: worker.id, selection: selected, expected_fingerprint: r.fingerprint, reason: 'isolated exact bundle QA', idempotency_key: key(), ...extras });
  const approve = body => must('/api/payroll/worker-profile-bundle/approve', 'POST', body);
  async function fixture({ insurance = false, start = '2023-01-01', end = null, type = 'MONTHLY_HELPER' } = {}) {
    const worker = await must('/api/workers', 'POST', { employee_code: 'SIMPLE-' + key(), display_name: 'Nhân sự bộ lương QA', worker_type: 'HELPER' });
    const group = await must('/api/payroll/policy-groups', 'POST', { code: 'SIMPLE-' + key(), name: 'Nhóm bộ lương QA', reason: 'isolated QA' });
    const payload = { worker_id: worker.id, compensation_type: type, payroll_policy_group_id: group.id, effective_from: start, effective_to: end, ...(type === 'PIECE_RATE' ? {} : { primary_amount: 2400000 }), reason: 'isolated QA', idempotency_key: key(), ...(insurance ? { insurance_enabled: true, insurance_amount: 777321, insurance_source_reference: 'QA private insurance source' } : {}) };
    const bundle = await must('/api/payroll/worker-profile-bundle', 'POST', payload);
    return { worker, group, payload, bundle, selected: selection(bundle) };
  }
  const states = async selected => Object.fromEntries(await Promise.all(Object.entries(selected).map(async ([field, id]) => [field, (await pool.query('select * from ' + tables[field] + ' where id=$1', [id])).rows[0]])));
  const counts = async selected => (await pool.query("select count(*)::int n from local_payroll_audit_events where entity_id=any($1::uuid[]) and action='APPROVE'", [Object.values(selected)])).rows[0].n;
  async function session(role, email = role + '-' + key() + '@simplification.invalid') {
    const id = key(), password = 'SimplificationFixture!222', salt = randomBytes(16).toString('hex'), passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
    await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)', [id, email, passwordHash]);
    await pool.query('insert into local_user_roles(user_id,role)values($1,$2)', [id, role]);
    const auth = await must('/api/local-auth/login', 'POST', { email, password });
    const callAs = async (url, method = 'GET', body) => { const response = await fetch(base + url, { method, headers: { origin: 'https://crm.example.com', authorization: 'Bearer ' + auth.token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: response.status, body: await response.json().catch(() => null) }; };
    return { id, callAs, email, password };
  }

  await check('exact bundle approval commits every selected component, actor audit and receipt once', async () => {
    const f = await fixture({ insurance: true }), r = await review(f.worker, f.selected), body = request(f.worker, f.selected, r);
    assert.equal(r.fingerprint.length, 64); const result = await approve(body); assert.equal(result.approved, true);
    const saved = await states(f.selected); assert.ok(Object.values(saved).every(row => row.status === 'APPROVED'));
    assert.equal(await counts(f.selected), 4);
    const audits = (await pool.query("select actor_id from local_payroll_audit_events where entity_id=any($1::uuid[]) and action='APPROVE'", [Object.values(f.selected)])).rows;
    assert.ok(audits.every(row => String(row.actor_id).includes(admin)));
    assert.equal((await pool.query('select count(*)::int n from local_payroll_bundle_approvals where idempotency_key=$1', [body.idempotency_key])).rows[0].n, 1);
    assert.equal((await approve(body)).reused, true); assert.equal(await counts(f.selected), 4);
    const conflict = await call('/api/payroll/worker-profile-bundle/approve', 'POST', { ...body, reason: 'different reviewed action' }); assert.equal(conflict.status, 409);
  });
  for (const mode of ['insurance', 'audit']) await check('forced ' + mode + ' failure rolls back all earlier approvals, predecessors, audit and receipt', async () => {
    const f = await fixture({ insurance: true }); await approve(request(f.worker, f.selected, await review(f.worker, f.selected)));
    const next = await must('/api/payroll/worker-profile-bundle', 'POST', { ...f.payload, effective_from: '2023-02-01', primary_amount: 2500000, idempotency_key: key() });
    const selected = selection(next), body = request(f.worker, selected, await review(f.worker, selected));
    const beforeOld = await states(f.selected), beforeNew = await states(selected), beforeAudit = await counts(selected);
    const table = mode === 'insurance' ? 'local_social_insurance_versions' : 'local_payroll_audit_events';
    const condition = mode === 'insurance' ? `new.id='${selected.insurance_id}' and new.status='APPROVED'` : `new.entity_id='${selected.insurance_id}' and new.action='APPROVE'`;
    await pool.query(`create function qa_fail_bundle()returns trigger language plpgsql as $$begin if ${condition} then raise exception 'QA injected late bundle failure';end if;return new;end$$;create trigger qa_fail_bundle before ${mode === 'insurance' ? 'update' : 'insert'} on ${table} for each row execute function qa_fail_bundle()`);
    try {
      const result = await call('/api/payroll/worker-profile-bundle/approve', 'POST', body); assert.ok(result.status >= 400);
      assert.deepEqual(await states(f.selected), beforeOld); assert.deepEqual(await states(selected), beforeNew); assert.equal(await counts(selected), beforeAudit);
      assert.equal((await pool.query('select count(*)::int n from local_payroll_bundle_approvals where idempotency_key=$1', [body.idempotency_key])).rows[0].n, 0);
    } finally { await pool.query('drop trigger qa_fail_bundle on ' + table + ';drop function qa_fail_bundle()'); }
    assert.equal((await approve(body)).approved, true, 'same request can recover after transaction rollback');
  });
  await check('wrong worker, inconsistent range and compensation type fail without partial mutation', async () => {
    const a = await fixture(), b = await fixture();
    let response = await call('/api/payroll/worker-profile-bundle/review', 'POST', { worker_id: a.worker.id, selection: { ...a.selected, rate_id: b.selected.rate_id } }); assert.equal(response.status, 409);
    await pool.query("update local_worker_rates set effective_from='2023-01-02' where id=$1", [a.selected.rate_id]); response = await call('/api/payroll/worker-profile-bundle/review', 'POST', { worker_id: a.worker.id, selection: a.selected }); assert.equal(response.status, 409);
    await pool.query("update local_worker_rates set effective_from='2023-01-01',compensation_type='HOURLY',attendance_method='HOUR' where id=$1", [a.selected.rate_id]); response = await call('/api/payroll/worker-profile-bundle/review', 'POST', { worker_id: a.worker.id, selection: a.selected }); assert.equal(response.status, 409);
    assert.ok(Object.values(await states(a.selected)).every(row => row.status === 'DRAFT')); assert.equal(await counts(a.selected), 0);
  });
  await check('enabled insurance without selected draft or one approved covering version blocks the whole bundle', async () => {
    const f = await fixture({ insurance: true }), selected = { ...f.selected }; delete selected.insurance_id;
    const response = await call('/api/payroll/worker-profile-bundle/review', 'POST', { worker_id: f.worker.id, selection: selected }); assert.equal(response.status, 409);
    assert.ok(Object.values(await states(f.selected)).every(row => row.status === 'DRAFT')); assert.equal(await counts(f.selected), 0);
  });
  await check('stale component content and changed approved predecessor invalidate reviewed fingerprint', async () => {
    const f = await fixture(), old = await review(f.worker, f.selected), body = request(f.worker, f.selected, old);
    await pool.query('update local_worker_rates set rate_amount=rate_amount+1 where id=$1', [f.selected.rate_id]);
    assert.equal((await call('/api/payroll/worker-profile-bundle/approve', 'POST', body)).status, 409);
    await approve(request(f.worker, f.selected, await review(f.worker, f.selected)));
    const next = await must('/api/payroll/worker-profile-bundle', 'POST', { ...f.payload, effective_from: '2023-03-01', idempotency_key: key() }), selected = selection(next), reviewed = await review(f.worker, selected);
    await pool.query("update local_worker_rates set reason='changed predecessor fixture' where id=$1", [f.selected.rate_id]);
    assert.equal((await call('/api/payroll/worker-profile-bundle/approve', 'POST', request(f.worker, selected, reviewed))).status, 409);
    assert.ok(Object.values(await states(selected)).every(row => row.status === 'DRAFT'));
  });
  await check('extra unrelated draft stays untouched through explicit selected save and approval', async () => {
    const f = await fixture();
    const extra = (await pool.query("insert into local_worker_rates(worker_id,compensation_type,attendance_method,rate_amount,effective_from,status,reason)values($1,'MONTHLY_HELPER','DAY',999999,'2024-01-01','DRAFT','unrelated draft') returning *", [f.worker.id])).rows[0];
    const saved = await must('/api/payroll/worker-profile-bundle', 'POST', { ...f.payload, primary_amount: 2450000, idempotency_key: key(), selected_drafts: { ...f.selected } }); assert.equal(saved.rate.id, f.selected.rate_id);
    await approve(request(f.worker, f.selected, await review(f.worker, f.selected)));
    assert.deepEqual((await pool.query('select * from local_worker_rates where id=$1', [extra.id])).rows[0], extra);
  });
  await check('concurrent same-key retries return one durable approval and reject conflicting payload', async () => {
    const f = await fixture(), body = request(f.worker, f.selected, await review(f.worker, f.selected));
    const result = await Promise.all([approve(body), approve(body)]); assert.ok(result.every(r => r.approved)); assert.equal(result.filter(r => r.reused).length, 1); assert.equal(await counts(f.selected), 3);
    const response = await call('/api/payroll/worker-profile-bundle/approve', 'POST', { ...body, selection: { ...f.selected, rate_id: null } }); assert.equal(response.status, 409); assert.equal(await counts(f.selected), 3);
  });
  await check('same global idempotency key across different workers yields one approval and one clean conflict', async () => {
    const a = await fixture(), b = await fixture(), shared = key();
    const payloads = await Promise.all([a, b].map(async f => request(f.worker, f.selected, await review(f.worker, f.selected), { idempotency_key: shared })));
    const results = await Promise.all(payloads.map(body => call('/api/payroll/worker-profile-bundle/approve', 'POST', body)));
    assert.equal(results.filter(r => r.status === 200).length, 1, JSON.stringify(results)); assert.equal(results.filter(r => r.status === 409).length, 1, JSON.stringify(results));
    for (let n = 0; n < results.length; n++) { const selected = [a, b][n].selected; assert.ok(Object.values(await states(selected)).every(row => row.status === (results[n].status === 200 ? 'APPROVED' : 'DRAFT'))); assert.equal(await counts(selected), results[n].status === 200 ? 3 : 0); }
  });
  await check('standalone approval versus bundle approval serializes without partial bundle', async () => {
    const f = await fixture(), body = request(f.worker, f.selected, await review(f.worker, f.selected));
    const [bundle, standalone] = await Promise.all([call('/api/payroll/worker-profile-bundle/approve', 'POST', body), call('/api/payroll/rates/' + f.selected.rate_id + '/approve', 'POST', { reason: 'isolated standalone race' })]);
    assert.ok(bundle.status < 300 || standalone.status < 300, JSON.stringify({ bundle, standalone }));
    const saved = await states(f.selected);
    if (bundle.status < 300) assert.ok(Object.values(saved).every(row => row.status === 'APPROVED'));
    else { assert.equal(saved.assignment_id.status, 'DRAFT'); assert.equal(saved.profile_id.status, 'DRAFT'); assert.equal(saved.rate_id.status, 'APPROVED'); }
    assert.equal(await counts({ rate_id: f.selected.rate_id }), 1);
  });
  await check('manager omitted insurance preserves approved flag without revealing sensitive amount; cannot disable or select insurance', async () => {
    const f = await fixture({ insurance: true }); await approve(request(f.worker, f.selected, await review(f.worker, f.selected)));
    const manager = await session('manager'), body = { ...f.payload, effective_from: '2023-04-01', idempotency_key: key() }; delete body.insurance_enabled; delete body.insurance_amount; delete body.insurance_source_reference;
    const saved = await manager.callAs('/api/payroll/worker-profile-bundle', 'POST', body); assert.equal(saved.status, 200, JSON.stringify(saved)); assert.equal(saved.body.profile.insurance_enabled, true); assert.equal(saved.body.insurance, null); assert.ok(!JSON.stringify(saved.body).includes('777321'));
    const selected = selection(saved.body); const reviewed = await manager.callAs('/api/payroll/worker-profile-bundle/review', 'POST', { worker_id: f.worker.id, selection: selected }); assert.equal(reviewed.status, 200, JSON.stringify(reviewed)); assert.ok(!JSON.stringify(reviewed.body).includes('777321'));
    const approved = await manager.callAs('/api/payroll/worker-profile-bundle/approve', 'POST', request(f.worker, selected, reviewed.body)); assert.equal(approved.status, 200, JSON.stringify(approved));
    const disabled = await manager.callAs('/api/payroll/worker-profile-bundle', 'POST', { ...body, insurance_enabled: false }); assert.equal(disabled.status, 403);
    const sensitive = await manager.callAs('/api/payroll/worker-profile-bundle/review', 'POST', { worker_id: f.worker.id, selection: { ...selected, insurance_id: f.selected.insurance_id } }); assert.equal(sensitive.status, 403);
    const read = await manager.callAs('/api/payroll/insurance?workerId=' + f.worker.id); assert.equal(read.status, 403);
  });
  await check('manager cannot approve hidden insurance disable via preexisting draft selection', async () => {
    const f = await fixture({ insurance: true }); await approve(request(f.worker, f.selected, await review(f.worker, f.selected)));
    const next = await must('/api/payroll/worker-profile-bundle', 'POST', { ...f.payload, insurance_enabled: false, effective_from: '2023-05-01', idempotency_key: key() });
    const selected = selection(next), before = await states(selected), adminReview = await review(f.worker, selected), manager = await session('manager');
    const body = { ...f.payload, effective_from: '2023-05-01', selected_drafts: selected, primary_amount: 3333333, idempotency_key: key() }; delete body.insurance_enabled; delete body.insurance_amount; delete body.insurance_source_reference;
    assert.equal((await manager.callAs('/api/payroll/worker-profile-bundle', 'POST', body)).status, 403, 'manager cannot save hidden insurance disable');
    assert.deepEqual(await states(selected), before, 'save rejection preserves selected drafts');
    const result = await manager.callAs('/api/payroll/worker-profile-bundle/review', 'POST', { worker_id: f.worker.id, selection: selected }); assert.equal(result.status, 403, 'manager cannot review a draft disabling approved insurance');
    assert.equal((await manager.callAs('/api/payroll/worker-profile-bundle/approve', 'POST', request(f.worker, selected, adminReview))).status, 403, 'manager cannot reuse admin reviewed fingerprint to disable insurance');
    assert.deepEqual(await states(selected), before); assert.equal(await counts(selected), 0);
  });
  await check('manager cannot save review or approve hidden insurance enable via existing draft', async () => {
    const f = await fixture(); await approve(request(f.worker, f.selected, await review(f.worker, f.selected)));
    const next = await must('/api/payroll/worker-profile-bundle', 'POST', { ...f.payload, insurance_enabled: true, insurance_amount: 777321, insurance_source_reference: 'QA private enable', effective_from: '2023-06-01', idempotency_key: key() });
    const selected = selection(next), core = { ...selected }; delete core.insurance_id;
    const before = await states(selected), adminReview = await review(f.worker, selected), manager = await session('manager');
    const body = { ...f.payload, effective_from: '2023-06-01', selected_drafts: core, primary_amount: 3333333, idempotency_key: key() };
    assert.equal((await manager.callAs('/api/payroll/worker-profile-bundle', 'POST', body)).status, 403, 'manager cannot save hidden insurance enable');
    assert.equal((await manager.callAs('/api/payroll/worker-profile-bundle/review', 'POST', { worker_id: f.worker.id, selection: core })).status, 403, 'manager cannot review hidden enable');
    assert.equal((await manager.callAs('/api/payroll/worker-profile-bundle/approve', 'POST', request(f.worker, core, adminReview))).status, 403, 'manager cannot approve hidden enable without insurance component');
    assert.deepEqual(await states(selected), before); assert.equal(await counts(selected), 0);
  });
  await check('manager insurance preservation ignores unrelated future draft flag when saving an earlier period', async () => {
    const f = await fixture({ insurance: true }); await approve(request(f.worker, f.selected, await review(f.worker, f.selected)));
    const future = await must('/api/payroll/worker-profile-bundle', 'POST', { ...f.payload, insurance_enabled: false, effective_from: '2030-01-01', idempotency_key: key() });
    const futureBefore = await states(selection(future));
    const manager = await session('manager'), body = { ...f.payload, effective_from: '2024-01-01', effective_to: '2024-12-31', selected_drafts: { assignment_id: null, profile_id: null, rate_id: null, insurance_id: null }, idempotency_key: key() }; delete body.insurance_enabled; delete body.insurance_amount; delete body.insurance_source_reference;
    const result = await manager.callAs('/api/payroll/worker-profile-bundle', 'POST', body); assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(result.body.profile.insurance_enabled, true, 'future false draft must not disable approved earlier insurance');
    assert.deepEqual(await states(selection(future)), futureBefore);
    const reviewed = await manager.callAs('/api/payroll/worker-profile-bundle/review', 'POST', { worker_id: f.worker.id, selection: selection(result.body) }); assert.equal(reviewed.status, 200, JSON.stringify(reviewed));
  });
  await check('employee and accountant cannot review or approve salary bundles', async () => {
    const f = await fixture(), body = request(f.worker, f.selected, await review(f.worker, f.selected));
    for (const role of ['employee', 'accountant']) { const user = await session(role); for (const operation of ['review', 'approve']) assert.equal((await user.callAs('/api/payroll/worker-profile-bundle/' + operation, 'POST', body)).status, 403, role + operation); }
    assert.ok(Object.values(await states(f.selected)).every(row => row.status === 'DRAFT')); assert.equal(await counts(f.selected), 0);
  });
  console.log(JSON.stringify({ suite: 'payroll simplification exact bundle', passed: passed.length, failed: failed.length, failures: failed }, null, 2));
  if (failed.length) throw new Error(failed.length + ' simplification regression groups failed');
  if (process.argv.includes('--serve')) {
    await pool.query("update local_workers set payroll_status='SUSPENDED' where payroll_status='ACTIVE'");
    const f = await fixture({ start: '2025-02-01' });
    await pool.query("update local_workers set employee_code='GUI-SIMPLE-READY',display_name='Nhân sự GUI tháng 02',employment_start_date='2025-02-01' where id=$1", [f.worker.id]);
    await approve(request(f.worker, f.selected, await review(f.worker, f.selected)));
    const calendar = await must('/api/payroll/calendar-versions', 'POST', { period_start: '2025-02-01', period_end: '2025-02-28', location_code: '__UNASSIGNED__', standard_days: 24, daily_minutes: 480, reason: 'GUI synthetic calendar', source_reference: 'QA approved synthetic24' });
    await must('/api/payroll/calendar-versions/' + calendar.id + '/approve', 'POST', { reason: 'GUI isolated approval' });
    const attendance = await must('/api/attendance', 'POST', { worker_id: f.worker.id, attendance_method: 'DAY', work_date: '2025-02-15', day_units: 1, idempotency_key: key() });
    await must('/api/attendance/status', 'POST', { attendance_record_id: attendance.id, target_status: 'APPROVED', reason: 'GUI isolated approval', idempotency_key: key() });
    const gui = []; for (const role of ['admin', 'manager', 'accountant', 'employee']) gui.push(await session(role, 'gui-' + role + '@simplification.invalid'));
    const guiDraft = await fixture({ start: '2025-02-01' }); await pool.query("update local_workers set employee_code='GUI-SIMPLE-DRAFT',display_name='Nhân sự GUI cần duyệt',payroll_status='SUSPENDED' where id=$1", [guiDraft.worker.id]);
    await serveFixture({ base, logins: gui.map(({ email, password }) => ({ email, password })), worker: f.worker.id });
  }
}

async function serveFixture({ base, logins, worker }) {
  const root = path.resolve(String(process.env.CRM_PAYROLL_QA_DIST || '')); assert.ok(process.env.CRM_PAYROLL_QA_DIST, 'explicit frontend directory required'); await stat(path.join(root, 'index.html'));
  const directory = await mkdtemp(path.join(tmpdir(), 'crm-payroll-simplification-ui-')), stopfile = path.join(directory, 'stop');
  const frontend = createServer(async (req, res) => {
    if (req.url.startsWith('/api/') || req.url === '/health') { const upstream = httpRequest(base + req.url, { method: req.method, headers: { ...req.headers, origin: 'https://crm.example.com', host: 'crm.example.com' } }, reply => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); }); upstream.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(upstream); return; }
    try { let file = path.resolve(root, '.' + new URL(req.url, 'http://127.0.0.1').pathname); if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; } try { if (!(await stat(file)).isFile()) file = path.join(root, 'index.html'); } catch { file = path.join(root, 'index.html'); } res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' })[path.extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); } catch { res.writeHead(500); res.end(); }
  });
  try { frontend.listen(0, '127.0.0.1'); await once(frontend, 'listening'); console.log(JSON.stringify({ fixtureOrigin: 'http://127.0.0.1:' + frontend.address().port, stopfile, expiresInMinutes: 30, logins, worker, period: '2025-02', expectedGross: 100000 })); const deadline = Date.now() + 1800000; while (Date.now() < deadline) { if (await stat(stopfile).then(() => true, () => false)) break; await new Promise(resolve => setTimeout(resolve, 500)); } }
  finally { frontend.closeAllConnections(); await new Promise(resolve => frontend.close(resolve)); await rm(directory, { recursive: true, force: true }); console.log('CLEANUP simplification frontend and owned stop directory removed'); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { const child = spawn(process.execPath, ['scripts/test-payroll-integrity-isolated.mjs', '--simplification', ...process.argv.slice(2)], { cwd: new URL('..', import.meta.url), windowsHide: true, stdio: 'inherit', env: process.env }); const [code] = await once(child, 'exit'); process.exitCode = code; }
