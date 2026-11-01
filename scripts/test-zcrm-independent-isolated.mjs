import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createHmac, scryptSync } from 'node:crypto';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { mkdir, readFile, writeFile, stat, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// No env-file loader, real CRM database, hosted provider, or production key is used.
const repo = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(path.join(repo, 'package.json'));
const { Pool } = require('pg');
const express = require('express');
const reference = process.env.ZCRM_CONTRACT_REFERENCE_DIR || path.resolve(repo, '../outputs/zcrm-integration-20261029/reference');
const outputs = process.env.ZCRM_QA_ARTIFACTS || path.resolve(repo, '../outputs/zcrm-integration-20261029/independent-test');
const suffix = process.pid + '_' + Date.now();
const database = 'zcrm_independent_' + suffix, role = 'zcrm_qa_' + suffix;
const fixturePassword = 'FixtureOnly!' + randomBytes(24).toString('hex');
const dbUrl = 'postgres://' + role + ':' + encodeURIComponent(fixturePassword) + '@127.0.0.1:16543/' + database;
const fixtureMaster = randomBytes(32).toString('hex');
const fixtureLogin = 'FixtureLogin!' + randomBytes(10).toString('hex');
const container = 'crm-joliefam-local-postgres';
const checks = [];
const secrets = [fixturePassword, fixtureMaster, fixtureLogin];
let roleCreated = false, databaseCreated = false, db, server, api, apiLog = '', browser, frontend, uiRoot;
let base = '', actualBase = '', upstream, validators, commerce, domain, deliverOutbox;
const fixtureSessions = new Map();
// Products retain UUID manager columns even though the local auth table is text.
const identities = { admin: randomUUID(), manager: randomUUID(), employee: randomUUID(), other: randomUUID() };
let serviceToken, otherToken, signingSecret, connectionId, otherConnectionId, coreOrder, coreDraft, coreQuote, coreBody, coreKey;
const ids = { product: randomUUID(), custom: randomUUID(), unknown: randomUUID(), outside: randomUUID(), warehouse: randomUUID(), otherWarehouse: randomUUID(), item: randomUUID(), legacy: randomUUID() };
const transferCalls = [];
let transferMode = 'success', transferHook;
const browserProblems = [];
const fixtureTransport = async (url, options) => {
  assert.equal(url.origin, 'https://zcrm.joliefam.vn', 'fixture transport only accepts expected origin');
  assert.equal(options.method, 'GET', 'webhook worker is not running in route fixture');
  transferCalls.push({ pathname: url.pathname, auth: options.headers.Authorization });
  if (transferHook) await transferHook(url, options);
  if (transferMode === 'throw') throw new Error('Fixture network interruption');
  if (transferMode === 'redirect') return { status: 302, body: Buffer.alloc(0), mime: 'text/html' };
  if (transferMode === 'oversize') return { status: 200, body: Buffer.alloc(15728641), mime: 'application/pdf' };
  if (transferMode === 'partial' && url.pathname.endsWith('fixture-media-2')) return { status: 404, body: Buffer.alloc(0), mime: 'application/pdf' };
  return { status: 200, body: Buffer.from('Independent fixture document ' + url.pathname), mime: 'application/pdf' };
};
const sqlAdmin = sql => {
  const r = spawnSync('docker', ['exec', container, 'psql', '-U', 'crm_local', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error('Disposable database administration failed; no production fallback is permitted.');
  return r.stdout;
};
const pass = name => { checks.push(name); console.log('PASS ' + name); };
const check = async (name, fn) => { await fn(); await db.query('delete from zcrm.quotas'); pass(name); };
const expected = (result, code, context) => { assert.equal(result.status, code, context + ': ' + (result.body?.message || '')); return result.body; };
const rawCall = (origin, route, token, method = 'GET', body, extra = {}) => new Promise((resolve, reject) => {
  const headers = { host: 'crm.example.com', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...extra };
  const req = httpRequest(origin + route, { method, headers }, res => {
    const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => {
      const bytes = Buffer.concat(chunks); let parsed = null; try { parsed = JSON.parse(bytes); } catch { /* private attachment bytes */ }
      resolve({ status: res.statusCode, body: parsed, bytes, headers: res.headers });
    });
  });
  req.setTimeout(15000, () => req.destroy(new Error('Fixture HTTP deadline'))); req.on('error', reject);
  if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body)); req.end();
});
const call = (...args) => rawCall(base, ...args);
const human = (route, method = 'GET', body, who = 'admin') => call('/api/zcrm-admin' + route, [...fixtureSessions.entries()].find(([, id]) => id === identities[who])?.[0], method, body);
const service = (route, method = 'GET', body, key, token = serviceToken) => call('/api/zcrm/v1' + route, token, method, body, key ? { 'Idempotency-Key': key } : {});
const draft = (changes = {}) => upstream.parseDraft({ customerId: 'fixture-hotel', orderedBy: 'Người đặt thử', recipient: { name: 'Lễ tân thử', phone: '0900000001', address: 'Địa chỉ thử riêng, Hà Nội' }, desiredDate: '2026-11-12', notes: 'Dữ liệu thử riêng, không giao hàng', lines: [
  { productId: ids.product, name: 'Tên khách giả mạo phải bị thay bằng catalog', kind: 'stock', warehouseId: ids.warehouse, quantity: 2.5, unit: 'cái', proposedPrice: 1, specifications: {}, attachments: [] },
  { productId: ids.custom, name: 'Ga đặt riêng', kind: 'custom', variant: 'Cotton trắng', quantity: 1.25, unit: 'm', proposedPrice: 200000, specifications: { 'Kích thước': '160 x 200 cm', 'Chất liệu': 'Cotton' }, attachments: [] },
], ...changes });
const quote = async (value, actor = identities.manager, token = serviceToken) => {
  const result = expected(await service('/quotes', 'POST', { draft: value, fingerprint: upstream.fingerprint(value), actorId: actor, source: 'ZCRM' }, undefined, token), 200, 'quote');
  upstream.validateQuote(result, value); return result;
};
const submitBody = (value, priced, extra = {}) => ({ draft: value, quoteToken: priced.token, fingerprint: priced.fingerprint, actorId: identities.manager, source: 'ZCRM', existingOrderId: null, attachments: [], ...extra });
const createDraft = async (value = draft(), extra = {}) => {
  const priced = await quote(value), requestKey = randomUUID(), body = submitBody(value, priced, extra);
  const result = expected(await service('/draft-orders', 'POST', body, requestKey), 200, 'submit draft');
  assert.ok(validators.orderValid(result.order), 'upstream order validator'); return { value, priced, requestKey, body, order: result.order };
};
const currentOrder = async id => expected(await service('/customers/fixture-hotel/orders/' + id), 200, 'order detail');
const review = async (id, action, revision, extra = {}, who = 'admin') => expected(await human('/orders/' + id + '/review', 'POST', { action, expected_revision: revision, idempotency_key: randomUUID(), reason: 'Independent fixture review', ...extra }, who), 200, 'human review');
const countOrders = async () => Number((await db.query("select count(*) n from local_orders where intake_source='ZCRM'")).rows[0].n);

async function seed() {
  const salt = randomBytes(16).toString('hex'), passwordHash = 'scrypt$' + salt + '$' + scryptSync(fixtureLogin, salt, 64).toString('hex');
  for (const [label, user] of Object.entries(identities)) {
    await db.query('insert into local_user_profiles(id,user_id,email,first_name,password_hash,is_active) values($1,$1,$2,$3,$4,true)', [user, label + '@fixture.invalid', 'Nhân viên thử ' + label, passwordHash]);
    const r = label === 'admin' ? 'admin' : label === 'employee' ? 'employee' : 'manager';
    await db.query('insert into local_user_roles(user_id,role,assigned_by) values($1,$2,$3)', [user, r, r === 'employee' ? identities.manager : identities.admin]);
    const token = 'FixtureSession-' + randomBytes(24).toString('hex'); fixtureSessions.set(token, user); secrets.push(token);
  }
  await db.query(`insert into local_customers(id,customer_code,name,phone,tenant_id,manager_id) values
    ('fixture-hotel','QA-HOTEL','Khách sạn kiểm thử','0900000001','fixture-tenant', $1),
    ('fixture-other','QA-OTHER','Khách tổ chức khác','0900000002','other-tenant',$2),
    ('fixture-unclassified','QA-UNKNOWN','Khách chưa xác nhận','0900000003','fixture-tenant',$1)`, [identities.manager, identities.other]);
  for (let i = 1; i <= 24; i++) await db.query('insert into local_customers(id,customer_code,name,phone,tenant_id,commerce_kind) values($1,$2,$3,$4,$5,$6)', [
    'fixture-extra-' + String(i).padStart(3, '0'), 'QA-EXTRA-' + i, 'Khách thử phân trang ' + i, '091234' + String(i).padStart(4, '0'), 'fixture-tenant', 'individual',
  ]);
  await db.query("insert into local_products(id,sku,name,price,tenant_id,manager_id) values($1,'QA-STOCK','Gối có sẵn',100000,'fixture-tenant',$5),($2,'QA-CUSTOM','Ga đặt riêng',null,'fixture-tenant',$5),($3,'QA-UNKNOWN','Chưa biết giá và tồn',null,'fixture-tenant',$5),($4,'QA-OTHER','Hàng ngoài phạm vi',888888,'other-tenant',$6)", [ids.product, ids.custom, ids.unknown, ids.outside, identities.manager, identities.other]);
  await db.query("insert into local_inventory_warehouses(id,code,name) values($1,'QA-W1','Kho thử 1'),($2,'QA-W2','Kho thử 2')", [ids.warehouse, ids.otherWarehouse]);
  await db.query("insert into local_inventory_items(id,code,name,base_unit) values($1,'QA-STOCK-I','Gối tồn thử','cái')", [ids.item]);
  await db.query('insert into local_production_product_inventory_maps(product_id,inventory_item_id,created_by) values($1,$2,$3)', [ids.product, ids.item, identities.admin]);
  const doc = randomUUID();
  await db.query("insert into local_inventory_documents(id,document_number,document_type,status,transaction_at,warehouse_id,idempotency_key) values($1,'QA-INITIAL','RECEIPT','CONFIRMED',now(),$2,'qa-initial')", [doc, ids.warehouse]);
  await db.query("insert into local_inventory_movements(document_id,inventory_item_id,warehouse_id,movement_kind,quantity_delta,unit,transaction_at) values($1,$2,$3,'QA_FIXTURE',100,'cái',now())", [doc, ids.item, ids.warehouse]);
}

