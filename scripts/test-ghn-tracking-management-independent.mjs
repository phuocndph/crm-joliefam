// TEST-ONLY independent adversarial verification of GHN tracking management.
// Creates a random, isolated database/role; never uses the operational database,
// .env, the running API, or a real GHN transport. Run only after production freeze.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import vm from 'node:vm';
import express from 'express';
import pg from 'pg';
import ts from 'typescript';
import { GhnTrackingManagement, ghnPrincipal, ghnVisibleSql, registerGhnTrackingManagement } from '../server/ghn-tracking.ts';
import { ExternalReadAdapters } from '../server/external-read-adapters.ts';

const suffix = `${process.pid}_${Date.now()}`;
const database = `ghn_management_qa_${suffix}`, role = `ghn_management_role_${suffix}`;
assert.match(database, /^ghn_management_qa_\d+_\d+$/);
assert.match(role, /^ghn_management_role_\d+_\d+$/);
const password = randomBytes(24).toString('hex');
const port = Number(process.env.GHN_TEST_DB_PORT || 16543);
assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
let pool, databaseCreated = false, roleCreated = false;
const checks = [], failures = [], calls = [];
const baseConfig = { token: 'synthetic-tracking-token-only', primaryShop: '123', shops: ['123', '456'], configured: true, source: 'saved', mode: 'ENABLED', revision: 1, hasSavedKey: true };
let config, providerMode, printMode, mutation, printMutation, detailGate, detailEntered, secondPrintGate, secondPrintEntered, cancelled;
const control = sql => {
  const result = spawnSync('docker', ['exec', 'crm-joliefam-local-postgres', 'psql', '-U', 'crm_local', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Disposable GHN management database control failed.');
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const detail = code => ({
  order_code: code, shop_id: code.includes('456') ? 456 : 123, status: 'delivering',
  to_name: `test Recipient ${code}`, to_phone: '0900000003', to_address: '789 Synthetic address',
  to_ward_name: 'Synthetic Ward', to_district_name: 'Synthetic District', to_province_name: 'Synthetic Province',
  weight: 1500, cod_amount: code.includes('ZERO') ? 0 : 123456,
  created_date: '2026-10-20T03:00:00Z', leadtime: 1793062800, finish_date: '0001-01-01T00:00:00Z',
  note: 'Synthetic provider note',
});
const provider = async (rawUrl, init = {}) => {
  const url = new URL(rawUrl), endpoint = url.pathname.split('/public-api/')[1];
  assert.equal(url.origin, 'https://online-gateway.ghn.vn');
  assert.equal(init.headers.Token, config.token);
  assert.equal(init.redirect, 'error');
  assert.ok(init.signal instanceof AbortSignal);
  const body = init.body ? JSON.parse(init.body) : Object.fromEntries(url.searchParams);
  calls.push({ endpoint, method: init.method, shop: init.headers.ShopId, body: structuredClone(body) });
  if (endpoint === 'v2/shop/all') return json({ code: 200, data: { shops: [
    { _id: 123, status: 1, district_id: 1452, name: 'Synthetic shop 123' },
    { _id: 456, status: 1, district_id: 1453, name: 'Synthetic shop 456' },
  ], last_offset: 0 } });
  if (endpoint === 'v2/shipping-order/detail') {
    const code = String(body.order_code || '');
    if (detailEntered) { const notify = detailEntered; detailEntered = undefined; notify(); await detailGate; }
    if (mutation) { const action = mutation; mutation = undefined; await action(); }
    if (providerMode === 'network' || code.includes('FAIL')) throw new TypeError('synthetic-tracking-token-only PRIVATE provider failure');
    if (providerMode === 'http') return json({ code: 500, message: 'synthetic-tracking-token-only PRIVATE' }, 500);
    if (providerMode === 'malformed') return json({ code: 200, data: {} });
    const data = detail(code);
    if (providerMode === 'wrong-code') data.order_code = 'OTHER-CODE';
    if (providerMode === 'wrong-shop') data.shop_id = 999;
    if (providerMode === 'bad-cod') data.cod_amount = -1;
    if (providerMode === 'bad-weight') data.weight = Number.MAX_SAFE_INTEGER;
    return json({ code: 200, data });
  }
  if (endpoint === 'v2/a5/gen-token') {
    assert.equal(init.method, 'POST');
    assert.ok(Array.isArray(body.order_codes) && body.order_codes.length);
    assert.deepEqual(Object.keys(body), ['order_codes']);
    if (printMutation) { const action = printMutation; printMutation = undefined; await action(); }
    if (String(init.headers.ShopId) === '456' && secondPrintEntered) { const notify = secondPrintEntered; secondPrintEntered = undefined; notify(); await secondPrintGate; }
    if (printMode === 'network') throw new TypeError('synthetic-tracking-token-only PRIVATE print failure');
    if (printMode === 'abort') throw new DOMException('PRIVATE', 'AbortError');
    if (printMode === 'http') return json({ code: 500, message: 'PRIVATE synthetic-tracking-token-only' }, 500);
    if (printMode === 'business') return json({ code: 401, message: 'PRIVATE synthetic-tracking-token-only' });
    if (printMode === 'malformed') return new Response('{PRIVATE not-json');
    if (printMode === 'bad-token') return json({ code: 200, data: { token: 'https://attacker.invalid/PRIVATE' } });
    if (printMode === 'oversize') return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2_000_001)); }, cancel() { cancelled = true; } }));
    return json({ code: 200, data: { token: `synthetic-tracking-print-${init.headers.ShopId}`, ignored: 'PRIVATE' } });
  }
  assert.fail(`Unexpected synthetic GHN endpoint ${endpoint}`);
};
const rejected = (action, status) => assert.rejects(action, error => {
  if (status) assert.equal(error.status, status, error.message);
  assert.equal(String(error.message).includes('PRIVATE'), false);
  assert.equal(String(error.message).includes(baseConfig.token), false);
  return true;
});
const snapshot = async () => (await pool.query("select jsonb_build_object('tracking',(select coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]'::jsonb) from local_ghn_tracking g),'tombstones',(select coalesce(jsonb_agg(to_jsonb(t) order by t.source_table,t.source_key),'[]'::jsonb) from local_projection_tombstones t),'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from local_auth_audit_events a))::text data")).rows[0].data;
const saved = async code => (await pool.query('select to_jsonb(g) data from local_ghn_tracking g where ghn_order_code=$1', [code])).rows[0]?.data;
const seed = async (code, { orderId = null, manager = 'manager', tenant = 'tenant-one', rawShop = 123 } = {}) => {
  await pool.query(`insert into local_ghn_tracking(id,ghn_order_code,order_id,internal_order_code,customer_name,customer_phone,customer_address,package_weight,cod_amount,ghn_status,ghn_status_text,created_date,expected_delivery_date,tracking_notes,raw_data,manager_id,tenant_id)
    values($1,$2,$3,$4,'Keep recipient','0900000000','Keep address',2.345,987654.32,'picking','Keep label','2026-01-01T01:02:03.123456Z','2026-01-03T01:02:03Z','Keep notes',$5::jsonb,$6,$7)`,
  [`row-${code}`, code, orderId, orderId ? 'OLD-DISPLAY-NUMBER' : null, rawShop === null ? null : JSON.stringify({ shop_id: rawShop, keep: ['original', 0] }), manager, tenant]);
};
const reset = async () => {
  await pool.query('truncate local_ghn_tracking,local_orders,local_projection_tombstones,local_auth_audit_events,local_employee_permissions,local_user_roles,local_user_profiles,integration_private.ghn_settings');
  await pool.query(`insert into local_user_profiles values('admin',true),('manager',true),('other',true),('employee',true),('inactive',false);
    insert into local_user_roles values('admin','admin',null,true),('manager','manager',null,true),('other','manager',null,true),('employee','employee','manager',true),('inactive','manager',null,true);
    insert into local_employee_permissions values('employee','ghn_tracking',true);
    insert into local_orders values('order-one','RENAMED-ORDER','RENAMED-DISPLAY','manager','tenant-one','processing'),('order-two','SECOND','SECOND','manager','tenant-one','processing'),('order-other','OTHER','OTHER','other','tenant-two','processing');
    insert into integration_private.ghn_settings(id,mode,api_key,primary_shop_id,allowed_shop_ids,revision,updated_by) values(true,'ENABLED','synthetic-tracking-token-only','123',array['123','456'],1,'admin');`);
  config = structuredClone(baseConfig); providerMode = ''; printMode = ''; mutation = undefined; printMutation = undefined; detailGate = undefined; detailEntered = undefined; secondPrintGate = undefined; secondPrintEntered = undefined; cancelled = false; calls.length = 0;
};
const check = async (name, action) => {
  await reset();
  try { await action(); checks.push(name); console.log('PASS GHN management: ' + name); }
  catch (error) {
    const failure = { name, message: String(error.message).slice(0, 1600), at: String(error.stack || '').split('\n').find(line => line.includes('test-ghn-tracking-management-independent.mjs:'))?.trim() || '' };
    failures.push(failure); console.error('GHN_MANAGEMENT_FAILED ' + JSON.stringify(failure));
  }
};

