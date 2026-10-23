// Security regressions run only against a fresh disposable database. Never reads .env.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import pg from 'pg';
import { refreshPermissionProjections, hasAuthoritativeSecuritySource } from './sync-supabase-to-local.mjs';

const suffix = process.pid + '_' + Date.now();
const database = 'permission_qa_' + suffix, role = 'permission_role_' + suffix;
const dbPassword = randomBytes(24).toString('hex');
const connectionString = `postgres://${role}:${dbPassword}@127.0.0.1:55432/${database}`;
const container = 'crm-joliefam-local-postgres';
const adminSql = statement => {
  const result = spawnSync('docker', ['exec', container, 'psql', '-U', 'crm_local', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Isolated PostgreSQL control failed: ' + result.stderr);
  return result.stdout;
};
const names = ['admin', 'manager', 'otherManager', 'accountant', 'employee', 'foreignEmployee', 'teamLeader'];
const users = Object.fromEntries(names.map(name => [name, randomUUID()]));
const workers = Object.fromEntries([...names, 'team', 'outside', 'expired'].map(name => [name, randomUUID()]));
const fixturePassword = 'PermissionFixtureOnly!123';
const salt = randomBytes(16).toString('hex');
const passwordHash = `scrypt$${salt}$${scryptSync(fixturePassword, salt, 64).toString('hex')}`;
const capabilities = ['payroll_view', 'payroll_team_view', 'payroll_worker_manage', 'payroll_rate_view', 'payroll_rate_manage', 'payroll_policy_manage', 'payroll_insurance_manage', 'payroll_bank_manage', 'payroll_audit'];
const expected = {
  admin: capabilities,
  manager: capabilities.filter(p => !['payroll_insurance_manage', 'payroll_bank_manage'].includes(p)),
  otherManager: capabilities.filter(p => !['payroll_insurance_manage', 'payroll_bank_manage'].includes(p)),
  accountant: ['payroll_view', 'payroll_rate_view', 'payroll_insurance_manage', 'payroll_bank_manage', 'payroll_audit'],
  employee: ['payroll_view'],
  foreignEmployee: [],
  teamLeader: ['payroll_view', 'payroll_team_view', 'payroll_worker_manage'],
};
let api, pool, created = false, logs = '', base;
const failures = [], checks = [];
const check = async (label, action) => {
  try { await action(); checks.push(label); console.log('PASS ' + label); }
  catch (error) { failures.push({ label, error: error.message }); console.error('FAIL ' + label + ': ' + error.message); }
};
const request = async (path, token, method = 'GET', body) => {
  const response = await fetch(base + path, { method, headers: { origin: 'https://crm.example.com', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const status = (response, wanted, label) => { assert.equal(response.status, wanted, label + ': ' + JSON.stringify(response.body)); return response.body; };
try {
  adminSql(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${dbPassword}'`);
  adminSql(`create database ${database} owner ${role}`); created = true;
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening'); const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  base = 'http://127.0.0.1:' + port;
  // Deny outbound fetch in the API process. Database traffic uses its dedicated isolated role.
  const blockNetwork = 'globalThis.fetch=async()=>{throw new Error("QA outbound fetch blocked")};';
  api = spawn(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(blockNetwork), 'server-dist/index.js'], {
    cwd: new URL('..', import.meta.url), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', PUBLIC_APP_URL: 'https://crm.example.com', LOCAL_DATABASE_URL: connectionString, LOCAL_API_PORT: String(port), LOCAL_API_HOST: '127.0.0.1', LOCAL_SYNC_AUTO: 'false', LOCAL_AUTH_SUPABASE_BRIDGE: 'false', LOCAL_DEMO_AUTH: 'false', LOCAL_INTEGRATION_API: 'false' },
  });
  api.stdout.on('data', data => logs += data); api.stderr.on('data', data => logs += data);
  let ready = false;
  for (let attempt = 0; attempt < 160; attempt++) {
    if (api.exitCode !== null) throw new Error('Isolated API exited before health');
    try { const response = await fetch(base + '/health'); if ((await response.json()).database === database) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Isolated API ready');
  pool = new pg.Pool({ connectionString });
  assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper, false);
  assert.equal((await pool.query('select count(*)::int n from local_workers')).rows[0].n, 0);
  for (const name of names) {
    const userRole = name === 'otherManager' ? 'manager' : name === 'foreignEmployee' ? 'employee' : name === 'teamLeader' ? 'team_leader' : name;
    await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active) values($1,$1,$2,$3,true)', [users[name], name + '@permissions.invalid', passwordHash]);
    await pool.query('insert into local_user_roles(user_id,role,assigned_by) values($1,$2,$3)', [users[name], userRole, name === 'employee' ? users.manager : name === 'foreignEmployee' ? users.otherManager : users.admin]);
  }
  for (const [name, id] of Object.entries(workers)) await pool.query('insert into local_workers(id,user_id,employee_code,display_name) values($1,$2,$3,$4)', [id, users[name] || null, 'QA-' + name, 'Kiểm thử ' + name]);
  for (const member of ['team', 'expired']) await pool.query("insert into local_payroll_team_assignments(supervisor_worker_id,worker_id,effective_from,effective_to,reason,status) values($1,$2,'2020-01-01',$3,'QA scope','ACTIVE')", [workers.teamLeader, workers[member], member === 'expired' ? '2020-12-31' : null]);
  await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled) values($1,'payroll_view',true),($2,'payroll_view',true),($2,'payroll_team_view',true),($2,'payroll_worker_manage',true),($1,'production_view',true),($1,'legacy_hidden_permission',true)", [users.employee, users.teamLeader]);
  for (const name of ['manager', 'employee', 'team', 'outside']) {
    await pool.query("insert into local_payroll_bank_accounts(worker_id,account_number,account_name,bank_name,effective_from,reason) values($1,'123456789012','QA account','QA Bank','2020-01-01','QA')", [workers[name]]);
    await pool.query("insert into local_social_insurance_versions(worker_id,employee_amount,effective_from,source_reference,reason) values($1,100000,'2020-01-01','QA','QA')", [workers[name]]);
  }
  const tokens = {};
  for (const name of names) tokens[name] = status(await request('/api/local-auth/login', null, 'POST', { email: name + '@permissions.invalid', password: fixturePassword }), 200, name + ' login').token;
  for (const name of names) await check(name + ' exact nine capability matrix', async () => {
    const rows = status(await request('/api/payroll/capabilities?userId=' + users.admin, tokens[name]), 200, name);
    assert.equal(rows.length, 9); assert.deepEqual(rows.filter(p => p.allowed).map(p => p.permission_type).sort(), [...expected[name]].sort());
    assert.deepEqual(rows.filter(p => p.delegable).map(p => p.permission_type).sort(), ['payroll_view', 'payroll_team_view', 'payroll_worker_manage'].sort());
  });
  await check('employee delegated payroll view returns own row only', async () => {
    const rows = status(await request('/api/payroll/workers', tokens.employee), 200, 'self workers');
    assert.deepEqual(rows.map(row => row.id), [workers.employee]);
    assert.equal((await request('/api/payroll/worker-profiles?workerId=' + workers.outside, tokens.employee)).status, 403);
  });
  await check('team view excludes outside and expired assignments', async () => {
    const rows = status(await request('/api/payroll/workers', tokens.teamLeader), 200, 'team workers');
    assert.deepEqual(rows.map(row => row.id).sort(), [workers.teamLeader, workers.team].sort());
    for (const name of ['outside', 'expired']) assert.equal((await request('/api/payroll/worker-profiles?workerId=' + workers[name], tokens.teamLeader)).status, 403, name);
    assert.equal((await request('/api/payroll/workers/' + workers.outside, tokens.teamLeader, 'PATCH', { position_title: 'Forbidden' })).status, 403);
    for (const extra of [{ effective_from: '2020-06-01' }, { onDate: '2020-06-01' }]) assert.equal((await request('/api/payroll/workers/' + workers.expired + '?onDate=2020-06-01', tokens.teamLeader, 'PATCH', { position_title: 'Backdate must not restore assignment', ...extra })).status, 403);
  });
  await check('accountant may read rates but cannot change policy', async () => {
    assert.equal((await request('/api/payroll/rates', tokens.accountant)).status, 200);
    assert.equal((await request('/api/payroll/policy-groups', tokens.accountant, 'POST', { code: 'DENIED', name: 'Forbidden', reason: 'QA' })).status, 403);
    assert.equal((await pool.query("select count(*)::int n from local_payroll_policy_groups where code='DENIED'")).rows[0].n, 0);
  });
  await check('manager sensitive lists restricted to self and bank number masked', async () => {
    const bank = status(await request('/api/payroll/bank-accounts', tokens.manager), 200, 'manager bank');
    assert.deepEqual(bank.map(row => row.worker_id), [workers.manager]); assert.equal(bank[0].account_number, null); assert.ok(bank[0].account_number_masked.endsWith('9012'));
    const insurance = status(await request('/api/payroll/insurance', tokens.manager), 200, 'manager insurance');
    assert.deepEqual(insurance.map(row => row.worker_id), [workers.manager]);
    assert.equal((await request('/api/payroll/bank-accounts?workerId=' + workers.outside, tokens.manager)).status, 403);
    assert.equal((await request('/api/payroll/bank-accounts', tokens.manager, 'POST', {})).status, 403);
    assert.equal((await request('/api/payroll/insurance', tokens.manager, 'POST', {})).status, 403);
    assert.equal(status(await request('/api/payroll/bank-accounts', tokens.accountant), 200, 'accountant bank').length, 4);
  });
  await check('legacy aliases cannot bypass payroll capabilities', async () => {
    for (const path of ['/api/rates', '/api/payroll/rates', '/api/payroll/product-rates']) assert.equal((await request(path, tokens.employee)).status, 403, path);
    for (const path of ['/api/local-table/worker_compensation_rates', '/api/local-snapshot/worker_compensation_rates', '/api/local-table/payroll_bank_accounts']) assert.equal((await request(path, tokens.employee)).status, 403, path);
    for (const path of ['/api/rates', '/api/payroll/rates']) assert.equal((await request(path, tokens.accountant, 'POST', {})).status, 403, path);
  });
  await check('payroll delegation cannot bypass production privileged mutations', async () => {
    for (const path of ['/api/production-attendance/assignments', '/api/production-stage-events/' + randomUUID() + '/status']) assert.equal((await request(path, tokens.employee, 'POST', {})).status, 403, path);
  });
  await check('production-only employee can load safe attendance roster aliases', async () => {
    await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'production_view',true)", [users.foreignEmployee]);
    const rows = status(await request('/api/workers', tokens.foreignEmployee), 200, 'production workers');
    assert.ok(Array.isArray(rows)); assert.ok(rows.some(row => row.id === workers.foreignEmployee), 'own worker in roster');
    for (const row of rows) for (const field of ['bank_account_number', 'password_hash', 'rate_amount', 'fixed_allowance_amount']) assert.equal(row[field], undefined, field);
    assert.equal((await request('/api/worker-methods', tokens.foreignEmployee)).status, 200, 'safe attendance methods');
    assert.equal((await request('/api/payroll/rates', tokens.foreignEmployee)).status, 403, 'production does not expose rates');
  });
  await check('delegated worker manage cannot create a pay rate through worker-methods', async () => {
    const before = (await pool.query('select count(*)::int n from local_worker_rates')).rows[0].n;
    assert.equal((await request('/api/worker-methods', tokens.teamLeader, 'POST', { worker_id: workers.team, workerId: workers.team, attendance_method: 'HOUR', attendanceMethod: 'HOUR', rate_amount: 999999, rateAmount: 999999, effective_from: '2026-01-01', effectiveFrom: '2026-01-01', reason: 'QA' })).status, 403);
    assert.equal((await pool.query('select count(*)::int n from local_worker_rates')).rows[0].n, before);
  });
  const patchPermission = (target, token, permissions) => request('/api/users/' + users[target] + '/permissions', token, 'PUT', { permissions, reason: 'Kiểm thử quyền' });
  await check('permission patch preserves hidden/unsubmitted grants and real audit actor', async () => {
    const response = status(await patchPermission('employee', tokens.manager, [{ permission_type: 'orders', enabled: true }]), 200, 'patch grant');
    const grants = (await pool.query('select permission_type,enabled,assigned_by from local_employee_permissions where user_id=$1', [users.employee])).rows;
    assert.ok(grants.some(row => row.permission_type === 'production_view' && row.enabled)); assert.ok(grants.some(row => row.permission_type === 'legacy_hidden_permission' && row.enabled));
    assert.equal(grants.find(row => row.permission_type === 'orders').assigned_by, users.manager);
    assert.equal((await pool.query('select actor_id from local_auth_audit_events where id=$1', [response.audit_id])).rows[0].actor_id, users.manager);
    status(await patchPermission('employee', tokens.manager, [{ permission_type: 'orders', enabled: false }]), 200, 'revoke grant');
    assert.equal((await request('/api/orders', tokens.employee)).status, 403, 'revocation effective on existing session');
  });
  await check('invalid permission payloads reject atomically', async () => {
    const before = JSON.stringify((await pool.query('select permission_type,enabled from local_employee_permissions where user_id=$1 order by permission_type', [users.employee])).rows);
    for (const permissions of [null, {}, [{ permission_type: 'orders' }], [{ permission_type: 'orders', enabled: null }], [{ permission_type: 'orders', enabled: 'false' }], [{ permission_type: 'nonexistent', enabled: true }], [{ permission_type: 'orders', enabled: true }, { permission_type: 'orders', enabled: false }], [{ permission_type: 'orders', enabled: true }, { permission_type: 'customers' }]]) {
      assert.ok([400, 403].includes((await patchPermission('employee', tokens.manager, permissions)).status), JSON.stringify(permissions));
      assert.equal(JSON.stringify((await pool.query('select permission_type,enabled from local_employee_permissions where user_id=$1 order by permission_type', [users.employee])).rows), before);
    }
  });
  await check('manager cannot patch foreign employee/accountant/admin or grant sensitive payroll', async () => {
    for (const target of ['foreignEmployee', 'accountant', 'admin', 'manager']) assert.equal((await patchPermission(target, tokens.manager, [{ permission_type: 'orders', enabled: true }])).status, 403, target);
    for (const permission of ['payroll_rate_manage', 'payroll_policy_manage', 'payroll_bank_manage']) assert.equal((await patchPermission('employee', tokens.admin, [{ permission_type: permission, enabled: true }])).status, 403, permission);
  });
  await check('identity CRUD enforces assigned-manager scope and prevents elevation', async () => {
    assert.equal((await request('/api/users', tokens.manager, 'POST', { email: 'forbidden@permissions.invalid', password: fixturePassword, role: 'admin' })).status, 403);
    assert.equal((await request('/api/users/' + users.foreignEmployee, tokens.manager, 'PATCH', { first_name: 'Forbidden' })).status, 403);
    assert.equal((await request('/api/users/' + users.foreignEmployee, tokens.manager, 'DELETE')).status, 403);
    assert.equal((await request('/api/users/' + users.employee, tokens.manager, 'PATCH', { role: 'admin' })).status, 403);
    assert.equal((await request('/api/users/' + users.foreignEmployee + '/worker-link', tokens.manager, 'PATCH', { worker_id: null, reason: 'Forbidden' })).status, 403);
    const before = (await pool.query('select assigned_by from local_user_roles where user_id=$1 and is_active', [users.employee])).rows[0].assigned_by;
    status(await request('/api/users/' + users.employee, tokens.admin, 'PATCH', { first_name: 'Updated', role: 'employee' }), 200, 'same-role edit');
    assert.equal((await pool.query('select assigned_by from local_user_roles where user_id=$1 and is_active', [users.employee])).rows[0].assigned_by, before, 'same role must preserve manager');
  });
  await check('delegated payroll profile bundle cannot mutate money or insurance', async () => {
    for (const extra of [{ primary_amount: 999999 }, { insurance_enabled: true, insurance_amount: 100000 }, { fixed_allowance_amount: 1234 }, { fixed_deduction_amount: 1234 }]) {
      const response = await request('/api/payroll/worker-profile-bundle', tokens.teamLeader, 'POST', { worker_id: workers.team, compensation_type: 'HOURLY', effective_from: '2026-01-01', reason: 'QA', ...extra });
      assert.equal(response.status, 403, JSON.stringify(extra));
    }
  });
  await check('source projection refresh, tombstones and local overrides', async () => {
    const sourceUser = randomUUID(), overrideUser = randomUUID();
    for (const id of [sourceUser, overrideUser]) await pool.query('insert into local_user_profiles(id,user_id,email,is_active)values($1,$1,$2,true)', [id, id + '@projection.invalid']);
    const source = async (table, key, payload, deleted = false) => pool.query("insert into local_source_snapshots(source_table,source_key,payload,source_hash,is_deleted)values($1,$2,$3::jsonb,'fixture',$4)on conflict(source,source_schema,source_table,source_key)do update set payload=excluded.payload,is_deleted=excluded.is_deleted", [table, key, JSON.stringify(payload), deleted]);
    const project = async () => {
      const client = await pool.connect();
      try { await client.query('begin'); await refreshPermissionProjections(client); await client.query('commit'); }
      catch (error) { await client.query('rollback'); throw error; }
      finally { client.release(); }
    };
    await source('user_roles', 'role-fixture', { user_id: sourceUser, role: 'employee', assigned_by: users.manager });
    await source('employee_permissions', 'permission-fixture', { user_id: sourceUser, permission_type: 'orders', enabled: true });
    await project();
    assert.equal((await pool.query('select role,assigned_by,is_active from local_user_roles where user_id=$1', [sourceUser])).rows[0].assigned_by, users.manager);
    assert.equal((await pool.query('select enabled from local_employee_permissions where user_id=$1 and permission_type=\'orders\'', [sourceUser])).rows[0].enabled, true);
    await source('employee_permissions', 'permission-fixture', { user_id: sourceUser, permission_type: 'orders', enabled: false });
    await project();
    assert.equal((await pool.query('select enabled from local_employee_permissions where user_id=$1 and permission_type=\'orders\'', [sourceUser])).rows[0].enabled, false);
    // A source record can change semantic keys; old active roles/grants must not survive.
    await source('user_roles', 'role-fixture', { user_id: sourceUser, role: 'accountant', assigned_by: users.admin });
    await source('employee_permissions', 'permission-fixture', { user_id: sourceUser, permission_type: 'quotes', enabled: true });
    await project();
    assert.deepEqual((await pool.query('select role from local_user_roles where user_id=$1 and is_active', [sourceUser])).rows.map(row => row.role), ['accountant']);
    assert.equal((await pool.query('select enabled from local_employee_permissions where user_id=$1 and permission_type=\'orders\'', [sourceUser])).rows[0]?.enabled ?? false, false);
    await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled,is_snapshot_record,source_snapshot_key)values($1,'customers',true,true,'not-in-this-read')", [sourceUser]);
    await project();
    assert.equal((await pool.query('select enabled from local_employee_permissions where user_id=$1 and permission_type=\'customers\'', [sourceUser])).rows[0].enabled, true, 'absence alone must not revoke');
    await source('employee_permissions', 'permission-fixture', { user_id: sourceUser, permission_type: 'quotes', enabled: true }, true);
    await source('user_roles', 'role-fixture', { user_id: sourceUser, role: 'accountant', assigned_by: users.admin }, true);
    await project();
    assert.equal((await pool.query('select enabled from local_employee_permissions where user_id=$1 and permission_type=\'quotes\'', [sourceUser])).rows[0].enabled, false);
    assert.equal((await pool.query('select count(*)::int n from local_user_roles where user_id=$1 and is_active', [sourceUser])).rows[0].n, 0);
    await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled,local_modified_at)values($1,'orders',false,now())", [overrideUser]);
    await pool.query("insert into local_user_roles(user_id,role,assigned_by,local_modified_at)values($1,'employee',$2,now())", [overrideUser, users.manager]);
    await source('employee_permissions', 'override-permission', { user_id: overrideUser, permission_type: 'quotes', enabled: true });
    await source('user_roles', 'override-role', { user_id: overrideUser, role: 'admin' });
    await project();
    assert.deepEqual((await pool.query('select permission_type,enabled from local_employee_permissions where user_id=$1', [overrideUser])).rows, [{ permission_type: 'orders', enabled: false }]);
    assert.deepEqual((await pool.query('select role,assigned_by from local_user_roles where user_id=$1 and is_active', [overrideUser])).rows, [{ role: 'employee', assigned_by: users.manager }]);
  });
  await check('security sync requires authoritative service context, never user-token reads', async () => {
    const fakeJwt = role => 'fixture.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.fixture';
    assert.equal(hasAuthoritativeSecuritySource({}), false);
    assert.equal(hasAuthoritativeSecuritySource({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' }), false);
    assert.equal(hasAuthoritativeSecuritySource({ SUPABASE_ANON_KEY: fakeJwt('anon') }), false);
    assert.equal(hasAuthoritativeSecuritySource({ SUPABASE_SERVICE_ROLE_KEY: fakeJwt('authenticated') }), false);
    assert.equal(hasAuthoritativeSecuritySource({ SUPABASE_SERVICE_ROLE_KEY: fakeJwt('service_role') }), true);
    assert.equal(hasAuthoritativeSecuritySource({ SUPABASE_SECRET_KEY: 'sb_secret_fixture_not_a_real_key' }), true);
    assert.equal(hasAuthoritativeSecuritySource({ SUPABASE_SECRET_KEY: 'sb_secret_fixture_not_a_real_key', SUPABASE_ACCESS_TOKEN: 'fixture-user-token' }), false);
    assert.equal(hasAuthoritativeSecuritySource({ SUPABASE_SERVICE_ROLE_KEY: fakeJwt('service_role'), SUPABASE_USER_ACCESS_TOKEN: 'fixture-user-token' }), false);
  });
  assert.ok(!logs.includes(dbPassword), 'No database credentials in API logs');
  console.log(`Permission API: ${checks.length} passed, ${failures.length} failed.`);
  if (failures.length) throw new Error(failures.map(item => item.label + ': ' + item.error).join('\n'));
} finally {
  if (api && api.exitCode === null) { api.kill(); await Promise.race([once(api, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]); }
  if (pool) await pool.end();
  if (created) adminSql(`drop database ${database} with (force)`);
  adminSql(`drop role if exists ${role}`);
}