async function configure() {
  expected(await human('/customers/fixture-hotel/profile', 'POST', { kind: 'hotel', contacts: [ { id: 'contact-reception', name: 'Lễ tân', phone: '0900000001' }, { id: 'contact-accounting', name: 'Kế toán', phone: '0900000011' } ], addresses: [ { id: 'address-a', name: 'Lễ tân A', phone: '0900000001', address: 'Địa chỉ thử A, Hà Nội' }, { id: 'address-b', name: 'Kho B', phone: '0900000012', address: 'Địa chỉ thử B, Hải Phòng' } ] }), 200, 'hotel profile');
  expected(await human('/customers/fixture-other/profile', 'POST', { kind: 'individual', contacts: [] }), 200, 'other profile');
  for (const [id, kind, unit, variant, requiredFields] of [[ids.product, 'stock', 'cái', '', []], [ids.custom, 'custom', 'm', 'Cotton trắng', ['Kích thước', 'Chất liệu']], [ids.unknown, 'stock', 'cái', '', []], [ids.outside, 'stock', 'cái', '', []]]) {
    expected(await human('/products/' + id + '/profile', 'POST', { kind, unit, variant, requiredFields }), 200, 'product profile');
  }
  const allCustomers = ['fixture-hotel', ...Array.from({ length: 24 }, (_, i) => 'fixture-extra-' + String(i + 1).padStart(3, '0'))];
  const config = { org_id: 'fixture-org', tenant_id: 'fixture-tenant', name: 'ZCRM thử riêng', origin: 'https://zcrm.joliefam.vn', enabled: true, generate_secrets: true,
    actor_mappings: [{ zcrm_user_id: 'zcrm-manager', crm_user_id: identities.manager }, { zcrm_user_id: 'zcrm-employee', crm_user_id: identities.employee }], customer_ids: allCustomers,
    product_grants: [{ product_id: ids.product, warehouse_ids: [ids.warehouse] }, { product_id: ids.custom, warehouse_ids: [] }, { product_id: ids.unknown, warehouse_ids: [] }] };
  const result = expected(await human('/connections', 'POST', config), 200, 'connection setup');
  connectionId = result.id; serviceToken = result.one_time_secrets.token; signingSecret = result.one_time_secrets.webhook_secret; secrets.push(serviceToken, signingSecret);
  const other = expected(await human('/connections', 'POST', { ...config, org_id: 'fixture-other-org', tenant_id: 'other-tenant', name: 'Tổ chức thử khác', actor_mappings: [{ zcrm_user_id: 'zcrm-other', crm_user_id: identities.other }], customer_ids: ['fixture-other'], product_grants: [{ product_id: ids.outside, warehouse_ids: [] }] }), 200, 'other connection setup');
  otherConnectionId = other.id; otherToken = other.one_time_secrets.token; secrets.push(otherToken, other.one_time_secrets.webhook_secret);
}