try {
  control(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${password}'`); roleCreated = true;
  control(`create database ${database} owner ${role}`); databaseCreated = true;
  pool = new pg.Pool({ host: '127.0.0.1', port, database, user: role, password, max: 10 });
  assert.equal((await pool.query('select current_database() db')).rows[0].db, database);
  const migration = await readFile(new URL('../server/db/migrations/013_local_shipping_ghn.sql', import.meta.url), 'utf8');
  const trackingTable = migration.match(/CREATE TABLE IF NOT EXISTS local_ghn_tracking \([\s\S]*?\n\);/)[0];
  const tombstoneMigration = await readFile(new URL('../server/db/migrations/046_local_projection_tombstones.sql', import.meta.url), 'utf8');
  const tombstoneTable = tombstoneMigration.match(/CREATE TABLE IF NOT EXISTS local_projection_tombstones \([\s\S]*?\n\);/)[0];
  await pool.query(`create table local_user_profiles(user_id text primary key,is_active boolean);
    create table local_user_roles(user_id text,role text,assigned_by text,is_active boolean);
    create table local_employee_permissions(user_id text,permission_type text,enabled boolean);
    create table local_orders(id text primary key,order_number text,display_order_number text,manager_id text,tenant_id text,status text);
    ${tombstoneTable}
    create table local_auth_audit_events(id bigint generated always as identity,entity_type text,entity_id text,action text,actor_id text,reason text,before_data jsonb,after_data jsonb,created_at timestamptz default now());
    ${trackingTable}`);
  await pool.query(await readFile(new URL('../server/db/migrations/061_local_external_integration_settings.sql', import.meta.url), 'utf8'));
  const adapter = new ExternalReadAdapters({}, provider, async () => structuredClone(config));
  const service = new GhnTrackingManagement(pool, adapter, provider);

  await check('optional Orders hydration omits GHN for finance-only accountants without hiding auth/database failures', async () => {
    // Extract the actual optional-hydration statement block from the Orders
    // route; importing server/index.ts would start the operational application.
    const index = await readFile(new URL('../server/index.ts', import.meta.url), 'utf8');
    const parsed = ts.createSourceFile('server/index.ts', index, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let statements;
    const visit = node => {
      if (ts.isBlock(node)) {
        const start = node.statements.findIndex(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(parsed) === 'trackingPrincipal'));
        const end = node.statements.findIndex((statement, i) => i >= start && ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(parsed) === 'tracking'));
        if (start >= 0 && end >= start) statements = node.statements.slice(start, end + 1).map(statement => statement.getText(parsed)).join('\n');
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed); assert.ok(statements, 'actual Orders hydration statements found');
    const javascript = ts.transpileModule(`async function hydrate(pool, currentLocalActor, ids, ghnPrincipal, ghnVisibleSql) { ${statements}\n return tracking; }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const hydrate = vm.runInNewContext(javascript + '\nhydrate;', { Error });
    await seed('FINANCELINK123', { orderId: 'order-one' });
    await pool.query("insert into local_user_profiles values('accountant',true);insert into local_user_roles values('accountant','accountant','manager',true)");
    for (const permission of ['cash_flow', 'reports', 'transactions']) {
      await pool.query("delete from local_employee_permissions where user_id='accountant'");
      await pool.query("insert into local_employee_permissions values('accountant',$1,true)", [permission]);
      const result = await hydrate(pool, () => 'accountant', ['order-one'], ghnPrincipal, ghnVisibleSql);
      assert.ok(Array.isArray(result.rows) && result.rows.length === 0, permission + ' may read Orders without obtaining GHN links');
      await rejected(() => service.list('accountant', {}), 403, 'optional hydration must not broaden direct GHN permission');
    }
    await pool.query("insert into local_employee_permissions values('accountant','ghn_tracking',true)");
    const authorized = await hydrate(pool, () => 'accountant', ['order-one'], ghnPrincipal, ghnVisibleSql);
    assert.equal(authorized.rows[0].ghn_order_code, 'FINANCELINK123');
    await pool.query("update local_user_profiles set is_active=false where user_id='accountant'");
    await rejected(() => hydrate(pool, () => 'accountant', ['order-one'], ghnPrincipal, ghnVisibleSql), 401);
    await rejected(() => hydrate(pool, () => 'missing-actor', ['order-one'], ghnPrincipal, ghnVisibleSql), 401);
    const sentinel = new Error('synthetic hydration database outage');
    await assert.rejects(() => hydrate({ query: async () => { throw sentinel; } }, () => 'manager', ['order-one'], ghnPrincipal, ghnVisibleSql), error => error === sentinel);
    const trackingFailure = new Error('synthetic tracking read outage');
    const failingTracking = { query: async (...args) => typeof args[0] === 'string' && args[0].includes('select g.id,g.order_id,g.ghn_order_code') ? Promise.reject(trackingFailure) : pool.query(...args) };
    await assert.rejects(() => hydrate(failingTracking, () => 'manager', ['order-one'], ghnPrincipal, ghnVisibleSql), error => error === trackingFailure);
    const other403 = Object.assign(new Error('Different authorization failure'), { status: 403 });
    await assert.rejects(() => hydrate(pool, () => 'manager', ['order-one'], async () => { throw other403; }, ghnVisibleSql), error => error === other403);
    assert.equal(calls.length, 0);
  });

  await check('by-order uses canonical ID despite rename, returns every code and manager scope', async () => {
    await seed('KEEP123', { orderId: 'order-one' }); await seed('KEEP456', { orderId: 'order-one', rawShop: 456 });
    const result = await service.byOrder('manager', 'order-one');
    assert.equal(result.rows.length, 2); assert.deepEqual([...result.orderCodes].sort(), ['KEEP123', 'KEEP456']);
    assert.ok(result.rows.every(row => row.order_id === 'order-one'));
    await rejected(() => service.byOrder('other', 'order-one'), 404);
    await rejected(() => service.byOrder('inactive', 'order-one'));
    assert.equal(calls.length, 0);
  });
  await check('recipient convention overrides linked CRM/cache, supports suffixes and search, preserves scope without writes', async () => {
    const cases = [['2588p','2588'],['2588P','2588'],['2588h','2588'],['2588H','2588'],['123','123'],['12345','12345'],['12',null],['123456',null],['1234x',null],['1234 note','1234']];
    for (let i=0;i<cases.length;i++) {
      await seed('NAME'+i, { orderId: i===0 ? 'order-one' : null });
      await pool.query("update local_ghn_tracking set customer_name=$2,internal_order_code='STALE-CRM' where ghn_order_code=$1", ['NAME'+i,'Recipient_'+cases[i][0]]);
    }
    await seed('FOREIGN123', { orderId: 'order-other', manager: 'other', tenant: 'tenant-two' });
    const before = await snapshot();
    const result = await service.list('manager', {});
    for (let i=0;i<cases.length;i++) assert.equal(result.rows.find(row=>row.ghn_order_code==='NAME'+i).internal_order_code,cases[i][1]);
    assert.equal(result.rows.some(row=>row.ghn_order_code==='FOREIGN123'),false);
    assert.equal((await service.list('manager',{search:'2588'})).total,4);
    assert.equal((await service.list('manager',{search:'RENAMED-DISPLAY'})).total,0);
    assert.equal(await snapshot(),before); assert.equal(calls.length,0);
    await pool.query("update local_ghn_tracking set customer_name='Recipient_9999H' where ghn_order_code='NAME0'");
    assert.equal((await service.byOrder('manager','order-one')).rows[0].internal_order_code,'9999');
    await pool.query("update local_ghn_tracking set raw_data=jsonb_build_object('local_ghn_status_refresh',jsonb_build_object('to_name','Recipient_7777p')) where ghn_order_code='NAME0'");
    assert.equal((await service.byOrder('manager','order-one')).rows[0].internal_order_code,'7777');
    assert.equal((await service.list('manager',{search:'7777'})).total,1);
  });
  await check('unchanged replacement preserves every stored byte and never calls provider', async () => {
    await seed('KEEP123', { orderId: 'order-one' }); await seed('KEEP456', { orderId: 'order-one', rawShop: 456 });
    const before = await snapshot();
    await service.replaceOrderCodes('manager', 'order-one', { orderCodes: ['KEEP456', 'KEEP123', 'KEEP123'], expectedOrderCodes: ['KEEP123', 'KEEP456'] });
    assert.equal(await snapshot(), before); assert.equal(calls.length, 0);
  });
  await check('differential removal detaches only removed code, preserving remaining metadata and no tombstones', async () => {
    await seed('KEEP123', { orderId: 'order-one' }); await seed('REMOVE456', { orderId: 'order-one', rawShop: 456 });
    const kept = await saved('KEEP123'), removed = await saved('REMOVE456');
    await service.replaceOrderCodes('manager', 'order-one', { orderCodes: ['KEEP123'], expectedOrderCodes: ['KEEP123', 'REMOVE456'] });
    assert.deepEqual(await saved('KEEP123'), kept);
    const after = await saved('REMOVE456'); assert.equal(after.order_id, null); assert.equal(after.internal_order_code, null);
    for (const key of Object.keys(removed)) if (!['order_id', 'internal_order_code', 'updated_at', 'local_modified_at'].includes(key)) assert.deepEqual(after[key], removed[key], key);
    assert.equal((await pool.query('select count(*)::int n from local_projection_tombstones')).rows[0].n, 0); assert.equal(calls.length, 0);
  });
  await check('new import gets complete provider metadata, COD zero, actor ownership and repeat does not overwrite', async () => {
    await service.import('manager', { ghn_order_code: 'IMPORTZERO' });
    const imported = await saved('IMPORTZERO');
    assert.equal(imported.manager_id, 'manager'); assert.notEqual(imported.manager_id, 'local-admin');
    assert.equal(imported.customer_name, 'test Recipient IMPORTZERO'); assert.equal(imported.customer_phone, '0900000003');
    assert.match(imported.customer_address, /Synthetic address/); assert.match(imported.customer_address, /Synthetic Province/);
    assert.equal(Number(imported.package_weight), 1500); assert.equal(Number(imported.cod_amount), 0);
    assert.ok(imported.created_date && imported.expected_delivery_date); assert.equal(imported.delivered_date, null);
    assert.equal(imported.raw_data.shop_id, 123); assert.equal(imported.ghn_status, 'delivering');
    const before = await saved('IMPORTZERO');
    await service.import('manager', { ghn_order_code: 'IMPORTZERO' });
    const repeated = await saved('IMPORTZERO');
    for (const key of Object.keys(before)) if (!['updated_at', 'local_modified_at', 'last_updated_at'].includes(key)) assert.deepEqual(repeated[key], before[key], key);
    assert.equal((await pool.query("select count(*)::int n from local_ghn_tracking where ghn_order_code='IMPORTZERO'")).rows[0].n, 1, 'repeat import must not duplicate tracking');
    const list = await service.list('manager', {}); assert.ok(list.rows.some(row => row.ghn_order_code === 'IMPORTZERO'));
  });
  await check('link existing standalone preserves metadata, rejects conflicting order and never adopts foreign row', async () => {
    await seed('STANDALONE'); const before = await saved('STANDALONE');
    await service.import('manager', { ghn_order_code: 'STANDALONE', order_id: 'order-one' });
    const after = await saved('STANDALONE'); assert.equal(after.id, before.id); assert.equal(after.order_id, 'order-one');
    for (const key of ['customer_name', 'customer_phone', 'customer_address', 'package_weight', 'cod_amount', 'raw_data', 'tracking_notes', 'created_date']) assert.deepEqual(after[key], before[key], key);
    await rejected(() => service.import('manager', { ghn_order_code: 'STANDALONE', order_id: 'order-two' }), 409);
    await seed('FOREIGN', { manager: 'other', tenant: 'tenant-two' });
    await rejected(() => service.import('manager', { ghn_order_code: 'FOREIGN', order_id: 'order-one' }));
    assert.equal((await saved('FOREIGN')).manager_id, 'other');
  });
  await check('standalone import can later link across local-tenant to canonical order tenant and remains visible', async () => {
    await service.import('manager', { ghn_order_code: 'IMPORTEDLINK123' });
    const before = await saved('IMPORTEDLINK123');
    assert.equal(before.order_id, null);
    await service.import('manager', { ghn_order_code: 'IMPORTEDLINK123', order_id: 'order-one' });
    const after = await saved('IMPORTEDLINK123');
    assert.equal(after.id, before.id); assert.equal(after.tenant_id, 'tenant-one'); assert.equal(after.manager_id, 'manager');
    assert.equal(after.order_id, 'order-one');
    assert.deepEqual((await service.byOrder('manager', 'order-one')).orderCodes, ['IMPORTEDLINK123']);
    for (const key of ['customer_name', 'customer_phone', 'customer_address', 'package_weight', 'cod_amount', 'raw_data', 'created_date']) assert.deepEqual(after[key], before[key], key);
  });
  await check('provider mismatch, invalid input and unavailable config reject without local mutations', async () => {
    const before = await snapshot();
    for (const mode of ['wrong-code', 'wrong-shop', 'network', 'http', 'malformed', 'bad-cod', 'bad-weight']) {
      providerMode = mode; await rejected(() => service.import('manager', { ghn_order_code: 'NEW123' })); assert.equal(await snapshot(), before, mode);
    }
    providerMode = ''; config = { ...config, configured: false, mode: 'DISABLED', shops: [], token: '' };
    const count = calls.length; await rejected(() => service.import('manager', { ghn_order_code: 'NEW123' })); assert.equal(calls.length, count);
    for (const value of ['', 'xx', 'bad code', 'A'.repeat(61)]) await rejected(() => service.import('manager', { ghn_order_code: value }));
    await rejected(() => service.import('manager', { ghn_order_code: 'NEW123', manager_id: 'other' }));
    assert.equal(await snapshot(), before);
  });
  await check('stale baseline fails 409; provider partial failure and audit failure roll back all differential edits', async () => {
    await seed('KEEP123', { orderId: 'order-one' }); const before = await snapshot();
    await rejected(() => service.replaceOrderCodes('manager', 'order-one', { orderCodes: [], expectedOrderCodes: [] }), 409);
    assert.equal(await snapshot(), before);
    await rejected(() => service.replaceOrderCodes('manager', 'order-one', { orderCodes: ['GOOD123', 'FAIL123'], expectedOrderCodes: ['KEEP123'] }));
    assert.equal(await snapshot(), before);
    await pool.query("create function reject_tracking_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure';end$$; create trigger reject_tracking_audit before insert on local_auth_audit_events for each row execute function reject_tracking_audit()");
    try {
      await rejected(() => service.replaceOrderCodes('manager', 'order-one', { orderCodes: ['GOOD123'], expectedOrderCodes: ['KEEP123'] }));
      assert.equal(await snapshot(), before);
    } finally { await pool.query('drop trigger reject_tracking_audit on local_auth_audit_events;drop function reject_tracking_audit()'); }
  });
  await check('commit rechecks actor permission, linked ownership/tenant, tombstones and active config', async () => {
    const raceFailures = [];
    for (const change of [
      "update local_employee_permissions set enabled=false where user_id='employee'",
      "update local_user_profiles set is_active=false where user_id='employee'",
      "update local_user_roles set assigned_by='other' where user_id='employee'",
      "update local_orders set manager_id='other' where id='order-one'",
      "update local_orders set tenant_id='changed' where id='order-one'",
      "insert into local_projection_tombstones(source_table,source_key,tombstone_kind) values('orders','order-one','LOCAL')",
    ]) {
      await reset(); mutation = async () => pool.query(change);
      try {
        await rejected(() => service.import('employee', { ghn_order_code: 'RACE123', order_id: 'order-one' }));
        assert.equal(await saved('RACE123'), undefined, change);
        assert.equal((await pool.query('select count(*)::int n from local_auth_audit_events')).rows[0].n, 0);
      } catch (error) { raceFailures.push(change + ': ' + error.message); }
    }
    await reset(); mutation = async () => { config = { ...config, configured: false, mode: 'DISABLED', token: '', shops: [], revision: 2 }; await pool.query("update integration_private.ghn_settings set mode='DISABLED',api_key=null,primary_shop_id=null,allowed_shop_ids='{}',revision=2"); };
    try { await rejected(() => service.import('manager', { ghn_order_code: 'RACE123' })); assert.equal(await saved('RACE123'), undefined); }
    catch (error) { raceFailures.push('disable saved GHN config: ' + error.message); }
    assert.deepEqual(raceFailures, []);
  });
  await check('concurrent same code cannot attach to two CRM orders', async () => {
    const results = await Promise.allSettled([
      service.import('manager', { ghn_order_code: 'CONCURRENT123', order_id: 'order-one' }),
      service.import('manager', { ghn_order_code: 'CONCURRENT123', order_id: 'order-two' }),
    ]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(results.filter(row => row.status === 'rejected').length, 1);
    assert.equal((await pool.query("select count(*)::int n from local_ghn_tracking where ghn_order_code='CONCURRENT123'")).rows[0].n, 1);
    assert.ok(['order-one', 'order-two'].includes((await saved('CONCURRENT123')).order_id));
  });
  await check('inherited environment configuration disabled during provider read never commits an import', async () => {
    await pool.query("update integration_private.ghn_settings set mode='INHERIT_ENV',api_key=null,primary_shop_id=null,allowed_shop_ids='{}'");
    config.source = 'server_env'; config.mode = 'INHERIT_ENV';
    mutation = async () => {
      await pool.query("update integration_private.ghn_settings set mode='DISABLED',revision=2");
      config = { ...config, source: 'disabled', mode: 'DISABLED', configured: false, token: '', shops: [], revision: 2 };
    };
    await rejected(() => service.import('manager', { ghn_order_code: 'INHERITED123' }));
    assert.equal(await saved('INHERITED123'), undefined);
    assert.equal((await pool.query('select count(*)::int n from local_auth_audit_events')).rows[0].n, 0);
  });
  await check('delete endpoints deny foreign scope and tombstones; audit failure rolls back deletion and tombstone', async () => {
    await seed('LINK123', { orderId: 'order-one' }); await seed('FREE123');
    const before = await snapshot();
    await rejected(() => service.remove('other', 'row-FREE123'), 404);
    await rejected(() => service.removeByOrder('other', 'order-one'), 404);
    assert.equal(await snapshot(), before);
    await pool.query("create function reject_delete_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure';end$$;create trigger reject_delete_audit before insert on local_auth_audit_events for each row execute function reject_delete_audit()");
    try {
      await rejected(() => service.remove('manager', 'row-FREE123')); assert.equal(await snapshot(), before);
      await rejected(() => service.removeByOrder('manager', 'order-one')); assert.equal(await snapshot(), before);
    } finally { await pool.query('drop trigger reject_delete_audit on local_auth_audit_events;drop function reject_delete_audit()'); }
    await service.remove('manager', 'row-FREE123'); assert.equal(await saved('FREE123'), undefined);
    assert.equal((await pool.query("select count(*)::int n from local_projection_tombstones where source_table='ghn_tracking' and source_key='row-FREE123'")).rows[0].n, 1);
    await service.removeByOrder('manager', 'order-one'); assert.equal(await saved('LINK123'), undefined);
    assert.equal(calls.length, 0);
    await seed('TOMBSTONED'); await pool.query("insert into local_projection_tombstones(source_table,source_key,tombstone_kind) values('ghn_tracking','row-TOMBSTONED','LOCAL')");
    await rejected(() => service.remove('manager', 'row-TOMBSTONED'), 404);
    await rejected(() => service.import('manager', { ghn_order_code: 'TOMBSTONED' }));
  });
  await check('delete by tracking ID locks the linked parent scope until authorized deletion commits', async () => {
    await seed('DELETELOCK123', { orderId: 'order-one' });
    let enteredSelect, releaseSelect, intercepted = false;
    const reached = new Promise(resolve => { enteredSelect = resolve; });
    const barrier = new Promise(resolve => { releaseSelect = resolve; });
    const wrappedPool = { query: pool.query.bind(pool), connect: async () => {
      const client = await pool.connect();
      return { release: () => client.release(), query: async (...args) => {
        const result = await client.query(...args);
        if (!intercepted && typeof args[0] === 'string' && args[0].includes('g.id=$3') && args[0].includes('for update of g')) {
          intercepted = true; enteredSelect(); await barrier;
        }
        return result;
      } };
    } };
    const lockedService = new GhnTrackingManagement(wrappedPool, adapter, provider);
    const updater = await pool.connect();
    let operation, update;
    try {
      operation = lockedService.remove('manager', 'row-DELETELOCK123');
      operation.catch(() => undefined);
      await Promise.race([reached, operation.then(() => { throw new Error('Deletion bypassed scoped row lock barrier'); })]);
      const pid = (await updater.query('select pg_backend_pid() pid')).rows[0].pid;
      update = updater.query("update local_orders set manager_id='other',tenant_id='tenant-two' where id='order-one'");
      let blocked = false;
      for (let i = 0; i < 50; i++) {
        blocked = (await pool.query('select cardinality(pg_blocking_pids($1))>0 blocked', [pid])).rows[0].blocked;
        if (blocked) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      releaseSelect(); await operation; await update;
      assert.equal(blocked, true, 'parent manager/tenant reassignment must wait for scoped deletion transaction');
      assert.equal(await saved('DELETELOCK123'), undefined);
    } finally { releaseSelect(); await operation?.catch(() => undefined); await update?.catch(() => undefined); updater.release(); }
  });
  await check('print uses saved rows, groups shop headers, supports legacy lookup and never changes tracking', async () => {
    await seed('PRINT123'); await seed('PRINT456', { rawShop: 456 }); await seed('LEGACYZERO', { rawShop: null });
    const before = await snapshot();
    const result = await service.print('manager', { ids: ['row-PRINT123', 'row-PRINT456', 'row-LEGACYZERO'] });
    assert.equal(result.success, true); assert.equal(result.data.documents.length, 2);
    for (const document of result.data.documents) {
      assert.match(document.printUrl, /^https:\/\/online-gateway\.ghn\.vn\/a5\/public-api\/printA5\?token=synthetic-tracking-print-(123|456)$/);
      const call = calls.find(row => row.endpoint === 'v2/a5/gen-token' && String(row.shop) === String(document.shopId));
      assert.ok(call); assert.deepEqual([...call.body.order_codes].sort(), [...document.orderCodes].sort());
    }
    assert.ok(calls.some(row => row.endpoint === 'v2/shipping-order/detail' && row.body.order_code === 'LEGACYZERO'));
    assert.equal(await snapshot(), before);
  });
  await check('print rejects invalid bounds/scope/config before print dispatch and sanitizes bounded provider failures', async () => {
    await seed('PRINT123'); await seed('FOREIGN456', { manager: 'other', tenant: 'tenant-two', rawShop: 456 });
    for (const ids of [[], ['missing'], ['row-FOREIGN456'], Array.from({ length: 51 }, (_, i) => 'id-' + i)]) await rejected(() => service.print('manager', { ids }));
    assert.equal(calls.filter(row => row.endpoint === 'v2/a5/gen-token').length, 0);
    const before = await snapshot();
    for (const mode of ['network', 'abort', 'http', 'business', 'malformed', 'bad-token', 'oversize']) {
      printMode = mode; await rejected(() => service.print('manager', { ids: ['row-PRINT123'] })); assert.equal(await snapshot(), before, mode);
    }
    assert.equal(cancelled, true, 'oversized print stream is cancelled');
    printMode = ''; config.shops = ['456']; const count = calls.filter(row => row.endpoint === 'v2/a5/gen-token').length;
    await rejected(() => service.print('manager', { ids: ['row-PRINT123'] }));
    assert.equal(calls.filter(row => row.endpoint === 'v2/a5/gen-token').length, count);
  });
  await check('print rechecks actor/config/tombstones after provider and cannot dispatch a second shop after revocation', async () => {
    for (const change of [
      async () => pool.query("update local_employee_permissions set enabled=false where user_id='employee'"),
      async () => pool.query("update local_user_profiles set is_active=false where user_id='employee'"),
      async () => pool.query("insert into local_projection_tombstones(source_table,source_key,tombstone_kind) values('ghn_tracking','row-PRINT123','LOCAL')"),
      async () => { config = { ...config, revision: 2, configured: false, mode: 'DISABLED', token: '', shops: [] }; await pool.query("update integration_private.ghn_settings set mode='DISABLED',api_key=null,primary_shop_id=null,allowed_shop_ids='{}',revision=2"); },
    ]) {
      await reset(); await seed('PRINT123'); await seed('PRINT456', { rawShop: 456 });
      printMutation = change;
      await rejected(() => service.print('employee', { ids: ['row-PRINT123', 'row-PRINT456'] }));
      assert.equal(calls.filter(row => row.endpoint === 'v2/a5/gen-token').length, 1, 'revocation stops the second shop');
      assert.ok(await saved('PRINT123')); assert.ok(await saved('PRINT456'));
    }
  });
  await check('two-shop print rejects all accumulated documents when first-group scope/config/actor changes during second provider', async () => {
    const failures = [];
    for (const [name, revoke] of [
      ['first-group owner', async () => pool.query("update local_orders set manager_id='other',tenant_id='tenant-two' where id='order-one'")],
      ['actor permission', async () => pool.query("update local_employee_permissions set enabled=false where user_id='employee'")],
      ['first-group configured shop', async () => { config = { ...config, shops: ['456'], primaryShop: '456', revision: 2 }; await pool.query("update integration_private.ghn_settings set primary_shop_id='456',allowed_shop_ids=array['456'],revision=2"); }],
    ]) {
      await reset(); await seed('PRINT123', { orderId: 'order-one' }); await seed('PRINT456', { orderId: 'order-two', rawShop: 456 });
      let releaseSecond, reachedSecond;
      secondPrintGate = new Promise(resolve => { releaseSecond = resolve; });
      const reached = new Promise(resolve => { reachedSecond = resolve; }); secondPrintEntered = reachedSecond;
      const operation = service.print('employee', { ids: ['row-PRINT123', 'row-PRINT456'] });
      const outcome = operation.then(value => ({ value }), error => ({ error }));
      try {
        await Promise.race([reached, outcome.then(() => { throw new Error('Print settled before delayed second group reached provider'); })]);
        assert.equal(calls.filter(row => row.endpoint === 'v2/a5/gen-token').length, 2, 'first group already produced a document before second pending');
        await revoke(); releaseSecond();
        const result = await outcome;
        assert.ok(result.error, name + ': must reject instead of returning accumulated first-group URL');
        assert.equal(result.value, undefined, name + ': no document payload may escape');
        assert.equal(String(result.error.message).includes(baseConfig.token), false);
      } catch (error) { failures.push(name + ': ' + error.message); }
      finally { releaseSecond(); await outcome; }
    }
    assert.deepEqual(failures, []);
  });
  await check('HTTP contracts use canonical by-order IDs and server-only print codes/URL with no-store', async () => {
    await seed('HTTP123', { orderId: 'order-one' });
    let actor = 'manager';
    const app = express(); app.use(express.json());
    registerGhnTrackingManagement(app, service, () => actor, (res, error) => res.status(error.status || 500).json({ message: error.status ? error.message : 'Safe fixture error' }));
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    try {
      const response = await fetch(origin + '/api/ghn-tracking/by-order/order-one'); assert.equal(response.status, 200); assert.deepEqual((await response.json()).orderCodes, ['HTTP123']);
      const printed = await fetch(origin + '/api/ghn-tracking/print', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ['row-HTTP123'] }) });
      assert.equal(printed.status, 200); assert.equal(printed.headers.get('cache-control'), 'no-store');
      const printBody = await printed.json(); assert.equal(printBody.success, true); assert.equal(printBody.data.documents[0].orderCodes[0], 'HTTP123');
      actor = 'other'; const denied = await fetch(origin + '/api/ghn-tracking/by-order/order-one'); assert.equal(denied.status, 404);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  });
  console.log((failures.length ? 'GHN_MANAGEMENT_INDEPENDENT_FAILED ' : 'GHN_MANAGEMENT_INDEPENDENT_PASS ') + JSON.stringify({ groupsPassed: checks.length, groupsFailed: failures.length, checks, failures, transport: 'injected synthetic only', database: 'disposable random fixture only' }));
  if (failures.length) process.exitCode = 1;
} finally {
  await pool?.end();
  if (databaseCreated) control(`drop database ${database} with (force)`);
  if (roleCreated) control(`drop role ${role}`);
  console.log('GHN_MANAGEMENT_CLEANUP random database and role removed; operational database untouched.');
}
