// Disposable PostgreSQL fixture + mocked GHN only. Never reads .env or contacts GHN.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { ExternalReadAdapters } from '../server/external-read-adapters.ts';
import { GhnTrackingRefresh, buildGhnTrackingOrder, normalizeGhnDate, ghnPrincipal, ghnVisibleSql, requireGhnTrackingVisible } from '../server/ghn-tracking.ts';

const suffix = `${process.pid}_${Date.now()}`, database = `ghn_qa_${suffix}`, role = `ghn_qa_role_${suffix}`;
const secret = randomBytes(24).toString('hex');
const control = sql => {
  const r = spawnSync('docker', ['exec', 'crm-joliefam-local-postgres', 'psql', '-U', 'crm_local', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error('Isolated GHN SQL control failed: ' + r.stderr);
};
let pool, created = false, roleCreated = false, calls = [], onRequest, checks = 0;
const syntheticEnv = { GHN_API_KEY: 'synthetic-ghn-key', GHN_SHOP_ID: '123', GHN_SHOP_IDS: '123,456,789,111' };
const response = (code, status = 'delivering', shop = 123) => ({ order_code: code, shop_id: shop, status, leadtime: 1792458000, finish_date: '0001-01-01T00:00:00Z' });
const adapter = new ExternalReadAdapters(syntheticEnv, async (url, init) => {
  const body = init.body ? JSON.parse(init.body) : Object.fromEntries(new URL(url).searchParams); calls.push({ url, body, shop: init.headers.ShopId });
  const data = onRequest ? await onRequest(String(url), body) : new URL(url).pathname.endsWith('/shop/all') ? { shops: [{ _id: 123,status:1 }, { _id: 456,status:1 }, { _id: 789,status:1 }, { _id: 111,status:1 }, { _id: 999,status:1 }],last_offset:0 } : response(body.order_code);
  return new Response(JSON.stringify({ code: 200, data }));
});
const check = async (name, run) => { await reset(); await run(); checks++; console.log('PASS GHN: ' + name); };
async function reset() {
  calls = []; onRequest = undefined;
  await pool.query('truncate local_ghn_tracking,local_orders,local_projection_tombstones,local_auth_audit_events,local_employee_permissions,local_user_roles,local_user_profiles');
  await pool.query("insert into local_user_profiles values('admin',true),('manager',true),('other',true),('employee',true)");
  await pool.query("insert into local_user_roles values('admin','admin',null,true),('manager','manager',null,true),('other','manager',null,true),('employee','employee','manager',true)");
  await pool.query("insert into local_employee_permissions values('employee','ghn_tracking',true)");
}
async function seed(id = 'one', manager = 'manager', extra = {}) {
  const status = Object.hasOwn(extra, 'status') ? extra.status : 'picking';
  await pool.query("insert into local_orders(id,manager_id,tenant_id,status,total_amount) values($1,$2,'tenant','shipped',123456.78)", ['order-' + id, manager]);
  await pool.query(`insert into local_ghn_tracking(id,ghn_order_code,order_id,internal_order_code,manager_id,tenant_id,customer_name,customer_phone,customer_address,cod_amount,tracking_notes,raw_data,ghn_status,last_updated_at)
    values($1,$2,$3,'CRM-KEEP',$4,'tenant','Khách cần giữ','0900000000','Địa chỉ giữ',123456.78,'Ghi chú giữ',$5::jsonb,$6,$7)`,
  [id, 'GHN-' + id, 'order-' + id, manager, JSON.stringify({ shop_id: extra.shop || 123, source: 'keep-original' }), status, extra.last || null]);
}
const row = async id => (await pool.query('select to_jsonb(g) data from local_ghn_tracking g where id=$1', [id])).rows[0].data;
async function seedSorted(id, status, { expected = null, created = null, createdAt = null, customer = null } = {}) {
  await seed(id, 'manager', { status });
  await pool.query(`update local_ghn_tracking set expected_delivery_date=$2::timestamptz,created_date=$3::timestamptz,
    created_at=coalesce($4::timestamptz,created_at),customer_name=coalesce($5,customer_name) where id=$1`, [id, expected, created, createdAt, customer]);
}
async function visibleSortedIds(orderSql, limit = 100, offset = 0) {
  return (await pool.query(`select g.id from local_ghn_tracking g left join local_orders o on o.id=g.order_id
    where ${ghnVisibleSql} order by ${orderSql} limit $3 offset $4`, ['manager', 'manager', limit, offset])).rows.map(row => row.id);
}
async function visibleFilteredSortedIds(orderSql, search, statuses, limit = 100, offset = 0) {
  // Mirrors the local list route's parameterized predicate: search/status/visibility
  // must narrow the relation before the shared fixed ORDER BY is paginated.
  const visible = ghnVisibleSql.replace(/\$(\d+)/g, (_, number) => `$${Number(number) + 2}`);
  const where = "($1='' or lower(coalesce(g.ghn_order_code,'')) like '%'||$1||'%' or lower(coalesce(g.customer_name,'')) like '%'||$1||'%') and (cardinality($2::text[])=0 or g.ghn_status=any($2::text[]))";
  return (await pool.query(`select g.id from local_ghn_tracking g left join local_orders o on o.id=g.order_id
    where ${visible} and ${where} order by ${orderSql} limit $5 offset $6`, [search, statuses, 'manager', 'manager', limit, offset])).rows.map(row => row.id);
}
try {
  control(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${secret}'`); roleCreated = true;
  control(`create database ${database} owner ${role}`); created = true;
  pool = new pg.Pool({ connectionString: `postgres://${role}:${secret}@127.0.0.1:55432/${database}` });
  assert.equal((await pool.query('select current_database() db')).rows[0].db, database);
  const migration = await readFile(new URL('../server/db/migrations/013_local_shipping_ghn.sql', import.meta.url), 'utf8');
  const table = migration.match(/CREATE TABLE IF NOT EXISTS local_ghn_tracking \([\s\S]*?\n\);/)[0];
  await pool.query(`create table local_orders(id text primary key,manager_id text,tenant_id text,status text,total_amount numeric);
    create table local_projection_tombstones(source_table text,source_key text);
    create table local_user_profiles(user_id text primary key,is_active boolean);
    create table local_user_roles(user_id text,role text,assigned_by text,is_active boolean);
    create table local_employee_permissions(user_id text,permission_type text,enabled boolean);
    create table local_auth_audit_events(entity_type text,entity_id text,action text,actor_id text,reason text,before_data jsonb,after_data jsonb);
    ${table}`);
  const service = new GhnTrackingRefresh(pool, adapter);
  await check('unconfigured connection and refresh perform no upstream calls', async () => {
    const empty = new GhnTrackingRefresh(pool, new ExternalReadAdapters({}, async () => { throw new Error('Unexpected network'); }));
    assert.equal((await empty.connection('manager')).connected, false); await seed();
    await assert.rejects(empty.refresh('manager', {}), e => e.status === 503); assert.equal(calls.length, 0);
  });
  await check('disabling GHN stops the next external read inside an active batch', async () => {
    await seed('first'); await seed('second');
    const configured = await adapter.snapshot();
    let active = true;
    let batchCalls = 0;
    const dynamicAdapter = new ExternalReadAdapters({}, async (_url, init) => {
      batchCalls++;
      active = false;
      return new Response(JSON.stringify({ code: 200, data: response(JSON.parse(init.body).order_code) }));
    }, async () => active ? configured : { ...configured, token: '', primaryShop: '', shops: [], configured: false, mode: 'DISABLED', source: 'disabled' });
    const result = await new GhnTrackingRefresh(pool, dynamicAdapter).refresh('manager', {});
    assert.equal(result.updated, 1);
    assert.equal(result.failed, 1);
    assert.equal(batchCalls, 1, 'the disabled configuration must block the next GHN request');
  });
  await check('connection confirms all configured shops and refuses partial access', async () => {
    assert.equal((await service.connection('manager')).connected, true);
    onRequest = async () => ({ shops: [{ _id: 123,status:1 }],last_offset:0 }); assert.equal((await service.connection('manager')).connected, false);
    const malformed = new ExternalReadAdapters({ ...syntheticEnv, GHN_SHOP_IDS: '123,bad' }); assert.equal(malformed.status().ghn.configured, false);
  });
  await check('no permission, foreign manager and spoofed manager rejected before upstream', async () => {
    await seed(); await pool.query("delete from local_employee_permissions where user_id='employee'");
    await assert.rejects(service.refresh('employee', {}), e => e.status === 403);
    await assert.rejects(service.refresh('other', { id: 'one' }), e => e.status === 404);
    await assert.rejects(service.refresh('other', { id: 'one', managerId: 'manager' })); assert.equal(calls.length, 0);
    const principal = await ghnPrincipal(pool, 'other');
    assert.equal((await pool.query(`select g.id from local_ghn_tracking g left join local_orders o on o.id=g.order_id where ${ghnVisibleSql}`, [principal.role, principal.manager])).rowCount, 0);
  });
  await check('global, whitelisted GHN list sorting is deterministic before pagination', async () => {
    const priority = buildGhnTrackingOrder('priority', 'asc');
    assert.equal(buildGhnTrackingOrder('none', 'desc').sortBy, 'priority');
    assert.equal(buildGhnTrackingOrder('status', 'asc').sortBy, 'ghn_status');
    assert.throws(() => buildGhnTrackingOrder('created_date;drop table local_ghn_tracking', 'asc'), error => error.status === 400);
    assert.throws(() => buildGhnTrackingOrder('created_date', 'sideways'), error => error.status === 400);
    assert(!priority.sql.includes('priority'));

    await seedSorted('attention-exception', 'exception');
    await seedSorted('attention-return', 'return_fail');
    await seedSorted('active-early', 'delivering', { expected: '2026-01-01T00:00:00Z' });
    await seedSorted('active-late', 'sorting', { expected: '2026-02-01T00:00:00Z' });
    await seedSorted('active-no-date', 'storing');
    await seedSorted('pickup', 'picked');
    await seedSorted('unknown', 'local_only');
    await seedSorted('terminal-new', 'delivered', { created: '2026-03-01T00:00:00Z' });
    await seedSorted('terminal-same-new', 'returned', { created: '2026-02-01T00:00:00Z', createdAt: '2026-02-03T00:00:00Z' });
    await seedSorted('terminal-same-old', 'cancelled', { created: '2026-02-01T00:00:00Z', createdAt: '2026-02-02T00:00:00Z' });
    const expectedPriority = [
      'attention-exception', 'attention-return', 'active-early', 'active-late', 'active-no-date',
      'pickup', 'unknown', 'terminal-new', 'terminal-same-new', 'terminal-same-old',
    ];
    assert.deepEqual(await visibleSortedIds(priority.sql), expectedPriority);
    assert.deepEqual([
      ...await visibleSortedIds(priority.sql, 4, 0),
      ...await visibleSortedIds(priority.sql, 4, 4),
      ...await visibleSortedIds(priority.sql, 4, 8),
    ], expectedPriority);

    await seedSorted('created-old', 'aaa', { created: '2025-01-01T00:00:00Z', customer: 'Zulu' });
    await seedSorted('created-tie-a', 'bbb', { created: '2025-02-01T00:00:00Z', customer: 'Alpha' });
    await seedSorted('created-tie-b', 'zzz', { created: '2025-02-01T00:00:00Z', customer: 'Alpha' });
    await seedSorted('created-new', 'ccc', { created: '2025-03-01T00:00:00Z', customer: 'Beta' });
    await seedSorted('created-null', 'ddd', { customer: '' });
    const targetIds = ['created-old', 'created-tie-a', 'created-tie-b', 'created-new', 'created-null'];
    const orderedTargets = async orderSql => (await pool.query(`select g.id from local_ghn_tracking g where g.id=any($1::text[]) order by ${orderSql}`, [targetIds])).rows.map(row => row.id);
    assert.deepEqual(await orderedTargets(buildGhnTrackingOrder('created_date', 'asc').sql), ['created-old', 'created-tie-a', 'created-tie-b', 'created-new', 'created-null']);
    assert.deepEqual(await orderedTargets(buildGhnTrackingOrder('created_date', 'desc').sql), ['created-new', 'created-tie-a', 'created-tie-b', 'created-old', 'created-null']);
    assert.deepEqual(await orderedTargets(buildGhnTrackingOrder('customer_name', 'asc').sql), ['created-null', 'created-tie-a', 'created-tie-b', 'created-new', 'created-old']);
    assert.deepEqual(await orderedTargets(buildGhnTrackingOrder('customer_name', 'desc').sql), ['created-old', 'created-new', 'created-tie-a', 'created-tie-b', 'created-null']);
    assert.deepEqual(await orderedTargets(buildGhnTrackingOrder('ghn_status', 'asc').sql), ['created-old', 'created-tie-a', 'created-new', 'created-null', 'created-tie-b']);
    assert.deepEqual(await orderedTargets(buildGhnTrackingOrder('ghn_status', 'desc').sql), ['created-tie-b', 'created-null', 'created-new', 'created-tie-a', 'created-old']);
  });
  await check('priority covers every status group, null/future dates, stable pages and filtered relations', async () => {
    const priority = buildGhnTrackingOrder('priority', 'asc');
    // Priority is intentionally a fixed business queue; the hidden direction control
    // must not let a query parameter reverse attention handling.
    assert.equal(buildGhnTrackingOrder('priority', 'desc').sql, priority.sql);
    const attention = ['delivery_fail', 'exception', 'lost', 'damage', 'return', 'waiting_to_return', 'returning', 'return_transporting', 'return_sorting', 'return_fail'];
    const active = ['delivering', 'transporting', 'storing', 'sorting'];
    const pickup = ['ready_to_pick', 'picking', 'picked'];
    const terminal = ['delivered', 'self_delivered', 'cancel', 'cancelled', 'returned'];
    for (const status of attention) await seedSorted(`attention-${status}`, status);
    await seedSorted('active-past', active[0], { expected: '2025-01-01T00:00:00Z' });
    await seedSorted('active-future', active[1], { expected: '2027-01-01T00:00:00Z' });
    await seedSorted('active-null-a', active[2]);
    await seedSorted('active-null-b', active[3]);
    for (const status of pickup) await seedSorted(`pickup-${status}`, status);
    await seedSorted('unknown-local', 'local_only');
    await seedSorted('unknown-null', null);
    await seedSorted('terminal-delivered', terminal[0], { created: '2026-03-01T00:00:00Z' });
    await seedSorted('terminal-self', terminal[1], { created: '2026-02-01T00:00:00Z', createdAt: '2026-02-03T00:00:00Z' });
    await seedSorted('terminal-returned', terminal[4], { created: '2026-02-01T00:00:00Z', createdAt: '2026-02-02T00:00:00Z' });
    await seedSorted('terminal-cancelled', terminal[3], { created: '2026-01-01T00:00:00Z' });
    await seedSorted('terminal-cancel', terminal[2]);
    const expected = [
      ...attention.map(status => `attention-${status}`).sort(),
      'active-past', 'active-future', 'active-null-a', 'active-null-b',
      ...pickup.map(status => `pickup-${status}`).sort(),
      'unknown-local', 'unknown-null',
      'terminal-delivered', 'terminal-self', 'terminal-returned', 'terminal-cancelled', 'terminal-cancel',
    ];
    assert.deepEqual(await visibleSortedIds(priority.sql), expected);
    const paged = [];
    for (let offset = 0; offset < expected.length; offset += 3) paged.push(...await visibleSortedIds(priority.sql, 3, offset));
    assert.deepEqual(paged, expected);
    assert.equal(new Set(paged).size, expected.length);

    await seedSorted('filter-match-early', 'delivering', { expected: '2025-01-01T00:00:00Z', customer: 'Needle' });
    await seedSorted('filter-match-late', 'delivering', { expected: '2027-01-01T00:00:00Z', customer: 'Needle' });
    await seedSorted('filter-status-other', 'picking', { customer: 'Needle' });
    await seedSorted('filter-nonmatch', 'delivering', { customer: 'Haystack' });
    assert.deepEqual(await visibleFilteredSortedIds(priority.sql, 'needle', ['delivering'], 1, 0), ['filter-match-early']);
    assert.deepEqual(await visibleFilteredSortedIds(priority.sql, 'needle', ['delivering'], 1, 1), ['filter-match-late']);
    assert.deepEqual(await visibleFilteredSortedIds(priority.sql, 'needle', [], 10, 0), ['filter-match-early', 'filter-match-late', 'filter-status-other']);
  });
  await check('status-only commit preserves customer, COD, ownership, linkage, notes and old raw payload', async () => {
    await seed(); const before = await row('one'); const result = await service.refresh('employee', { id: 'one' });
    assert.equal(result.updated, 1); const after = await row('one');
    const allowed = new Set(['ghn_status','ghn_status_text','expected_delivery_date','delivered_date','raw_data','last_updated_at','updated_at','local_modified_at']);
    for (const [key, value] of Object.entries(before)) if (!allowed.has(key)) assert.deepEqual(after[key], value, key);
    assert.equal(after.raw_data.source, 'keep-original'); assert.equal(after.raw_data.local_ghn_status_refresh.status, 'delivering');
    assert.equal(after.delivered_date, null); assert.equal((await pool.query('select actor_id from local_auth_audit_events')).rows[0].actor_id, 'employee');
  });
  await check('four allowed shops use fixed configured header; fifth/wrong code/saved-shop mismatch cannot update', async () => {
    for (const shop of [123,456,789,111]) {
      await seed(String(shop), 'manager', { shop }); onRequest = async (_url, body) => response(body.order_code, 'delivering', shop);
      assert.equal((await service.refresh('manager', { id: String(shop) })).updated, 1);
    }
    assert(calls.every(call => call.shop === '123' && call.url.startsWith('https://online-gateway.ghn.vn/shiip/public-api/')));
    await seed('wrong');
    for (const invalid of [response('GHN-wrong','delivering',999), response('OTHER','delivering',123), response('GHN-wrong','delivering',456)]) {
      onRequest = async () => invalid; assert.equal((await service.refresh('manager', { id: 'wrong' })).failed, 1);
      assert.equal((await row('wrong')).ghn_status, 'picking');
    }
  });
  await check('terminal CRM/GHN, tombstone and dangling link skip upstream', async () => {
    await seed('crm'); await seed('ghn', 'manager', { status: 'delivered' }); await seed('deleted'); await seed('dangling');
    await pool.query("update local_orders set status='cancelled' where id='order-crm'; insert into local_projection_tombstones values('ghn_tracking','deleted'); delete from local_orders where id='order-dangling'");
    assert.equal((await service.refresh('manager', { id: 'crm' })).skipped, 1); assert.equal((await service.refresh('manager', { id: 'ghn' })).skipped, 1);
    for (const id of ['deleted','dangling']) await assert.rejects(service.refresh('manager', { id }), e => e.status === 404);
    assert.equal(calls.length, 0);
  });
  await check('legacy live detail requires the same saved-row scope, including admin', async () => {
    await seed('visible'); await seed('deleted'); await seed('order-deleted'); await seed('dangling'); await seed('tenant');
    await pool.query("insert into local_projection_tombstones values('ghn_tracking','deleted'),('orders','order-order-deleted'); delete from local_orders where id='order-dangling'; update local_orders set tenant_id='other-tenant' where id='order-tenant'");
    await requireGhnTrackingVisible(pool, 'manager', 'GHN-visible'); await requireGhnTrackingVisible(pool, 'admin', 'GHN-visible');
    for (const actor of ['admin','manager']) for (const code of ['GHN-deleted','GHN-order-deleted','GHN-dangling','GHN-tenant','GHN-unknown']) await assert.rejects(requireGhnTrackingVisible(pool, actor, code), e => e.status === 404);
    await assert.rejects(requireGhnTrackingVisible(pool, 'other', 'GHN-visible'), e => e.status === 404); assert.equal(calls.length, 0);
  });
  await check('concurrent source/order/ownership/tombstone/permission changes fail before commit', async () => {
    const mutations = ["update local_ghn_tracking set tracking_notes='changed' where id='one'", "update local_orders set status='delivered' where id='order-one'", "update local_orders set manager_id='other' where id='order-one'", "insert into local_projection_tombstones values('ghn_tracking','one')", "delete from local_orders where id='order-one'", "update local_employee_permissions set enabled=false where user_id='employee'", "update local_user_profiles set is_active=false where user_id='employee'", "update local_user_roles set assigned_by='other' where user_id='employee'"];
    for (const sql of mutations) {
      await reset(); await seed(); onRequest = async (_url, body) => { await pool.query(sql); return response(body.order_code); };
      assert.equal((await service.refresh('employee', { id: 'one' })).failed, 1, sql); assert.equal((await row('one')).ghn_status, 'picking'); assert.equal((await pool.query('select count(*)::int n from local_auth_audit_events')).rows[0].n, 0);
    }
  });
  await check('audit failure rolls back shipping state', async () => {
    await seed(); await pool.query("create function reject_ghn_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure';end$$; create trigger qa_audit before insert on local_auth_audit_events for each row execute function reject_ghn_audit()");
    assert.equal((await service.refresh('manager', { id: 'one' })).failed, 1); assert.equal((await row('one')).ghn_status, 'picking');
    await pool.query('drop trigger qa_audit on local_auth_audit_events; drop function reject_ghn_audit()');
  });
  await check('partial batch advances signed cursor past failed NULL and timestamp rows without starvation', async () => {
    for (let n = 0; n < 55; n++) await seed(String(n).padStart(3,'0'), 'manager', { last: n < 25 ? null : '2026-01-01T00:00:00Z' });
    onRequest = async (_url, body) => ['GHN-000','GHN-030'].includes(body.order_code) ? response('MISMATCH') : response(body.order_code);
    const first = await service.refresh('manager', {}); assert.equal(first.updated, 48); assert.equal(first.failed, 2); assert.equal(first.has_more, true); assert(first.next_cursor);
    const second = await service.refresh('manager', { cursor: first.next_cursor }); assert.equal(second.updated, 5); assert.equal(second.failed, 0); assert.equal(second.next_cursor, null); assert.equal(calls.length, 55);
    await assert.rejects(service.refresh('other', { cursor: first.next_cursor }), e => e.status === 409);
    await assert.rejects(service.refresh('manager', { cursor: first.next_cursor, staleOnly: true }), e => e.status === 409);
    await assert.rejects(service.refresh('manager', { cursor: first.next_cursor + 'x' }), e => e.status === 409);
  });
  await check('fresh rows excluded from stale-only refresh and timestamps normalize safely', async () => {
    await seed('fresh', 'manager', { last: new Date().toISOString() }); assert.equal((await service.refresh('manager', { staleOnly: true })).updated, 0); assert.equal(calls.length, 0);
    for (const value of [null, 0, '0', '0001-01-01T00:00:00Z', 'bad']) assert.equal(normalizeGhnDate(value), null);
    assert.equal(normalizeGhnDate(1792458000), normalizeGhnDate(1792458000000)); assert.equal(normalizeGhnDate('2026-10-20T00:00:00Z'), '2026-10-20T00:00:00.000Z');
  });
  await check('exact PostgreSQL microseconds advance past more than 50 permanent failures without repeats', async () => {
    for (let n = 0; n < 57; n++) await seed(String(n).padStart(3,'0'), 'manager', { last: '2026-01-01T00:00:00.123456Z' });
    onRequest = async (_url, body) => Number(body.order_code.slice(4)) < 55 ? response('MISMATCH') : response(body.order_code);
    const first = await service.refresh('manager', {});
    assert.equal(first.failed, 50); assert.equal(first.updated, 0); assert.equal(first.has_more, true);
    assert.equal(JSON.parse(Buffer.from(first.next_cursor.split('.')[0], 'base64url').toString()).time, '2026-01-01T00:00:00.123456Z');
    const second = await service.refresh('manager', { cursor: first.next_cursor });
    assert.equal(second.failed, 5); assert.equal(second.updated, 2); assert.equal(second.has_more, false); assert.equal(second.next_cursor, null);
    assert.equal(calls.length, 57); assert.equal(new Set(calls.map(call => call.body.order_code)).size, 57);
  });
  console.log(`GHN isolated: ${checks} groups passed. No live database or external API touched.`);
} finally {
  if (pool) await pool.end();
  if (created) control(`drop database ${database} with (force)`);
  if (roleCreated) control(`drop role ${role}`);
}