async function protocolTests() {
  await check('All machine capabilities and real-role admin boundary', async () => {
    const value = expected(await service('/capabilities'), 200, 'capabilities');
    assert.deepEqual(value, { version: 1, capabilities: ['customers', 'products', 'summary', 'orders', 'quotes', 'draft_orders', 'idempotency', 'events', 'attachments'] });
    for (const token of [undefined, 'wrong-token', ...fixtureSessions.keys()]) expected(await service('/capabilities', 'GET', undefined, undefined, token || ''), 401, 'wrong machine token');
    expected(await human('/settings', 'GET', undefined, 'manager'), 403, 'manager cannot settings');
    expected(await human('/settings', 'GET', undefined, 'employee'), 403, 'employee cannot settings');
    const settings = expected(await human('/settings'), 200, 'admin settings');
    for (const secret of [serviceToken, signingSecret]) assert.ok(!JSON.stringify(settings).includes(secret));
    expected(await call('/api/zcrm-admin/settings', serviceToken), 401, 'machine cannot management');
  });
  await check('Hotel multi-contact/address and tenant-scoped customer pagination', async () => {
    const hotel = expected(await service('/customers/fixture-hotel'), 200, 'customer detail'); assert.ok(validators.customerValid(hotel));
    assert.equal(hotel.kind, 'hotel'); assert.equal(hotel.contacts.length, 2); assert.equal(hotel.addresses.length, 2);
    expected(await service('/customers/fixture-other'), 404, 'other tenant denied');
    expected(await service('/customers/fixture-hotel', 'GET', undefined, undefined, otherToken), 404, 'reverse tenant denied');
    const all = []; let cursor = ''; let pages = 0;
    do { const response = expected(await service('/customers?' + new URLSearchParams({ limit: '20', cursor })), 200, 'customer page');
      assert.ok(validators.pageValid(response, validators.customerValid)); assert.ok(response.items.length <= 20); all.push(...response.items); cursor = response.nextCursor || ''; pages++;
    } while (cursor && pages < 5);
    assert.equal(all.length, 25); assert.equal(new Set(all.map(c => c.id)).size, 25); assert.equal(pages, 2);
    const searched = expected(await service('/customers?q=%2B84900000001'), 200, 'normalized phone search'); assert.ok(searched.items.some(c => c.id === 'fixture-hotel'));
    const first = expected(await service('/customers?limit=1'), 200, 'cursor source'); assert.ok(first.nextCursor);
    expected(await service('/customers?' + new URLSearchParams({ q: 'changed', cursor: first.nextCursor })), 400, 'cursor filter binding');
    expected(await service('/customers?' + new URLSearchParams({ cursor: first.nextCursor }), 'GET', undefined, undefined, otherToken), 400, 'cursor org binding');
    expected(await service('/customers?limit=21'), 400, 'page bound');
    expected(await service('/customers?cursor=' + 'x'.repeat(501)), 422, 'cursor length');
  });
  await check('Customer creation replay, normalized duplicate race, no implicit Zalo linking', async () => {
    const key = randomUUID(), body = { name: 'Khách thử mới duy nhất', phone: '0987000011', kind: 'individual', source: 'ZCRM' };
    const first = expected(await service('/customers', 'POST', body, key), 200, 'create customer'); assert.ok(validators.customerValid(first));
    assert.deepEqual(expected(await service('/customers', 'POST', body, key), 200, 'customer replay'), first);
    expected(await service('/customers', 'POST', { ...body, name: 'Changed' }, key), 409, 'customer key conflict');
    const raceBody = { ...body, name: 'Khách thử đồng thời', phone: '+84987000012' };
    const results = await Promise.all([service('/customers', 'POST', raceBody, randomUUID()), service('/customers', 'POST', { ...raceBody, phone: '0987000012' }, randomUUID())]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal(Number((await db.query("select count(*) n from local_customers where regexp_replace(phone,'[^0-9]','','g') in ('84987000012','0987000012')")).rows[0].n), 1);
    expected(await service('/customers', 'POST', { name: 'Khách cùng điện thoại', phone: '0900000001', kind: 'hotel', source: 'ZCRM' }, randomUUID()), 409, 'existing customer explicit select');
  });
  await check('Explicit product kind, unit, warehouse, ledger stock and unknown price/null', async () => {
    const response = expected(await service('/products'), 200, 'products'); assert.ok(validators.pageValid(response, validators.productValid));
    const stock = response.items.find(p => p.id === ids.product), custom = response.items.find(p => p.id === ids.custom), unknown = response.items.find(p => p.id === ids.unknown);
    assert.equal(stock.available, 100); assert.equal(stock.price, 100000); assert.equal(stock.warehouseId, ids.warehouse); assert.equal(stock.unit, 'cái');
    assert.equal(custom.kind, 'custom'); assert.equal(custom.price, null); assert.equal(custom.available, null); assert.deepEqual(custom.requiredFields, ['Kích thước', 'Chất liệu']);
    assert.equal(unknown.price, null); assert.equal(unknown.available, null); assert.ok(!response.items.some(p => p.id === ids.outside));
  });
  await check('Order status filters use inclusive Vietnam business-day boundaries', async () => {
    for (const [id, created] of [['fixture-date-before', '2026-10-28T16:59:59.000Z'], ['fixture-date-inside', '2026-10-28T17:00:00.000Z'], ['fixture-date-after', '2026-10-29T17:00:00.000Z']]) {
      await db.query("insert into local_orders(id,customer_id,tenant_id,order_number,status,total_amount,created_at,updated_at) values($1,'fixture-hotel','fixture-tenant',$1,'cancelled',100000,$2,$2)", [id, created]);
    }
    const result = expected(await service('/customers/fixture-hotel/orders?status=cancelled&from=2026-10-29&to=2026-10-29'), 200, 'Vietnam dates');
    assert.ok(validators.pageValid(result, validators.orderSummaryValid)); assert.deepEqual(result.items.map(o => o.id), ['fixture-date-inside']);
    expected(await service('/customers/fixture-hotel/orders?status=invalid'), 400, 'status filter');
    const invalid = await service('/customers/fixture-hotel/orders?from=2026-02-30'); assert.ok([400, 422].includes(invalid.status));
    expected(await service('/customers/fixture-other/orders'), 404, 'order list outside customer scope');
  });
  await check('Quotes use authoritative stock price and validate mixed/custom decimal lines', async () => {
    coreDraft = draft(); coreQuote = await quote(coreDraft); assert.equal(coreQuote.subtotal, 500000); assert.equal(coreQuote.lines[0].unitPrice, 100000);
    const bad = [draft({ lines: [{ ...coreDraft.lines[0], warehouseId: ids.otherWarehouse }] }), draft({ lines: [{ ...coreDraft.lines[0], kind: 'custom' }] }),
      draft({ lines: [{ ...coreDraft.lines[0], unit: 'kg' }] }), draft({ lines: [{ ...coreDraft.lines[0], quantity: 1000 }] }),
      draft({ lines: [{ ...coreDraft.lines[1], specifications: { 'Kích thước': '160 x 200' } }] }), draft({ lines: [{ ...coreDraft.lines[0], productId: ids.unknown, warehouseId: '' }] })];
    for (const value of bad) expected(await service('/quotes', 'POST', { draft: value, fingerprint: upstream.fingerprint(value), actorId: identities.manager, source: 'ZCRM' }), 422, 'invalid quote rejected');
    expected(await service('/quotes', 'POST', { draft: coreDraft, fingerprint: upstream.fingerprint(coreDraft), actorId: identities.other, source: 'ZCRM' }), 403, 'unmapped actor');
    expected(await service('/quotes', 'POST', { draft: coreDraft, fingerprint: '0'.repeat(64), actorId: identities.manager, source: 'ZCRM' }), 409, 'fingerprint mismatch');
  });
  await check('Product price change or inactive product rejects old quote without mutation', async () => {
    const before = await countOrders(), value = draft(), priced = await quote(value);
    await db.query('update local_products set price=100001,updated_at=now() where id=$1', [ids.product]);
    expected(await service('/draft-orders', 'POST', submitBody(value, priced), randomUUID()), 409, 'stale price');
    assert.equal(await countOrders(), before); await db.query('update local_products set price=100000,updated_at=now() where id=$1', [ids.product]);
    const fresh = await quote(value); await db.query('update local_products set is_active=false,updated_at=now() where id=$1', [ids.product]);
    expected(await service('/draft-orders', 'POST', submitBody(value, fresh), randomUUID()), 422, 'inactive catalog'); assert.equal(await countOrders(), before);
    await db.query('update local_products set is_active=true,updated_at=now() where id=$1', [ids.product]);
  });
}

async function draftTests() {
  await check('Concurrent identical submissions create one canonical pending order and durable receipt', async () => {
    coreDraft = draft(); coreQuote = await quote(coreDraft); coreBody = submitBody(coreDraft, coreQuote); coreKey = randomUUID(); const before = await countOrders();
    const results = await Promise.all([service('/draft-orders', 'POST', coreBody, coreKey), service('/draft-orders', 'POST', coreBody, coreKey)]);
    const first = expected(results[0], 200, 'first simultaneous submit'), second = expected(results[1], 200, 'second simultaneous submit');
    assert.deepEqual(first, second); coreOrder = first.order; assert.ok(validators.orderValid(coreOrder)); assert.equal(coreOrder.approval.code, 'pending');
    assert.equal(coreOrder.lines[0].name, 'Gối có sẵn'); assert.equal(coreOrder.lines[1].proposedPrice, 200000); assert.equal(coreOrder.lines[1].unitPrice, undefined);
    assert.equal(await countOrders(), before + 1);
    const stored = (await db.query('select * from local_orders where id=$1', [coreOrder.id])).rows[0]; assert.equal(stored.intake_source, 'ZCRM'); assert.equal(stored.intake_submitted_by, identities.manager);
    assert.equal(Number((await db.query('select count(*) n from zcrm.requests where order_id=$1', [coreOrder.id])).rows[0].n), 1);
    const lookup = expected(await service('/requests/' + coreKey), 200, 'durable lookup'); assert.equal(lookup.found, true); assert.deepEqual(lookup.order, coreOrder);
    assert.deepEqual(expected(await service('/requests/' + randomUUID()), 200, 'missing request'), { found: false });
    expected(await service('/draft-orders', 'POST', { ...coreBody, draft: { ...coreDraft, notes: 'different' } }, coreKey), 409, 'payload conflict');
    assert.equal(await countOrders(), before + 1);
  });
  await check('Replay is checked before expired quote or missing attachment URL; snapshot remains immutable', async () => {
    await db.query("update zcrm.quotes set expires_at=now()-interval '1 hour' where token=$1", [coreQuote.token]);
    assert.deepEqual(expected(await service('/draft-orders', 'POST', { ...coreBody, attachments: [{ invalid: true }] }, coreKey), 200, 'expired quote successful replay').order, coreOrder);
    expected(await service('/draft-orders', 'POST', coreBody, randomUUID()), 409, 'new key expired quote denied');
    await assert.rejects(db.query("update zcrm.requests set fingerprint='changed' where connection_id=$1 and request_key=$2", [connectionId, coreKey]));
  });
  await check('Every accepted 200-character request key remains lookup-compatible', async () => {
    const value = draft(), priced = await quote(value), requestKey = 'long-' + 'a'.repeat(195);
    const result = expected(await service('/draft-orders', 'POST', submitBody(value, priced), requestKey), 200, 'long idempotency key submit');
    assert.deepEqual(expected(await service('/requests/' + requestKey), 200, 'long key lookup').order, result.order);
  });
  await check('Employee attribution keeps the real assigned manager able to review', async () => {
    const value = draft({ notes: 'Nhân viên gửi, quản lý được giao duyệt' }), priced = await quote(value, identities.employee);
    const result = expected(await service('/draft-orders', 'POST', submitBody(value, priced, { actorId: identities.employee }), randomUUID()), 200, 'employee submit');
    const row = (await db.query('select manager_id,intake_created_by,intake_submitted_by from local_orders where id=$1', [result.order.id])).rows[0];
    assert.equal(row.intake_created_by, identities.employee); assert.equal(row.intake_submitted_by, identities.employee); assert.equal(row.manager_id, identities.manager);
    await review(result.order.id, 'return', 1, {}, 'manager');
  });
  await check('A concurrent retry cannot report definitive failure after the same key commits', async () => {
    const value = draft({ notes: 'Barriercase cùng key đang nhận tài liệu' }); value.lines[1].attachments = [{ name: 'Barrier.pdf', mediaId: 'fixture-barrier-media' }];
    const priced = await quote(value), requestKey = randomUUID(), body = submitBody(value, priced, { attachments: [{ name: 'Barrier.pdf', mediaId: 'fixture-barrier-media', url: 'https://zcrm.joliefam.vn/api/v1/joliefam/transfer/fixture-org/barrier-draft/fixture-barrier-media' }] });
    let entered, release; const enteredGate = new Promise(r => entered = r), releaseGate = new Promise(r => release = r);
    transferHook = async url => { if (url.pathname.includes('/barrier-draft/')) { entered(); await releaseGate; } };
    let first, second;
    try {
      first = service('/draft-orders', 'POST', body, requestKey); await enteredGate;
      second = service('/draft-orders', 'POST', { ...body, attachments: [{ name: 'Barrier.pdf', mediaId: 'fixture-barrier-media', url: 'https://evil.invalid/expired' }] }, requestKey);
      await new Promise(r => setTimeout(r, 40)); release();
      const committed = expected(await first, 200, 'first transfer commits');
      await db.query("update zcrm.quotes set expires_at=now()-interval '1 hour' where token=$1", [priced.token]);
      const retried = await second; assert.ok([200, 503].includes(retried.status), 'same key retry must replay or be uncertain, never409/422');
      if (retried.status === 200) assert.deepEqual(retried.body.order, committed.order);
      assert.deepEqual(expected(await service('/requests/' + requestKey), 200, 'barrier lookup').order, committed.order);
      assert.equal(transferCalls.filter(c => c.pathname.includes('/barrier-draft/')).length, 1);
    } finally { release(); transferHook = undefined; await Promise.allSettled([first, second].filter(Boolean)); }
  });
  await check('Pending order cannot be executed, generically patched or deleted', async () => {
    await assert.rejects(db.query("update local_orders set status='processing' where id=$1", [coreOrder.id]), /ZCRM_GUARD/);
    await assert.rejects(db.query("update local_orders set approval_status='approved' where id=$1", [coreOrder.id]), /ZCRM_GUARD/);
    await assert.rejects(db.query('delete from local_orders where id=$1', [coreOrder.id]), /ZCRM_GUARD/);
    await assert.rejects(db.query("insert into local_order_payments(id,order_id,payment_amount,payment_date) values($1,$2,100,now())", [randomUUID(), coreOrder.id]), /ZCRM_GUARD/);
    await assert.rejects(db.query("insert into local_production_orders(production_order_number,production_batch_number,product_id,quantity_planned,order_id,created_by) values('QA-FORBIDDEN','QA-FORBIDDEN-B',$1,1,$2,$3)", [ids.product, coreOrder.id, identities.manager]), /ZCRM_GUARD/);
    assert.equal(Number((await db.query('select count(*) n from local_order_payments where order_id=$1', [coreOrder.id])).rows[0].n), 0);
    const before = Number((await db.query('select sum(quantity_delta) n from local_inventory_movements where inventory_item_id=$1', [ids.item])).rows[0].n); assert.equal(before, 100);
    await assert.rejects(commerce.assertZcrmOrderExecutable(db, coreOrder.id), e => e.code === 'ORDER_NOT_APPROVED');
  });
  await check('A committed submission with destroyed response is recovered by the same request key', async () => {
    const value = draft({ notes: 'Đơn thử timeout sau commit' }), priced = await quote(value), key = randomUUID(), body = submitBody(value, priced);
    const req = httpRequest(base + '/api/zcrm/v1/draft-orders', { method: 'POST', headers: { host: 'crm.example.com', authorization: 'Bearer ' + serviceToken, 'content-type': 'application/json', 'Idempotency-Key': key, 'X-Fixture-Drop-After-Commit': '1' } });
    req.on('error', () => {}); req.on('response', r => r.resume()); req.end(JSON.stringify(body));
    let found; for (let n = 0; n < 100; n++) { const r = await service('/requests/' + key); if (r.body?.found) { found = r.body; break; } await new Promise(r => setTimeout(r, 20)); }
    assert.equal(found?.found, true); const replay = expected(await service('/draft-orders', 'POST', body, key), 200, 'recover committed response'); assert.deepEqual(replay.order, found.order);
    assert.equal(Number((await db.query('select count(*) n from zcrm.requests where connection_id=$1 and request_key=$2', [connectionId, key])).rows[0].n), 1);
  });
  await check('Returned revision updates the same order id/code and cannot be taken by another actor', async () => {
    expected(await human('/orders/' + coreOrder.id + '/review', 'POST', { action: 'return', expected_revision: 1, idempotency_key: randomUUID(), reason: 'Bổ sung màu' }, 'other'), 404, 'review outside owner');
    await review(coreOrder.id, 'return', 1); const returned = await currentOrder(coreOrder.id); assert.equal(returned.approval.code, 'returned'); assert.ok(returned.version > coreOrder.version);
    const value = draft({ notes: 'Đã bổ sung màu theo yêu cầu' }), priced = await quote(value), key = randomUUID();
    const result = expected(await service('/draft-orders', 'POST', submitBody(value, priced, { existingOrderId: coreOrder.id }), key), 200, 'same order revision');
    assert.equal(result.order.id, coreOrder.id); assert.equal(result.order.code, coreOrder.code); assert.equal(result.order.approval.code, 'pending');
    const stored = (await db.query('select approval_revision from local_orders where id=$1', [coreOrder.id])).rows[0]; assert.equal(stored.approval_revision, 3);
    expected(await service('/draft-orders', 'POST', submitBody(value, priced, { existingOrderId: coreOrder.id }), randomUUID()), 409, 'resubmit not returned');
    assert.deepEqual(expected(await service('/requests/' + coreKey), 200, 'old durable result still original').order, coreOrder);
  });
}

async function financeAndEvents() {
  await check('Unsafe VND aggregate approval is rejected atomically before creating unreadable money', async () => {
    const created = await createDraft();
    const result = await human('/orders/' + created.order.id + '/review', 'POST', { action: 'approve', expected_revision: 1, idempotency_key: randomUUID(), unit_prices: [100000, 200000], shipping: Number.MAX_SAFE_INTEGER, tax: Number.MAX_SAFE_INTEGER, discount: 0, deposit: 0 });
    assert.ok([400, 422].includes(result.status), 'unsafe aggregate rejected');
    const after = await currentOrder(created.order.id); assert.equal(after.approval.code, 'pending'); assert.equal(after.total, created.order.total);
  });
  await check('Authorized approval separates proposed/official price and requested/confirmed dates', async () => {
    const reply = await review(coreOrder.id, 'approve', 3, { unit_prices: [100000, 220000], discount: 10000, shipping: 30000, tax: 0, deposit: 100000, confirmed_delivery_date: '2026-11-15' }, 'manager');
    assert.equal(reply.approval_status, 'approved');
    const live = await currentOrder(coreOrder.id); assert.ok(validators.orderValid(live)); assert.equal(live.lines[1].proposedPrice, 200000); assert.equal(live.lines[1].unitPrice, 220000);
    assert.equal(live.desiredDate, '2026-11-12'); assert.equal(live.confirmedDeliveryDate, '2026-11-15'); assert.equal(live.amounts.deposit, 100000); assert.equal(live.total, 545000);
    await commerce.assertZcrmOrderExecutable(db, coreOrder.id);
    expected(await human('/orders/' + coreOrder.id + '/review', 'POST', { action: 'reject', expected_revision: 3, idempotency_key: randomUUID(), reason: 'stale' }), 409, 'stale revision denied');
  });
  await check('Payments, refunds and returns use canonical ledgers without double subtracting', async () => {
    const payment1 = randomUUID(), payment2 = randomUUID();
    await db.query("insert into local_order_payments(id,order_id,payment_amount,payment_date,payment_type) values($1,$3,100000,now(),'deposit'),($2,$3,200000,now(),'installment')", [payment1, payment2, coreOrder.id]);
    let live = await currentOrder(coreOrder.id); assert.equal(live.amounts.collected, 300000); assert.equal(live.amounts.due, 245000); assert.equal(live.amounts.deposit, 100000);
    const lineId = (await db.query('select items from local_orders where id=$1', [coreOrder.id])).rows[0].items[0].id;
    const ret = expected(await human('/orders/' + coreOrder.id + '/returns', 'POST', { idempotency_key: randomUUID(), credit_amount: 100000, lines: [{ line_id: lineId, quantity: 1 }], reason: 'Trả một sản phẩm thử' }), 200, 'return record');
    const refund = expected(await human('/orders/' + coreOrder.id + '/refunds', 'POST', { idempotency_key: randomUUID(), amount: 50000, payment_id: payment1, return_id: ret.id, reason: 'Hoàn tiền thử' }), 200, 'refund record');
    live = await currentOrder(coreOrder.id); assert.ok(validators.orderValid(live)); assert.equal(live.amounts.refunded, 50000); assert.equal(live.amounts.due, 195000); assert.equal(live.returns.find(r => r.id === ret.id).refunded, 50000);
    expected(await human('/orders/' + coreOrder.id + '/refunds', 'POST', { idempotency_key: randomUUID(), amount: 60000, payment_id: payment1, return_id: ret.id, reason: 'Không được hoàn quá' }), 422, 'refund cap');
    expected(await human('/orders/' + coreOrder.id + '/returns', 'POST', { idempotency_key: randomUUID(), credit_amount: 1, lines: [{ line_id: lineId, quantity: 2 }], reason: 'Không được trả quá' }), 422, 'quantity return cap');
    expected(await human('/orders/' + coreOrder.id + '/refunds', 'POST', { idempotency_key: randomUUID(), amount: 1, payment_id: payment1, reversal_of: refund.id, reason: 'Đảo phiếu hoàn thử' }), 200, 'refund reversal');
    live = await currentOrder(coreOrder.id); assert.equal(live.amounts.refunded, 0); assert.equal(live.amounts.due, 145000);
    const summary = expected(await service('/customers/fixture-hotel/summary'), 200, 'summary'); assert.ok(validators.summaryValid(summary)); assert.equal(summary.netSales, 445000); assert.equal(summary.collected, 300000); assert.equal(summary.due, 145000);
    await assert.rejects(db.query('delete from local_order_refunds where id=$1', [refund.id]), /ZCRM_IMMUTABLE/);
  });
  await check('Legacy unknown financial values fail explicitly instead of fabricated zeros', async () => {
    await db.query("insert into local_orders(id,customer_id,tenant_id,manager_id,order_number,status,total_amount,items,created_at,updated_at) values($3,'fixture-hotel','fixture-tenant',$1,'QA-LEGACY','confirmed',100000,$2::jsonb,now(),now())", [identities.manager, JSON.stringify([{ id: 'legacy-line', product_id: ids.product, name: 'Gối có sẵn', quantity: 1, price: 100000, total: 100000, commerce_kind: 'stock', unit: 'cái', commerce_specifications: {} }]), ids.legacy]);
    const result = await service('/customers/fixture-hotel/orders/' + ids.legacy); expected(result, 503, 'unknown finances'); assert.equal(result.body.code, 'DATA_INCOMPLETE');
    expected(await service('/customers/fixture-hotel/summary'), 503, 'unknown summary');
    for (const historyComplete of [undefined, false]) {
      const snapshot = { complete: true, provenance: 'Thông tin thử chưa xác nhận lịch sử', subtotal: 100000, discount: 0, shipping: 0, tax: 0, deposit: 30000, ...(historyComplete === undefined ? {} : { historyComplete }) };
      await db.query('update local_orders set commercial_snapshot=$2::jsonb where id=$1', [ids.legacy, JSON.stringify(snapshot)]);
      const incomplete = await service('/customers/fixture-hotel/orders/' + ids.legacy); expected(incomplete, 503, 'unconfirmed history'); assert.equal(incomplete.body.code, 'DATA_INCOMPLETE');
    }
    expected(await human('/orders/' + ids.legacy + '/reconcile', 'POST', { idempotency_key: randomUUID(), subtotal: 100000, discount: 0, shipping: 0, tax: 0, deposit: 30000, history_complete: true, provenance: 'Đối chiếu chứng từ thử riêng; chưa thu/hoàn/trả', lines: [{ productId: ids.product, kind: 'stock', unit: 'cái', specifications: {} }] }), 200, 'explicit reconciliation');
    const reconciledResponse = await service('/customers/fixture-hotel/orders/' + ids.legacy);
    if (reconciledResponse.status !== 200) {
      const fixtureProjection = await import(pathToFileURL(path.join(repo, 'server-dist/zcrm-data.js')).href);
      try { await fixtureProjection.orderView(db, (await db.query('select * from local_orders where id=$1', [ids.legacy])).rows[0], 'https://crm.example.com'); }
      catch (error) { console.error('FIXTURE projection diagnosis: ' + error.stack); }
    }
    const complete = expected(reconciledResponse, 200, 'legacy reconciled'); assert.ok(validators.orderValid(complete)); assert.equal(complete.amounts.deposit, 30000); assert.equal(complete.amounts.collected, 0); assert.equal(complete.amounts.due, 100000);
  });
  await check('Return reversal restores quantities and concurrent refund requests cannot exceed original payment', async () => {
    const own = await createDraft(); await review(own.order.id, 'approve', 1);
    const lineId = (await db.query('select items from local_orders where id=$1', [own.order.id])).rows[0].items[0].id;
    const originalBody = { idempotency_key: randomUUID(), credit_amount: 100000, lines: [{ line_id: lineId, quantity: 1 }], reason: 'Phiếu trả thử để đảo' };
    const returned = expected(await human('/orders/' + own.order.id + '/returns', 'POST', originalBody), 200, 'return creation');
    assert.deepEqual(expected(await human('/orders/' + own.order.id + '/returns', 'POST', originalBody), 200, 'return replay'), returned);
    assert.equal((await currentOrder(own.order.id)).amounts.due, 400000);
    const reverseBody = { idempotency_key: randomUUID(), reversal_of: returned.id, reason: 'Đảo phiếu trả thử' };
    const reversed = expected(await human('/orders/' + own.order.id + '/returns', 'POST', reverseBody), 200, 'return reversal');
    assert.deepEqual(expected(await human('/orders/' + own.order.id + '/returns', 'POST', reverseBody), 200, 'return reversal replay'), reversed);
    assert.equal((await currentOrder(own.order.id)).amounts.due, 500000);
    expected(await human('/orders/' + own.order.id + '/returns', 'POST', { ...reverseBody, idempotency_key: randomUUID() }), 409, 'return cannot reverse twice');
    expected(await human('/orders/' + own.order.id + '/returns', 'POST', { idempotency_key: randomUUID(), credit_amount: 250000, lines: [{ line_id: lineId, quantity: 2.5 }], reason: 'Số lượng đã khôi phục sau đảo phiếu' }), 200, 'return quantity restored by reversal');
    await assert.rejects(db.query("update local_order_returns set reason='must not replace original' where id=$1", [returned.id]), /ZCRM_IMMUTABLE/);
    const paymentId = randomUUID();
    await db.query("insert into local_order_payments(id,order_id,payment_amount,payment_date,payment_type) values($1,$2,100000,now(),'partial')", [paymentId, own.order.id]);
    const refundRequests = await Promise.all([1, 2].map(() => human('/orders/' + own.order.id + '/refunds', 'POST', { idempotency_key: randomUUID(), amount: 60000, payment_id: paymentId, reason: 'Hoàn đồng thời trong giới hạn khoản thu gốc' })));
    assert.deepEqual(refundRequests.map(r => r.status).sort(), [200, 422]);
    const result = await currentOrder(own.order.id); assert.ok(validators.orderValid(result)); assert.equal(result.amounts.refunded, 60000); assert.equal(result.amounts.collected, 100000); assert.equal(result.amounts.due, 210000);
  });
  await check('Multiple GHN shipments retain actual statuses and do not fabricate refunds', async () => {
    await db.query("insert into local_ghn_tracking(id,ghn_order_code,order_id,tenant_id,manager_id,ghn_status,ghn_status_text) values('fixture-ghn-a','QA-GHN-A',$1,'fixture-tenant',$2,'delivered','Đã giao'),('fixture-ghn-b','QA-GHN-B',$1,'fixture-tenant',$2,'returned','Đã hoàn')", [coreOrder.id, identities.manager]);
    const live = await currentOrder(coreOrder.id); assert.ok(validators.orderValid(live)); assert.equal(live.shipments.length, 2);
    assert.equal(live.shipments.find(s => s.trackingCode === 'QA-GHN-A').status, 'Đã giao'); assert.equal(live.shipments.find(s => s.trackingCode === 'QA-GHN-B').status, 'Đã hoàn'); assert.equal(live.amounts.refunded, 0);
  });
  await check('Payment tombstones change actual collected money and enqueue a newer order version', async () => {
    const before = await currentOrder(coreOrder.id), payment = (await db.query("select id from local_order_payments where order_id=$1 and payment_amount=200000", [coreOrder.id])).rows[0];
    await db.query("insert into local_projection_tombstones(source_table,source_key,tombstone_kind) values('order_payments',$1,'LOCAL')", [payment.id]);
    const after = await currentOrder(coreOrder.id); assert.equal(after.amounts.collected, 100000); assert.equal(after.amounts.due, 345000); assert.equal(after.amounts.deposit, 100000); assert.ok(after.version > before.version);
  });
  await check('Outbox commits with canonical updates and retries stable ids with fresh HMAC timestamp', async () => {
    await db.query("update zcrm.outbox set delivered_at=now() where delivered_at is null");
    const before = await currentOrder(coreOrder.id);
    await db.query("update local_orders set notes=coalesce(notes,'')||' événement fixture' where id=$1", [coreOrder.id]);
    const after = await currentOrder(coreOrder.id); assert.ok(after.version > before.version);
    const event = (await db.query('select * from zcrm.outbox where delivered_at is null and order_id=$1 order by created_at,event_id', [coreOrder.id])).rows[0]; assert.ok(event);
    const attempts = [];
    const transport = async (url, o) => { assert.equal(url.href, 'https://zcrm.joliefam.vn/api/v1/joliefam/webhook/fixture-org'); attempts.push({ ...o, body: o.body }); return { status: attempts.length === 1 ? 500 : 202, body: Buffer.from('{}'), mime: 'application/json' }; };
    assert.equal(await deliverOutbox(db, transport), true);
    assert.equal((await db.query('select delivered_at from zcrm.outbox where event_id=$1', [event.event_id])).rows[0].delivered_at, null);
    await db.query('update zcrm.outbox set next_attempt_at=now() where event_id=$1', [event.event_id]); await new Promise(r => setTimeout(r, 5));
    assert.equal(await deliverOutbox(db, transport), true); assert.equal(attempts.length, 2);
    for (const a of attempts) { const h = a.headers; assert.equal(h['X-CRM-Event-Id'], event.event_id); assert.equal(h['X-CRM-Signature'], createHmac('sha256', signingSecret).update(h['X-CRM-Timestamp'] + '.' + event.event_id + '.' + a.body).digest('hex')); assert.equal(a.body, event.raw_body); }
    assert.notEqual(attempts[0].headers['X-CRM-Timestamp'], attempts[1].headers['X-CRM-Timestamp']);
    assert.ok((await db.query('select delivered_at from zcrm.outbox where event_id=$1', [event.event_id])).rows[0].delivered_at);
    // A local receiver model tests ordering/signature semantics, not deployed ZCRM.
    const accepted = new Set(), newest = new Map();
    const receive = a => { const h = a.headers, expectedSignature = createHmac('sha256', signingSecret).update(h['X-CRM-Timestamp'] + '.' + h['X-CRM-Event-Id'] + '.' + a.body).digest('hex'); if (expectedSignature !== h['X-CRM-Signature']) return 401; if (accepted.has(h['X-CRM-Event-Id'])) return 202; accepted.add(h['X-CRM-Event-Id']); const b = JSON.parse(a.body); newest.set(b.orderId, Math.max(newest.get(b.orderId) || 0, b.version)); return 202; };
    assert.equal(receive(attempts[1]), 202); assert.equal(receive(attempts[1]), 202); assert.equal(receive({ ...attempts[1], headers: { ...attempts[1].headers, 'X-CRM-Signature': '0'.repeat(64) } }), 401);
    assert.equal(newest.get(coreOrder.id), after.version);
    await db.query('update zcrm.connections set enabled=false where id=$1', [connectionId]); await db.query("update local_orders set notes='paused fixture' where id=$1", [coreOrder.id]);
    assert.equal(await deliverOutbox(db, async () => { throw new Error('Disabled connection must not call transport'); }), false);
    await db.query('update zcrm.connections set enabled=true where id=$1', [connectionId]);
  });
}

async function attachmentAndLimits() {
  await check('Attachments are complete before commit and private authenticated downloads match bytes', async () => {
    const value = draft(); value.lines[1].attachments = [{ name: 'Bản đo thử.pdf', mediaId: 'fixture-media-1' }]; const priced = await quote(value), requestKey = randomUUID();
    const manifest = [{ name: 'Bản đo thử.pdf', mediaId: 'fixture-media-1', url: 'https://zcrm.joliefam.vn/api/v1/joliefam/transfer/fixture-org/fixture-draft/fixture-media-1' }];
    transferMode = 'success'; const result = expected(await service('/draft-orders', 'POST', submitBody(value, priced, { attachments: manifest }), requestKey), 200, 'attached submit'); assert.ok(validators.orderValid(result.order));
    assert.equal(transferCalls.at(-1).auth, 'Bearer ' + serviceToken);
    const detail = expected(await human('/orders/' + result.order.id), 200, 'human attached detail'); assert.equal(detail.attachments.length, 1);
    const file = expected(await human('/attachments/' + detail.attachments[0].id), 200, 'private attachment body'); assert.equal(file, null);
    const download = await human('/attachments/' + detail.attachments[0].id); assert.ok(download.bytes.toString().startsWith('Independent fixture document')); assert.ok(download.headers['content-disposition'].startsWith('attachment;')); assert.equal(download.headers['x-content-type-options'], 'nosniff');
    expected(await call('/api/zcrm-admin/attachments/' + detail.attachments[0].id, serviceToken), 401, 'service cannot download internal attachment'); expected(await human('/attachments/' + detail.attachments[0].id, 'GET', undefined, 'other'), 404, 'other manager cannot download');
    await db.query("update zcrm.quotes set expires_at=now()-interval '1 hour' where token=$1", [priced.token]); const calls = transferCalls.length;
    expected(await service('/draft-orders', 'POST', submitBody(value, priced, { attachments: [] }), requestKey), 200, 'attachment successful replay'); assert.equal(transferCalls.length, calls, 'no redownload on replay');
  });
  await check('Missing, wrong-org, redirected, oversized and partial attachments do not create orders', async () => {
    const value = draft(); value.lines[1].attachments = [{ name: 'A.pdf', mediaId: 'fixture-media-1' }, { name: 'B.pdf', mediaId: 'fixture-media-2' }];
    const manifest = value.lines[1].attachments.map(a => ({ ...a, url: 'https://zcrm.joliefam.vn/api/v1/joliefam/transfer/fixture-org/fixture-draft/' + a.mediaId }));
    for (const [mode, entries] of [['success', []], ['success', [{ ...manifest[0], url: manifest[0].url.replace('/fixture-org/', '/other-org/') }, manifest[1]]], ['redirect', manifest], ['oversize', manifest], ['partial', manifest]]) {
      transferMode = mode; const priced = await quote(value), before = await countOrders(), key = randomUUID();
      const result = await service('/draft-orders', 'POST', submitBody(value, priced, { attachments: entries }), key); assert.ok([413, 422, 503].includes(result.status), 'attachment failure is determinate or retriable before write');
      assert.equal(await countOrders(), before); assert.deepEqual(expected(await service('/requests/' + key), 200, 'failed transfer no receipt'), { found: false });
    } transferMode = 'success';
  });
  await check('At most four in-flight machine requests survive quota SQL races', async () => {
    const lock = await db.connect(); const pending = [];
    try { await lock.query('begin'); await lock.query('lock table local_customers in access exclusive mode');
      for (let n = 0; n < 6; n++) pending.push(service('/customers'));
      for (let n = 0; n < 100; n++) { const q = Number((await db.query('select coalesce(sum(requests),0) n from zcrm.quotas where connection_id=$1', [connectionId])).rows[0].n); if (q >= 4) break; await new Promise(r => setTimeout(r, 10)); }
      await new Promise(r => setTimeout(r, 50));
    } finally { await lock.query('rollback'); lock.release(); }
    const results = await Promise.all(pending); assert.equal(results.filter(r => r.status === 200).length, 4); assert.equal(results.filter(r => r.status === 429).length, 2);
  });
}

async function startFullApi() {
  const free = createServer(); free.listen(0, '127.0.0.1'); await once(free, 'listening'); const port = free.address().port; await new Promise(r => free.close(r));
  const childEnv = {}; for (const name of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT']) if (process.env[name]) childEnv[name] = process.env[name];
  Object.assign(childEnv, { NODE_ENV: 'production', PUBLIC_APP_URL: 'https://crm.example.com', LOCAL_DATABASE_URL: dbUrl, LOCAL_API_HOST: '127.0.0.1', LOCAL_API_PORT: String(port), LOCAL_SYNC_AUTO: 'false', LOCAL_AUTH_SUPABASE_BRIDGE: 'false', LOCAL_DEMO_AUTH: 'false', LOCAL_INTEGRATION_API: 'false', LOCAL_ZCRM_API: 'false', ZCRM_ENCRYPTION_KEY: fixtureMaster, LOCAL_ALLOWED_ORIGINS: 'https://crm.example.com', LOCAL_STORAGE_ROOT: path.join(os.tmpdir(), 'zcrm-independent-storage-' + suffix) });
  actualBase = 'http://127.0.0.1:' + port;
  api = spawn(process.execPath, [path.join(repo, 'server-dist/index.js')], { cwd: repo, env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  api.stdout.on('data', c => apiLog += c); api.stderr.on('data', c => apiLog += c);
  for (let n = 0; n < 160; n++) { if (api.exitCode !== null) throw new Error('Disposable full API exited. Inspect redacted build/runtime diagnostics.');
    try { const r = await rawCall(actualBase, '/health'); if (r.body?.database === database) return; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
  throw new Error('Disposable full API health deadline');
}

async function reviewRegressions() {
  await check('Repeated product choices share one aggregate available-stock ceiling', async () => {
    const value = draft({ lines: [60, 60].map(quantity => ({ ...draft().lines[0], quantity })) });
    const result = await service('/quotes', 'POST', { draft: value, fingerprint: upstream.fingerprint(value), actorId: identities.manager, source: 'ZCRM' });
    expected(result, 422, 'aggregate repeated stock 120 exceeds100');
    const valid = draft({ lines: [40, 60].map(quantity => ({ ...draft().lines[0], quantity })) });
    upstream.validateQuote(expected(await service('/quotes', 'POST', { draft: valid, fingerprint: upstream.fingerprint(valid), actorId: identities.manager, source: 'ZCRM' }), 200, 'aggregate repeated stock exact100'), valid);
    const doc = (await db.query("select id from local_inventory_documents where document_number='QA-INITIAL'")).rows[0].id;
    await db.query("insert into local_inventory_movements(document_id,inventory_item_id,warehouse_id,movement_kind,quantity_delta,unit,transaction_at) values($1,$2,$3,'QA_FIXTURE',-99.7,'cái',now())", [doc, ids.item, ids.warehouse]);
    try {
      const exact = draft({ lines: [0.1, 0.2].map(quantity => ({ ...draft().lines[0], quantity })) });
      upstream.validateQuote(expected(await service('/quotes', 'POST', { draft: exact, fingerprint: upstream.fingerprint(exact), actorId: identities.manager, source: 'ZCRM' }), 200, 'decimal aggregate0.1+0.2 exactly0.3'), exact);
      const above = draft({ lines: [0.1, 0.2001].map(quantity => ({ ...draft().lines[0], quantity })) });
      expected(await service('/quotes', 'POST', { draft: above, fingerprint: upstream.fingerprint(above), actorId: identities.manager, source: 'ZCRM' }), 422, 'decimal aggregate0.3001 exceeds0.3');
    } finally { await db.query("insert into local_inventory_movements(document_id,inventory_item_id,warehouse_id,movement_kind,quantity_delta,unit,transaction_at) values($1,$2,$3,'QA_FIXTURE',99.7,'cái',now())", [doc, ids.item, ids.warehouse]); }
  });
  await check('Normalized same-name creation race with different phones creates only one customer', async () => {
    const blocker = await db.connect(), pending = [];
    try {
      await blocker.query('begin'); await blocker.query('lock table local_customers in share mode');
      const make = (name, phone) => service('/customers', 'POST', { name, phone, kind: 'hotel', source: 'ZCRM' }, randomUUID());
      pending.push(make('Khách sạn TRÙNG cạnh tranh', '0987444411'), make('khach san trung canh tranh', '0987444422'));
      for (let i = 0; i < 100; i++) {
        const waiting = Number((await db.query("select count(*) n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query ilike '%insert into local_customers%'")).rows[0].n);
        if (waiting) break; await new Promise(resolve => setTimeout(resolve, 10));
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    } finally { await blocker.query('rollback'); blocker.release(); }
    assert.deepEqual((await Promise.all(pending)).map(r => r.status).sort(), [200, 409]);
    assert.equal(Number((await db.query("select count(*) n from local_customers where phone in ('0987444411','0987444422')")).rows[0].n), 1);
  });
  await check('Decimal sold quantity0.3 accepts exact cumulative returns0.1 plus0.2 and reversal', async () => {
    const value = draft({ lines: [{ ...draft().lines[0], quantity: 0.3 }] });
    const own = await createDraft(value); await review(own.order.id, 'approve', 1);
    const lineId = (await db.query('select items from local_orders where id=$1', [own.order.id])).rows[0].items[0].id;
    const create = async quantity => expected(await human('/orders/' + own.order.id + '/returns', 'POST', { idempotency_key: randomUUID(), credit_amount: quantity === 0.1 ? 10000 : 20000, lines: [{ line_id: lineId, quantity }], reason: 'Trả số lượng thập phân thử riêng' }), 200, 'exact decimal return');
    const first = await create(0.1); await create(0.2);
    assert.equal((await currentOrder(own.order.id)).amounts.due, 0);
    expected(await human('/orders/' + own.order.id + '/returns', 'POST', { idempotency_key: randomUUID(), credit_amount: 1, lines: [{ line_id: lineId, quantity: 0.0001 }], reason: 'Đã trả đủ' }), 422, 'cannot return above decimal quantity');
    expected(await human('/orders/' + own.order.id + '/returns', 'POST', { idempotency_key: randomUUID(), reversal_of: first.id, reason: 'Đảo số lượng0.1' }), 200, 'decimal reversal');
    assert.equal((await currentOrder(own.order.id)).amounts.due, 10000); await create(0.1);
    assert.equal((await currentOrder(own.order.id)).amounts.due, 0);
  });
  await check('Customer, GHN and contract tombstones all advance their canonical versions and events', async () => {
    const customerId = 'fixture-extra-001';
    const beforeCustomer = Number((await db.query('select version from zcrm.customer_versions where customer_id=$1', [customerId])).rows[0].version);
    await db.query("insert into local_projection_tombstones(source_table,source_key,tombstone_kind) values('customers',$1,'LOCAL')", [customerId]);
    const afterCustomer = Number((await db.query('select version from zcrm.customer_versions where customer_id=$1', [customerId])).rows[0].version); assert.ok(afterCustomer > beforeCustomer);
    assert.ok((await db.query('select 1 from zcrm.outbox where customer_id=$1 and version=$2 and order_id is null', [customerId, afterCustomer])).rows[0]);
    expected(await service('/customers/' + customerId), 404, 'tombstoned customer hidden');
    await db.query("delete from local_projection_tombstones where source_table='customers' and source_key=$1", [customerId]);
    assert.ok(Number((await db.query('select version from zcrm.customer_versions where customer_id=$1', [customerId])).rows[0].version) > afterCustomer);
    expected(await service('/customers/' + customerId), 200, 'restored customer visible');
    const own = await createDraft(); await review(own.order.id, 'approve', 1);
    const trackingId = randomUUID(), contractId = randomUUID();
    await db.query("insert into local_ghn_tracking(id,ghn_order_code,order_id,tenant_id,manager_id,ghn_status,ghn_status_text) values($1,$2,$3,'fixture-tenant',$4,'delivering','Đang giao')", [trackingId, 'QA-TOMBSTONE-' + trackingId, own.order.id, identities.manager]);
    let before = await currentOrder(own.order.id); assert.equal(before.shipments.length, 1);
    await db.query("insert into local_projection_tombstones(source_table,source_key,tombstone_kind) values('ghn_tracking',$1,'LOCAL')", [trackingId]);
    let after = await currentOrder(own.order.id); assert.ok(after.version > before.version); assert.equal(after.shipments.length, 0);
    assert.ok((await db.query('select 1 from zcrm.outbox where order_id=$1 and version=$2', [own.order.id, after.version])).rows[0]);
    await db.query("delete from local_projection_tombstones where source_table='ghn_tracking' and source_key=$1", [trackingId]);
    before = after; after = await currentOrder(own.order.id); assert.ok(after.version > before.version); assert.equal(after.shipments.length, 1);
    await db.query("insert into local_contracts(id,contract_number,order_id,customer_id,tenant_id,total_amount,deposit_amount,status) values($1,'QA-CONTRACT',$2,'fixture-hotel','fixture-tenant',500000,123000,'signed')", [contractId, own.order.id]);
    before = await currentOrder(own.order.id); assert.equal(before.amounts.deposit, 123000);
    await db.query("insert into local_projection_tombstones(source_table,source_key,tombstone_kind) values('contracts',$1,'LOCAL')", [contractId]);
    after = await currentOrder(own.order.id); assert.ok(after.version > before.version); assert.equal(after.amounts.deposit, 0);
    assert.ok((await db.query('select 1 from zcrm.outbox where order_id=$1 and version=$2', [own.order.id, after.version])).rows[0]);
    await db.query("delete from local_projection_tombstones where source_table='contracts' and source_key=$1", [contractId]);
    before = after; after = await currentOrder(own.order.id); assert.ok(after.version > before.version); assert.equal(after.amounts.deposit, 123000);
  });
  await check('Actual delivery and GHN problem statuses agree between detail and order filters', async () => {
    const own = await createDraft(); await review(own.order.id, 'approve', 1);
    for (const [status, filter, expectedCode] of [['delivering', 'shipping', 'shipping'], ['partially_delivered', 'shipping', 'partially_delivered'], ['delivered', 'completed', 'completed']]) {
      await db.query('update local_orders set status=$2 where id=$1', [own.order.id, status]);
      const detail = await currentOrder(own.order.id); assert.equal(detail.processing.code, expectedCode);
      const listed = expected(await service('/customers/fixture-hotel/orders?' + new URLSearchParams({ status: filter, q: own.order.code })), 200, 'delivery status filter'); assert.ok(listed.items.some(row => row.id === own.order.id && row.processing.code === expectedCode));
    }
    const trackingId = randomUUID();
    await db.query("insert into local_ghn_tracking(id,ghn_order_code,order_id,tenant_id,manager_id,ghn_status) values($1,$2,$3,'fixture-tenant',$4,'delivery_fail')", [trackingId, 'QA-STATUS-' + trackingId, own.order.id, identities.manager]);
    for (const status of ['delivery_fail', 'returned']) {
      await db.query('update local_ghn_tracking set ghn_status=$2 where id=$1', [trackingId, status]);
      const detail = await currentOrder(own.order.id); assert.equal(detail.processing.code, 'problem');
      const listed = expected(await service('/customers/fixture-hotel/orders?' + new URLSearchParams({ status: 'problem', q: own.order.code })), 200, 'GHN problem filter'); assert.ok(listed.items.some(row => row.id === own.order.id && row.processing.code === 'problem'));
    }
  });
  await check('Queued order event is never sent to former tenant after canonical scope moves', async () => {
    const own = await createDraft(); await review(own.order.id, 'approve', 1);
    await db.query('update zcrm.outbox set delivered_at=now() where delivered_at is null');
    await db.query("update local_orders set notes='Queue former-tenant event' where id=$1", [own.order.id]);
    const stale = (await db.query('select event_id from zcrm.outbox where order_id=$1 and connection_id=$2 and delivered_at is null', [own.order.id, connectionId])).rows[0]; assert.ok(stale);
    const client = await db.connect(); try { await client.query('begin'); await client.query("select set_config('zcrm.authorized_write','on',true)"); await client.query("update local_orders set tenant_id='other-tenant',customer_id='fixture-other',manager_id=$2 where id=$1", [own.order.id, identities.other]); await client.query('commit'); } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
    await db.query('update zcrm.outbox set delivered_at=now() where delivered_at is null and event_id<>$1', [stale.event_id]);
    let calls = 0; await deliverOutbox(db, async () => { calls++; return { status: 202, body: Buffer.from('{}'), mime: 'application/json' }; });
    assert.equal(calls, 0, 'outbox checks current order customer/tenant/grant before sending former event');
    expected(await service('/customers/fixture-hotel/orders/' + own.order.id), 404, 'former tenant cannot read moved order');
  });
  await check('Delivered shipment evidence stays active until whole-order completion is confirmed', async () => {
    const assertEvidence = async own => {
      const detail = await currentOrder(own.order.id); assert.ok(['delivered', 'partially_delivered'].includes(detail.delivery.code), 'delivery evidence must be acknowledged'); assert.notEqual(detail.processing.code, 'completed', 'unreconciled shipment quantities cannot complete whole order');
      const listed = expected(await service('/customers/fixture-hotel/orders?' + new URLSearchParams({ status: 'shipping', q: own.order.code })), 200, 'evidence remains in shipping');
      const row = listed.items.find(r => r.id === own.order.id); assert.ok(row); assert.deepEqual(row.delivery, detail.delivery); assert.deepEqual(row.processing, detail.processing);
      const completed = expected(await service('/customers/fixture-hotel/orders?' + new URLSearchParams({ status: 'completed', q: own.order.code })), 200, 'unconfirmed completion filter'); assert.ok(!completed.items.some(r => r.id === own.order.id));
    };
    const own = await createDraft(); await review(own.order.id, 'approve', 1);
    const trackingId = randomUUID(); await db.query("insert into local_ghn_tracking(id,ghn_order_code,order_id,tenant_id,manager_id,ghn_status) values($1,$2,$3,'fixture-tenant',$4,'delivered')", [trackingId, 'QA-EVIDENCE-' + trackingId, own.order.id, identities.manager]);
    await assertEvidence(own);
    await db.query("update local_ghn_tracking set ghn_status='self_delivered' where id=$1", [trackingId]); await assertEvidence(own);
    const productionOwn = await createDraft(); await review(productionOwn.order.id, 'approve', 1);
    const production = randomUUID(), document = randomUUID(), shipment = randomUUID();
    await db.query("insert into local_production_orders(id,production_order_number,production_batch_number,product_id,quantity_planned,order_id) values($1,$2,$2,$3,2.5,$4)", [production, 'QA-EVIDENCE-P-' + production, ids.product, productionOwn.order.id]);
    await db.query("insert into local_inventory_documents(id,document_number,document_type,status,transaction_at,warehouse_id,idempotency_key,production_order_id) values($1,$2,'ISSUE','CONFIRMED',now(),$3,$2,$4)", [document, 'QA-EVIDENCE-D-' + document, ids.warehouse, production]);
    await db.query("insert into local_production_shipments(id,production_order_id,order_id,shipment_number,status,inventory_document_id,delivered_at,created_by) values($1,$2,$3,$4,'DELIVERED',$5,now(),$6)", [shipment, production, productionOwn.order.id, 'QA-EVIDENCE-S-' + shipment, document, identities.admin]);
    await assertEvidence(productionOwn);
    await db.query("update local_orders set status='delivered' where id=$1", [productionOwn.order.id]);
    const completed = await currentOrder(productionOwn.order.id); assert.equal(completed.processing.code, 'completed'); assert.equal(completed.delivery.code, 'delivered');
    assert.ok(expected(await service('/customers/fixture-hotel/orders?' + new URLSearchParams({ status: 'completed', q: productionOwn.order.code })), 200, 'canonical completion filter').items.some(r => r.id === productionOwn.order.id));
  });
}

async function fullServerTests() {
  // Preserve a fresh, unmodified mixed order for real-browser approval checks.
  const uiDraft = await createDraft();
  await db.query('update zcrm.connections set enabled=false'); // Additional defense: no active remote destination.
  await startFullApi();
  const login = expected(await rawCall(actualBase, '/api/local-auth/login', undefined, 'POST', { email: 'admin@fixture.invalid', password: fixtureLogin }), 200, 'real local session'); const admin = login.token; secrets.push(admin);
  await check('Actual server reserves ZCRM tokens and feature-off API without browser fallback', async () => {
    for (const route of ['/api/orders', '/api/local-auth/me', '/api/zcrm-admin/settings', '/api/order-payments/record']) expected(await rawCall(actualBase, route, serviceToken, route.endsWith('/record') ? 'POST' : 'GET', route.endsWith('/record') ? {} : undefined), 401, 'ZCRM token path separation');
    expected(await rawCall(actualBase, '/api/zcrm/v1/capabilities', admin), 503, 'disabled service fails closed');
    expected(await rawCall(actualBase, '/api/zcrm-admin/settings', admin), 200, 'real admin settings while off');
    expected(await rawCall(actualBase, '/api/local-snapshot/zcrm.connections', admin), 403, 'private schema snapshot');
  });
  await check('Actual server blocks pending payment/status mutation before financial execution', async () => {
    const pending = (await db.query("select id from local_orders where approval_status='pending' order by created_at limit 1")).rows[0]; assert.ok(pending);
    const paid = await rawCall(actualBase, '/api/order-payments/record', admin, 'POST', { order_id: pending.id, payment_amount: 100, payment_date: new Date().toISOString(), payment_type: 'deposit' }); assert.ok([400, 409].includes(paid.status)); assert.match(paid.body.message, /ZCRM_GUARD|chưa.*duyệt/);
    const changed = await rawCall(actualBase, '/api/orders/' + pending.id, admin, 'PATCH', { status: 'processing' }); assert.ok([400, 409, 422].includes(changed.status));
    assert.equal(Number((await db.query('select count(*) n from local_order_payments where order_id=$1', [pending.id])).rows[0].n), 0);
  });
  return { login, admin, uiDraft };
}

async function browserTests({ login, admin, uiDraft }) {
  const { build } = await import('vite');
  uiRoot = await mkdtemp(path.join(os.tmpdir(), 'zcrm-independent-ui-'));
  await build({ root: repo, envDir: false, mode: 'production', logLevel: 'warn',
    define: {
      'import.meta.env.VITE_BACKEND_MODE': JSON.stringify('local'),
      'import.meta.env.VITE_LOCAL_API_URL': JSON.stringify(''),
      'import.meta.env.VITE_LOCAL_DEMO_AUTH': JSON.stringify('false'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(''),
    }, build: { outDir: uiRoot, emptyOutDir: true, sourcemap: false } });
  const staticApp = express();
  staticApp.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const headers = { ...req.headers, host: 'crm.example.com' };
    // This isolated reverse proxy represents the canonical HTTPS VPS origin.
    // It cannot forward to any other upstream or read actual server settings.
    delete headers.origin;
    const forward = httpRequest(actualBase + req.originalUrl, { method: req.method, headers }, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    forward.on('error', () => { if (!res.headersSent) res.status(502).json({ message: 'Fixture proxy failed' }); else res.destroy(); });
    req.pipe(forward);
  });
  staticApp.use(express.static(uiRoot));
  staticApp.use((_req, res) => res.sendFile(path.join(uiRoot, 'index.html')));
  frontend = staticApp.listen(0, '127.0.0.1'); await once(frontend, 'listening');
  const uiBase = 'http://127.0.0.1:' + frontend.address().port;
  const { chromium } = require('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === uiBase ? route.continue() : route.abort());
  await context.addInitScript(session => localStorage.setItem('local_user_session', JSON.stringify(session)), { ...login, actor: identities.admin, role: 'admin' });
  const page = await context.newPage(), uiProblems = browserProblems;
  page.on('pageerror', error => uiProblems.push(error.message));
  page.on('response', response => { if (response.url().includes('/api/zcrm-') && response.status() >= 400) uiProblems.push('ZCRM HTTP ' + response.status() + ' ' + new URL(response.url()).pathname); });
  await check('Browser admin config derives org from webhook, preserves private keys and fits mobile', async () => {
    const preservedAddresses = [
      { id: 'fixture-address-meta-a', name: 'Lễ tân thử A', phone: '0900000001', address: 'Địa chỉ có nhãn A', label: 'Lễ tân chính', isPrimary: true },
      { id: 'fixture-address-meta-b', name: 'Kho thử B', phone: '0900000002', address: 'Địa chỉ có nhãn B', label: 'Kho hàng', isPrimary: false },
    ];
    await db.query('update local_customers set addresses=$2::jsonb where id=$1', ['fixture-hotel', JSON.stringify(preservedAddresses)]);
    await page.goto(uiBase + '/api-settings', { waitUntil: 'domcontentloaded' });
    const title = page.getByRole('heading', { name: /^ZCRM — mua hàng và gửi nháp/ }); await title.waitFor();
    const card = title.locator('xpath=../..');
    await card.getByLabel('Chọn kết nối ZCRM', { exact: true }).selectOption(connectionId);
    assert.equal(await card.getByLabel('Tên kết nối', { exact: true }).inputValue(), 'ZCRM thử riêng');
    assert.equal(await card.locator('input[type=password]').first().inputValue(), '', 'saved service token never reappears');
    await card.getByLabel('Tìm hồ sơ cấp quyền ZCRM', { exact: true }).fill('QA-HOTEL');
    const hotelRow = card.locator('div').filter({ has: page.getByText('Khách sạn kiểm thử', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Hồ sơ', exact: true }) }).last();
    await hotelRow.getByRole('button', { name: 'Hồ sơ', exact: true }).click();
    await card.getByLabel('Địa chỉ nhận 1', { exact: true }).waitFor();
    assert.equal(await card.getByLabel('Địa chỉ nhận 1', { exact: true }).inputValue(), preservedAddresses[0].address);
    await card.getByRole('button', { name: 'Lưu hồ sơ chuẩn', exact: true }).click();
    await card.getByLabel('Địa chỉ nhận 1', { exact: true }).waitFor({ state: 'hidden' });
    assert.deepEqual((await db.query('select addresses from local_customers where id=$1', ['fixture-hotel'])).rows[0].addresses, preservedAddresses, 'classification does not remove address labels or primary flags');
    await card.screenshot({ path: path.join(outputs, 'settings-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await card.scrollIntoViewIfNeeded();
    const before = await card.boundingBox(); assert.ok(before && before.x >= 0 && before.x + before.width <= 391, 'settings panel stays in mobile viewport');
    await card.screenshot({ path: path.join(outputs, 'settings-mobile.png') });
    await card.getByLabel('Chọn kết nối ZCRM', { exact: true }).selectOption('new');
    await card.getByPlaceholder('https://zcrm.joliefam.vn/api/v1/joliefam/webhook/…').fill('https://zcrm.joliefam.vn/api/v1/joliefam/webhook/fixture-ui-org');
    await card.getByText('Thông tin kết nối nâng cao', { exact: true }).click();
    assert.equal(await card.getByLabel('Mã tổ chức ZCRM', { exact: true }).inputValue(), 'fixture-ui-org');
    assert.equal(await card.getByLabel('Origin ZCRM HTTPS', { exact: true }).inputValue(), 'https://zcrm.joliefam.vn');
    await card.getByLabel('Tên kết nối', { exact: true }).fill('Kết nối UI thử riêng');
    await card.getByLabel('Đơn vị dữ liệu CRM').selectOption('fixture-tenant');
    await card.getByRole('button', { name: 'Thêm nhân viên', exact: true }).click();
    await card.getByLabel('Mã nhân viên ZCRM 1', { exact: true }).fill('fixture-ui-manager');
    await card.getByLabel('Nhân viên CRM 1', { exact: true }).selectOption(identities.manager);
    let failSettingsRead = true;
    const settingsRoute = async route => {
      if (failSettingsRead) { failSettingsRead = false; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Fixture settings refetch interrupted after successful save' }) }); }
      else await route.continue();
    };
    await context.route('**/api/zcrm-admin/settings', settingsRoute);
    const saved = page.waitForResponse(r => r.url().endsWith('/api/zcrm-admin/connections') && r.request().method() === 'POST');
    await card.getByRole('button', { name: 'Lưu kết nối ZCRM', exact: true }).click();
    assert.equal((await saved).status(), 200);
    await page.getByRole('button', { name: 'Đã lưu an toàn — ẩn khóa', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Khóa API', { exact: true }).getAttribute('type'), 'password', 'one-time credentials remain available and masked even when follow-up settings read fails');
    const created = (await db.query("select enabled from zcrm.connections where org_id='fixture-ui-org'")).rows[0]; assert.ok(created); assert.equal(created.enabled, false);
    await page.getByRole('button', { name: 'Đã lưu an toàn — ẩn khóa', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Sao chép Khóa API', exact: true }).count(), 0);
    await context.unroute('**/api/zcrm-admin/settings', settingsRoute);
    const expectedInterruption = uiProblems.indexOf('ZCRM HTTP 503 /api/zcrm-admin/settings');
    assert.notEqual(expectedInterruption, -1); uiProblems.splice(expectedInterruption, 1);
  });
  await check('Browser stock review keeps quoted canonical price and approval total without edits', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(uiBase + '/orders', { waitUntil: 'domcontentloaded' });
    const section = page.getByRole('region', { name: 'Đơn nháp từ ZCRM', exact: true }); await section.waitFor();
    const row = section.locator('div').filter({ has: page.getByText(uiDraft.order.code, { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Kiểm tra và duyệt', exact: true }) }).last();
    await row.getByRole('button', { name: 'Kiểm tra và duyệt', exact: true }).click();
    const dialog = page.getByRole('dialog'); await dialog.getByLabel('Đơn giá chính thức dòng 1', { exact: true }).waitFor();
    assert.equal(await dialog.getByLabel('Đơn giá chính thức dòng 1', { exact: true }).inputValue(), '100000', 'stock review prefilled with canonical quote price, not zero');
    assert.equal(await dialog.getByLabel('Đơn giá chính thức dòng 2', { exact: true }).inputValue(), '200000');
    await dialog.screenshot({ path: path.join(outputs, 'review-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await dialog.boundingBox(); assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391, 'review modal fits mobile viewport');
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'review content has no horizontal overflow');
    await dialog.screenshot({ path: path.join(outputs, 'review-mobile.png') });
    const approved = page.waitForResponse(r => r.url().endsWith('/api/zcrm-admin/orders/' + uiDraft.order.id + '/review') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Duyệt đơn', exact: true }).click();
    assert.equal((await approved).status(), 200);
    await dialog.waitFor({ state: 'hidden' });
    const projected = expected(await rawCall(actualBase, '/api/zcrm-admin/orders/' + uiDraft.order.id, admin), 200, 'approved UI detail');
    assert.equal(projected.order.approval.code, 'approved'); assert.equal(projected.order.amounts.subtotal, 500000); assert.equal(projected.order.total, 500000);
    assert.deepEqual(projected.order.lines.map(l => l.unitPrice), [100000, 200000]);
  });
  assert.deepEqual(uiProblems, [], 'no browser runtime or ZCRM API failures');
  pass('Browser isolated navigation produced no runtime/ZCRM API failures');
  await context.close();
}

async function run() {
  await mkdir(outputs, { recursive: true });
  sqlAdmin('CREATE ROLE ' + role + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '" + fixturePassword + "'"); roleCreated = true;
  sqlAdmin('CREATE DATABASE ' + database + ' OWNER ' + role); databaseCreated = true;
  Object.assign(process.env, { NODE_ENV: 'production', PUBLIC_APP_URL: 'https://crm.example.com', LOCAL_DATABASE_URL: dbUrl, LOCAL_SYNC_AUTO: 'false', LOCAL_DEMO_AUTH: 'false', LOCAL_AUTH_SUPABASE_BRIDGE: 'false', LOCAL_ZCRM_API: 'true', ZCRM_ENCRYPTION_KEY: fixtureMaster, LOCAL_ALLOWED_ORIGINS: 'https://crm.example.com', PGOPTIONS: '' });
  const bootstrap = await import(pathToFileURL(path.join(repo, 'server-dist/db/bootstrap.js')).href); db = bootstrap.pool;
  await bootstrap.bootstrapDatabase();
  assert.equal((await db.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper, false);
  assert.ok((await db.query("select 1 from local_schema_migrations where name='075_local_zcrm_commerce.sql'")).rows[0]);
  assert.ok((await db.query("select 1 from local_schema_migrations where name='076_local_zcrm_projection_events.sql'")).rows[0]);
  assert.equal(Number((await db.query('select count(*) n from local_customers')).rows[0].n), 0); pass('All migrations run in empty disposable NOSUPERUSER database without production seed');
  [commerce, domain, { deliverZcrmOutbox: deliverOutbox }, upstream, validators] = await Promise.all([
    import(pathToFileURL(path.join(repo, 'server-dist/zcrm-commerce.js')).href), import(pathToFileURL(path.join(repo, 'server-dist/zcrm-domain.js')).href),
    import(pathToFileURL(path.join(repo, 'server-dist/zcrm-outbox.js')).href), import(pathToFileURL(path.join(reference, 'commerce-domain.ts')).href), import(pathToFileURL(path.join(reference, 'commerce-contract.ts')).href),
  ]);
  const app = express(); app.use(express.json({ limit: '512kb' }));
  // Simulates a dropped postcommit response while retaining the actual DB commit.
  app.use((req, res, next) => { if (req.get('X-Fixture-Drop-After-Commit') === '1') { const send = res.send.bind(res); res.send = body => { if (res.statusCode < 300) { req.socket.destroy(); return res; } return send(body); }; } next(); });
  commerce.registerZcrmCommerce({ app, pool: db, resolveCaller: async req => { const userId = fixtureSessions.get((req.get('authorization') || '').replace(/^Bearer /, '')); return userId ? { userId } : null; }, transport: fixtureTransport, worker: false });
  app.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ message: 'Fixture bounded JSON rejection' }));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = 'http://127.0.0.1:' + server.address().port;
  await seed(); await configure(); await protocolTests(); await draftTests(); await financeAndEvents(); await attachmentAndLimits(); await reviewRegressions(); const full = await fullServerTests(); await browserTests(full);
  const audit = JSON.stringify((await db.query('select detail from zcrm.audit')).rows);
  for (const secret of secrets) { assert.ok(!audit.includes(secret), 'fixture secret absent from audit'); assert.ok(!apiLog.includes(secret), 'fixture secret absent from API log'); }
  pass('Fixture secrets absent from audit and API output');
  await writeFile(path.join(outputs, 'report.json'), JSON.stringify({ checks, count: checks.length, status: 'passed', sourceContractCommit: '7682fd65d998cf30fe335faa1fe53bdfd9b2cbb3', liveConnection: 'not tested; fixture HTTP/DB/transport only' }, null, 2));
  console.log('ZCRM INDEPENDENT ISOLATED COMPLETE (' + checks.length + ' groups); no real connection claimed.');
}

try { await run(); }
catch (error) { await mkdir(outputs, { recursive: true });
  const failedPage = browser?.contexts()[0]?.pages()[0];
  if (failedPage) { await failedPage.screenshot({ path: path.join(outputs, 'browser-failure.png'), fullPage: true }).catch(() => undefined); await writeFile(path.join(outputs, 'browser-failure-dom.json'), JSON.stringify({ url: failedPage.url(), body: await failedPage.locator('body').innerText().catch(() => ''), problems: browserProblems }, null, 2)); }
  await writeFile(path.join(outputs, 'failure.json'), JSON.stringify({ status: 'failed', passedChecks: checks, message: String(error.message).replace(/FixtureOnly![A-Za-z0-9]+/g, '[fixture-secret]') }, null, 2)); throw error; }
finally {
  await browser?.close(); if (frontend) await new Promise(r => frontend.close(r));
  if (api && api.exitCode === null) { api.kill(); await Promise.race([once(api, 'exit'), new Promise(r => setTimeout(r, 3000))]); }
  if (server) await new Promise(r => server.close(r)); await db?.end();
  if (databaseCreated && /^zcrm_independent_\d+_\d+$/.test(database)) sqlAdmin('DROP DATABASE ' + database + ' WITH (FORCE)');
  if (roleCreated && /^zcrm_qa_\d+_\d+$/.test(role)) sqlAdmin('DROP ROLE IF EXISTS ' + role);
  if (uiRoot && path.basename(uiRoot).startsWith('zcrm-independent-ui-')) await rm(uiRoot, { recursive: true, force: true });
  console.log('CLEANUP disposable database, role and fixture processes only.');
}
