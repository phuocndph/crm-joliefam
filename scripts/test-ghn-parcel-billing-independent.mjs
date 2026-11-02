// Independent GHN billing regression checks. Pure helpers and real service classes
// with injected HTTP and a strict in-memory SQL fixture only. This is NOT a
// PostgreSQL integration test. No environment files, sockets, real GHN, or DB.
// Run only after the production-file hash is frozen: node --import tsx <this file>.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  buildGhnPackedContent, buildGhnPackedParcelItemName, buildGhnCreateParcelItemName, buildGhnQuoteSnapshot, compareGhnShopQuotes,
  createGhnQuoteSession, eligibleGhnServices, findGhnAutomaticCheapest,
  isGhnServiceEligible, parseGhnKilograms, StaleGhnQuoteError,
  validateGhnCreateItems,
} from '../src/lib/ghn-quote-comparison.ts';
import { ExternalReadAdapters } from '../server/external-read-adapters.ts';
import { GhnOrders, ghnPackedParcelItemName } from '../server/ghn-orders.ts';

const checks = [];
const check = async (name, run) => {
  try { await run(); checks.push(name); console.log('PASS independent parcel billing: ' + name); }
  catch (error) { console.error('GHN_PARCEL_BILLING_FAILED ' + JSON.stringify({ name, completed: checks })); throw error; }
};
const fields = ['weight', 'length', 'width', 'height'];
const products = [{ name: 'Synthetic fitted sheet', quantity: 3 }, { name: 'Synthetic pillowcase', quantity: 7 }];
const services = [2, 5].map(service_type_id => ({ service_id: 53320, service_type_id, short_name: 'Synthetic ' + service_type_id }));
const shops = [123, 456].map(_id => ({ _id, name: 'Synthetic ' + _id, address: 'Synthetic pickup ' + _id, district_id: 1452 }));
const input = (parcel, patch = {}) => ({ provinceId: '202', districtId: '1444', wardCode: '020308', address: 'Synthetic destination', items: structuredClone(products), cod: 100000, insurance: 200000, parcel, ...patch });
const packed = weight => ({ weight, length: 40, width: 30, height: 20 });
const snapshot = (parcel, patch) => {
  const value = buildGhnQuoteSnapshot(input(parcel, patch));
  assert.ok(value.snapshot, value.error); return value.snapshot;
};
const assertCanonical = data => {
  assert.equal(data.items.length, 1); assert.equal(data.items[0].quantity, 1);
  for (const field of fields) assert.equal(data.items[0][field], data[field], field);
};
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

// Fail closed if a constructor ever loses its injected transport. The tests below
// never open a socket; Response/URL are used only as in-memory data containers.
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Operational network is forbidden in independent parcel billing tests.'); };

try {
  await check('kg conversion is exact at gram and 20/50 kg boundaries', () => {
    for (const [text, grams] of [['0.001', 1], ['0,001', 1], ['0.1', 100], ['1.01', 1010], ['1,234', 1234], ['19.999', 19999], ['20', 20000], ['20,000', 20000], ['40', 40000], ['50.000', 50000], [' 2,5 ', 2500]]) assert.equal(parseGhnKilograms(text), grams, text);
    for (const text of ['', ' ', '0', '0.000', '-1', '+1', '1e1', 'Infinity', 'NaN', '.5', '1.', '1,', '1.0001', '0.0001', '50.001', '51', '1,2.3', '1 000', '99999999999999999999999999999999999']) assert.equal(parseGhnKilograms(text), null, text);
  });

  await check('one-parcel service eligibility rejects the wrong weight class', () => {
    const source = structuredClone(services), before = structuredClone(source);
    for (const weight of [1, 19999]) { assert.deepEqual(eligibleGhnServices(source, weight).map(row => row.service_type_id), [2]); assert.equal(isGhnServiceEligible(services[1], weight), false); }
    for (const weight of [20000, 40000, 50000]) { assert.deepEqual(eligibleGhnServices(source, weight).map(row => row.service_type_id), [5]); assert.equal(isGhnServiceEligible(services[0], weight), false); }
    for (const weight of [0, -1, 0.5, 50001, NaN, Infinity]) for (const service of source) assert.equal(isGhnServiceEligible(service, weight), false);
    for (const type of [1, 3, 4, 6, '2', '5', null]) assert.equal(isGhnServiceEligible({ service_type_id: type }, 20000), false);
    assert.deepEqual(source, before);
  });

  await check('preliminary quotes omit all physical dimensions/items instead of fabricating them', () => {
    for (const weight of [1, 19999, 20000, 40000, 50000]) for (const dimensions of [{}, { length: 0, width: 0, height: 0 }]) {
      const value = snapshot({ weight, ...dimensions }); assert.equal(value.kind, 'preliminary');
      assert.equal(value.feeData.weight, weight);
      for (const key of ['length', 'width', 'height', 'items']) assert.equal(Object.hasOwn(value.feeData, key), false, key);
    }
    const before = input({ weight: 20000 });
    const value = buildGhnQuoteSnapshot(before).snapshot; before.parcel.weight = 40000;
    assert.equal(value.feeData.weight, 20000, 'snapshot is detached from mutable form state');
  });

  await check('partial dimensions and invalid physical/money bounds never produce a mixed quote', () => {
    for (const parcel of [
      { weight: 20000, length: 10 }, { weight: 20000, width: 10, height: 20 },
      { weight: 20000, length: 10, width: 20, height: 0 },
      ...fields.flatMap(field => [-1, 0.5, NaN, Infinity, field === 'weight' ? 50001 : 201].map(value => ({ ...packed(20000), [field]: value }))),
      { ...packed(20000), weight: 0 },
    ]) assert.equal(buildGhnQuoteSnapshot(input(parcel)).snapshot, null, JSON.stringify(parcel));
    for (const patch of [{ cod: -1 }, { cod: 1.5 }, { cod: 50000001 }, { insurance: -1 }, { insurance: 5000001 }, { wardCode: '' }, { districtId: '0' }, { address: ' ' }]) assert.equal(buildGhnQuoteSnapshot(input(packed(20000), patch)).snapshot, null);
    for (const weight of [1, 50000]) assert.equal(snapshot({ weight, length: 1, width: 200, height: 1 }).kind, 'final');
  });

  await check('final physical truth is one measured packed parcel, not product quantities', () => {
    const source = input(packed(20000)), before = structuredClone(source);
    const value = buildGhnQuoteSnapshot(source).snapshot; assert.equal(value.kind, 'final'); assertCanonical(value.feeData);
    assert.equal(value.feeData.weight, 20000); assert.deepEqual(source, before);
    const renamed = snapshot(packed(20000), { items: [{ name: 'Renamed', quantity: 1000 }] });
    assert.equal(renamed.key, value.key, 'descriptive product counts do not multiply parcel weight');
    const forty = snapshot(packed(40000)); assertCanonical(forty.feeData); assert.equal(forty.feeData.items[0].weight, 40000); assert.notEqual(forty.key, value.key);
    assert.notEqual(snapshot({ weight: 20000 }).key, value.key, 'preliminary/final cache identities differ');
    for (const field of ['length', 'width', 'height']) assert.notEqual(snapshot({ ...packed(20000), [field]: 41 }).key, value.key);
    assert.match(buildGhnPackedContent(products), /Synthetic fitted sheet × 3/); assert.match(buildGhnPackedContent(products), /Synthetic pillowcase × 7/);
    assert.equal(validateGhnCreateItems(products), '');
    for (const quantity of [0, -1, 0.5, 1001, NaN]) assert.ok(validateGhnCreateItems([{ name: 'Synthetic', quantity }]));
  });

  await check('long real contents retain quantities and frontend/server item-label truncation agrees without splitting Unicode', () => {
    for (const items of [
      [{ name: 'x'.repeat(196), quantity: 1 }],
      [{ name: 'x'.repeat(197), quantity: 1 }],
      [{ name: 'x'.repeat(198) + '😀', quantity: 1 }],
      [{ name: 'Synthetic name ' + 'x'.repeat(180), quantity: 3 }, { name: 'Synthetic other ' + 'y'.repeat(180), quantity: 1000 }],
    ]) {
      assert.equal(validateGhnCreateItems(items), '');
      const content = buildGhnPackedContent(items), label = buildGhnPackedParcelItemName(items);
      assert.equal(label, ghnPackedParcelItemName(content)); assert.ok(label.length <= 200);
      if (content.length <= 200) assert.equal(label, content); else assert.ok(label.endsWith('…'));
      assert.ok([...label].every(character => !(character.length === 1 && /[\uD800-\uDFFF]/.test(character))), 'no isolated UTF-16 surrogate');
      assert.match(content, /×/);
    }
  });

  await check('20 to 40 kg re-quotes from canonical items across shops with exact provider totals', async () => {
    const calls = [];
    const session = createGhnQuoteSession(async (action, body) => {
      if (action === 'get_services') return structuredClone(services);
      assert.equal(action, 'calculate_fee'); calls.push(structuredClone(body)); assertCanonical(body.feeData);
      assert.equal(body.feeData.service_type_id, 5);
      // Deliberately calculate from ITEMS, not root weight: this catches the
      // reported regression even if a cache-key-only fix updates the root.
      return { total: body.feeData.items[0].weight * 4 + (body.shopId === '456' ? 5000 : 0), service_fee: 1 };
    });
    const twenty = snapshot(packed(20000)), forty = snapshot(packed(40000));
    const a = await compareGhnShopQuotes(session, shops, twenty);
    assert.equal(findGhnAutomaticCheapest(a, twenty.key).total, 80000); assert.equal(a.failures.length, 0);
    const b = await compareGhnShopQuotes(session, shops, forty);
    assert.equal(findGhnAutomaticCheapest(b, forty.key).total, 160000); assert.equal(b.failures.length, 0);
    assert.equal(calls.length, 4); assert.deepEqual(calls.map(row => row.feeData.items[0].weight).sort((x, y) => x - y), [20000, 20000, 40000, 40000]);
    assert.equal(findGhnAutomaticCheapest(a, forty.key), undefined);
    await assert.rejects(() => session.quote('123', services[0], forty)); assert.equal(calls.length, 4, 'ineligible service does not issue a fee call');
  });

  await check('weight-class change filters cached services and a rejected type5 preliminary is not a fake cheapest', async () => {
    const calls = [];
    const session = createGhnQuoteSession(async (action, body) => {
      if (action === 'get_services') return structuredClone(services);
      calls.push(structuredClone(body.feeData));
      if (body.feeData.service_type_id === 5 && !body.feeData.items) throw new Error('Synthetic GHN requires heavy parcel measurements');
      return { total: body.feeData.items ? 45678 : 12345 };
    });
    const light = await compareGhnShopQuotes(session, shops, snapshot({ weight: 19999 }));
    assert.equal(light.quotes.length, 2); assert.ok(calls.every(row => row.service_type_id === 2));
    const heavy = snapshot({ weight: 20000 }), rejected = await compareGhnShopQuotes(session, shops, heavy);
    assert.equal(rejected.quotes.length, 0); assert.equal(rejected.failures.length, 2); assert.equal(findGhnAutomaticCheapest(rejected, heavy.key), undefined);
    const measured = snapshot(packed(20000)), recovered = await compareGhnShopQuotes(session, shops, measured);
    assert.equal(recovered.failures.length, 0); assert.equal(findGhnAutomaticCheapest(recovered, measured.key).total, 45678);
  });

  await check('late 20 kg response cannot publish or populate the current 40 kg cache', async () => {
    const pending = new Map();
    const session = createGhnQuoteSession(async (action, body) => { assert.equal(action, 'calculate_fee'); const gate = deferred(); pending.set(body.feeData.weight, gate); return gate.promise; });
    const twenty = snapshot(packed(20000)), forty = snapshot(packed(40000));
    const old = session.quote('123', services[1], twenty); const oldRejection = assert.rejects(old, StaleGhnQuoteError);
    session.invalidate(); const current = session.quote('123', services[1], forty);
    pending.get(40000).resolve({ total: 160000 }); assert.equal(await current, 160000);
    pending.get(20000).resolve({ total: 80000 }); await oldRejection;
    assert.equal(session.peekQuote('123', services[1], twenty), undefined); assert.equal(session.peekQuote('123', services[1], forty), 160000);
  });

  // This SQL fixture exists only to exercise the real service's validation,
  // reservation and replay order. It does not model PostgreSQL concurrency.
  class MemorySqlFixture {
    attempts = []; tracking = []; audits = []; reservations = 0;
    async connect() { return { query: this.query.bind(this), release() {} }; }
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
      const rows = values => ({ rows: structuredClone(values), rowCount: values.length });
      if (text.startsWith('select r.role,r.assigned_by from local_user_profiles')) return rows(params[0] === 'billing-fixture-admin' ? [{ role: 'admin', assigned_by: null }] : []);
      if (text.startsWith('select * from integration_private.ghn_order_attempts where actor_id=$1 and idempotency_key=$2')) return rows(this.attempts.filter(row => row.actor_id === params[0] && row.idempotency_key === params[1]));
      if (text.startsWith('select * from integration_private.ghn_order_attempts where id=$1')) return rows(this.attempts.filter(row => row.id === params[0]));
      if (['begin', 'commit', 'rollback'].includes(text) || text.startsWith('set local lock_timeout=') || text.startsWith('select pg_advisory_xact_lock') || text.startsWith('lock table local_projection_tombstones') || text.startsWith('select user_id from local_user_profiles') || text.startsWith('select user_id from local_user_roles') || text.startsWith('select user_id from local_employee_permissions')) return rows([]);
      if (text.startsWith('select 1 from integration_private.ghn_order_attempts where actor_id=$1 and scope_key=$2')) return rows(this.attempts.filter(row => row.actor_id === params[0] && row.scope_key === params[1] && ['IN_FLIGHT', 'UNKNOWN', 'REMOTE_CREATED'].includes(row.status)).map(() => ({ exists: 1 })));
      if (text.startsWith('insert into integration_private.ghn_order_attempts')) {
        const [id, actor_id, manager_id, tenant_id, order_id, scope_key, shop_id, config_revision, idempotency_key, payload_hash, client_order_code, request] = params;
        const row = { id, actor_id, manager_id, tenant_id, order_id, scope_key, shop_id, config_revision, idempotency_key, payload_hash, client_order_code, status: 'IN_FLIGHT', request_data: JSON.parse(request), result_data: {}, order_code: null };
        this.attempts.push(row); this.reservations++; return rows([row]);
      }
      if (text.startsWith("update integration_private.ghn_order_attempts set status='remote_created'")) {
        const row = this.attempts.find(row => row.id === params[0] && ['IN_FLIGHT', 'UNKNOWN'].includes(row.status));
        if (!row) return rows([]); row.status = 'REMOTE_CREATED'; row.order_code = params[1]; row.result_data = JSON.parse(params[2]); return rows([row]);
      }
      if (text.startsWith('insert into local_ghn_tracking')) { this.tracking.push(structuredClone(params)); return rows([]); }
      if (text.startsWith('insert into local_auth_audit_events')) { this.audits.push(structuredClone(params)); return rows([]); }
      if (text.startsWith("update integration_private.ghn_order_attempts set status='success'")) { const row = this.attempts.find(row => row.id === params[0]); assert.ok(row); row.status = 'SUCCESS'; return rows([row]); }
      if (text.startsWith("update integration_private.ghn_order_attempts set status='unknown'")) { const row = this.attempts.find(row => row.id === params[0]); if (row?.status === 'IN_FLIGHT') row.status = 'UNKNOWN'; return rows([]); }
      if (text.startsWith("update integration_private.ghn_order_attempts set status='rejected'")) { const row = this.attempts.find(row => row.id === params[0]); if (row?.status === 'IN_FLIGHT') {row.status = 'REJECTED';row.result_data=JSON.parse(params[1]);} return rows([]); }
      throw new Error('Unexpected synthetic SQL: ' + text);
    }
  }

  const createInput = value => ({
    idempotencyKey: randomUUID(), shopId: '123', orderId: null, orderNumber: 'TEST-SYNTHETIC-BILLING', provinceId: 202,
    orderData: {
      to_name: 'Synthetic Recipient', to_phone: '0900000003', to_address: 'Synthetic destination', to_district_id: 1444, to_ward_code: '020308',
      weight: value.feeData.weight, length: value.feeData.length, width: value.feeData.width, height: value.feeData.height,
      cod_amount: 100000, insurance_value: 200000, cod_failed_amount: 0, note: '', required_note: 'KHONGCHOXEMHANG',
      content: buildGhnPackedContent(products), payment_type_id: 1, service_type_id: value.feeData.weight < 20000 && value.feeData.items?.length === 1 ? 2 : 5, service_id: 53320,
      // Quote item labels are price-neutral; create carries the actual contents.
      items: (value.feeData.items || []).map((row,index) => ({ ...row, name: buildGhnCreateParcelItemName(products,index,value.feeData.items.length), price: 0 })),
    },
  });
  const makeRuntime = () => {
    const db = new MemorySqlFixture(), wire = { fee: [], create: [], preview: [], all: [] };
    const config = { token: 'synthetic-billing-only', primaryShop: '123', shops: ['123'], configured: true, source: 'saved', mode: 'ENABLED', revision: 1, hasSavedKey: true };
    const provider = async (urlText, init = {}) => {
      const url = new URL(urlText), path = url.pathname.split('/public-api/')[1], body = init.body ? JSON.parse(init.body) : {};
      wire.all.push(path);
      if (path === 'v2/shop/all') return response({ code: 200, data: { shops: [{ _id: 123, name: 'Synthetic pickup', district_id: 1452, ward_code: '010101', status: 1 }], last_offset: 0 } });
      if (path === 'master-data/province') return response({ code: 200, data: [{ ProvinceID: 202, ProvinceName: 'Synthetic Province' }] });
      if (path === 'master-data/district') return response({ code: 200, data: [{ DistrictID: 1444, ProvinceID: 202, DistrictName: 'Synthetic District' }] });
      if (path === 'master-data/ward') return response({ code: 200, data: [{ WardCode: '020308', DistrictID: 1444, WardName: 'Synthetic Ward' }] });
      if (path === 'v3/master-data/province/all') return response({ code: 200, data: [{ _id: 202, name: 'Synthetic New Province' }] });
      if (path === 'v3/master-data/ward/all-by-province-id') return response({ code: 200, data: [{ _id: 2001, parent_id: 202, name: 'Synthetic New Ward' }] });
      if (path === 'v2/shipping-order/available-services') return response({ code: 200, data: structuredClone(services) });
      if (path === 'v2/shipping-order/fee') { wire.fee.push(structuredClone(body)); return response({ code: 200, data: { total: body.items ? body.items.reduce((sum,row)=>sum+row.weight*4,0) : 12345 } }); }
      if (path === 'v2/shipping-order/preview') { wire.preview.push(structuredClone(body)); if(wire.rejectPreview)return response({code:400,message:'Synthetic unsupported weight'},400);return response({ code: 200, data: { order_code: '', total_fee: body.items.reduce((sum,row)=>sum+row.weight*4,0) } }); }
      if (path === 'v2/shipping-order/create') { wire.create.push(structuredClone(body)); if(wire.throwCreate)throw new Error('Synthetic lost response');if(wire.rejectCreate)return response({code:400,message:'Synthetic unsupported weight'},400);return response({ code: 200, data: { order_code: 'TESTBILLING' + wire.create.length, total_fee: body.items.reduce((sum,row)=>sum+row.weight*4,0) } }); }
      if (path === 'v2/shipping-order/detail-by-client-code') return response({code:200,data:wire.lookup||{}});
      throw new Error('Unexpected injected provider route: ' + path);
    };
    const adapter = new ExternalReadAdapters({}, provider, async () => structuredClone(config));
    return { db, wire, adapter, service: new GhnOrders(db, adapter, provider) };
  };

  await check('fee adapter preserves omission for preliminary and authoritative pickup/canonical data for final', async () => {
    const { adapter, wire } = makeRuntime();
    for (const weight of [19999, 20000, 40000]) {
      const preliminary = snapshot({ weight });
      const result = await adapter.ghn({ action: 'calculate_fee', shopId: '123', feeData: { ...preliminary.feeData, service_id: 53320, service_type_id: weight < 20000 ? 2 : 5 } });
      assert.equal(result.data.total, 12345);
      const sent = wire.fee.at(-1); assert.equal(sent.from_district_id, 1452); assert.equal(sent.weight, weight);
      for (const key of ['length', 'width', 'height', 'items']) assert.equal(Object.hasOwn(sent, key), false, key);
    }
    const final = snapshot(packed(40000));
    await adapter.ghn({ action: 'calculate_fee', shopId: '123', feeData: { ...final.feeData, service_id: 53320, service_type_id: 5 } });
    assertCanonical(wire.fee.at(-1)); assert.equal(wire.fee.at(-1).items[0].weight, 40000);
  });

  await check('real create service sends exactly the physical parcel priced by the fee adapter for both service classes', async () => {
    const { adapter, service, wire, db } = makeRuntime();
    for (const weight of [19999, 20000, 40000]) {
      const value = snapshot(packed(weight)), request = createInput(value);
      const type = weight < 20000 ? 2 : 5;
      const quote = await adapter.ghn({ action: 'calculate_fee', shopId: '123', feeData: { ...value.feeData, service_id: 53320, service_type_id: type } });
      const result = await service.create('billing-fixture-admin', request);
      assert.equal(result.data.attempt_status, 'SUCCESS'); assert.equal(result.data.total_fee, weight * 4); assert.equal(result.data.total_fee, quote.data.total);
      const fee = wire.fee.at(-1), sent = wire.create.at(-1); assertCanonical(sent);
      for (const field of fields) assert.equal(sent[field], fee[field]);
      assert.deepEqual(sent.items.map(({ price, name, ...row }) => row), fee.items.map(({ name, ...row }) => row));
      assert.equal(sent.content, buildGhnPackedContent(products)); assert.match(sent.content, /× 3/); assert.match(sent.content, /× 7/);
      assert.equal(sent.service_type_id, type); assert.equal(sent.service_id, fee.service_id); assert.equal(sent.from_district_id, fee.from_district_id);
      assert.equal(db.tracking.at(-1)[7], weight, 'tracking stores the same measured gram weight');
      const before = wire.create.length; assert.equal((await service.create('billing-fixture-admin', request)).data.attempt_status, 'SUCCESS'); assert.equal(wire.create.length, before);
    }
    assert.equal(db.reservations, 3); assert.equal(db.audits.length, 3);
  });

  await check('server rejects new noncanonical/wrong-class/missing-dimension creates before reserving or dispatching', async () => {
    const { service, wire, db } = makeRuntime();
    const invalid = [];
    const mutate = run => { const request = createInput(snapshot(packed(20000))); run(request.orderData); invalid.push(request); };
    mutate(data => { data.service_type_id = 2; });
    mutate(data => { data.weight = 19999; data.items[0].weight = 19999; });
    for (const field of fields) mutate(data => { data.items[0][field] += 1; });
    mutate(data => { data.items[0].quantity = 2; });
    mutate(data => { data.items[0].name = 'Unrelated goods'; });
    mutate(data => { data.items[0].price = 1; });
    mutate(data => { data.items.push(structuredClone(data.items[0])); });
    mutate(data => { delete data.length; });
    mutate(data => { data.width = 0; });
    mutate(data => { data.height = 201; data.items[0].height = 201; });
    invalid.push(createInput(snapshot({ weight: 20000 })));
    for (const request of invalid) await assert.rejects(() => service.create('billing-fixture-admin', request));
    assert.equal(wire.create.length, 0); assert.equal(db.reservations, 0); assert.equal(db.tracking.length, 0);
  });

  await check('historical noncanonical/wrong-class UNKNOWN replay returns stored evidence without a new provider call', async () => {
    const { service, wire, db } = makeRuntime();
    const request = createInput(snapshot(packed(20000)));
    request.orderData.service_type_id = 2;
    request.orderData.items[0] = { name: 'Legacy product line', quantity: 3, weight: 1000, length: 10, width: 10, height: 10, price: 0 };
    const payload_hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    db.attempts.push({ id: randomUUID(), actor_id: 'billing-fixture-admin', manager_id: 'billing-fixture-admin', tenant_id: 'local-tenant', order_id: null, scope_key: 'standalone', shop_id: '123', config_revision: 1, idempotency_key: request.idempotencyKey, payload_hash, client_order_code: 'JFsynthetichistoricalreference', status: 'UNKNOWN', order_code: null, request_data: structuredClone(request), result_data: {} });
    const result = await service.create('billing-fixture-admin', request);
    assert.equal(result.data.attempt_status, 'UNKNOWN'); assert.equal(result.data.request_key, request.idempotencyKey); assert.equal(db.reservations, 0); assert.equal(wire.all.length, 0);
    const changed = structuredClone(request); changed.orderData.items[0].weight = 20000;
    await assert.rejects(() => service.create('billing-fixture-admin', changed), error => error.status === 409);
    assert.equal(wire.all.length, 0); assert.equal(db.reservations, 0);
  });

  await check('multiple physical parcels quote and create identically while COD and products remain order-level', async () => {
    for(const weights of [[1000,2000],[20000,20000],[25000,25000],[30000,30000],[40000,40000,40000],Array(100).fill(50000)]){
      const runtime=makeRuntime(),parcels=weights.map((weight,index)=>({...packed(weight),length:40+index}));
      const made=buildGhnQuoteSnapshot({...input(undefined),parcels});assert.ok(made.snapshot,made.error);const value=made.snapshot;
      const request=createInput(value),quote=await runtime.adapter.ghn({action:'calculate_fee',shopId:'123',feeData:{...value.feeData,service_id:53320,service_type_id:5}});
      const result=await runtime.service.create('billing-fixture-admin',request);assert.equal(result.data.attempt_status,'SUCCESS');assert.equal(result.data.total_fee,quote.data.total);
      const fee=runtime.wire.fee.at(-1),sent=runtime.wire.create.at(-1);assert.equal(sent.weight,weights.reduce((a,b)=>a+b,0));assert.equal(sent.service_type_id,5);
      for(const field of ['length','width','height']){assert.equal(fee[field],undefined);assert.equal(sent[field],undefined);}
      assert.deepEqual(sent.items.map(({name,price,...physical})=>physical),fee.items.map(({name,...physical})=>physical));
      assert.equal(sent.items.length,weights.length);assert.equal(sent.cod_amount,100000);assert.equal(sent.insurance_value,200000);assert.ok(sent.items.every(row=>row.quantity===1));
      assert.equal(sent.items[0].name,ghnPackedParcelItemName(sent.content,0,weights.length));assert.equal(sent.items[1].name,`Kiện 2/${weights.length}: Cùng đơn hàng`);
      assert.match(sent.content,/× 3/);assert.match(sent.content,/× 7/);
      const before=runtime.wire.create.length;await runtime.service.create('billing-fixture-admin',request);assert.equal(runtime.wire.create.length,before);
    }
  });

  await check('NEW2 preview and create preserve heavy manifest and never use OLD3 IDs or create during preview',async()=>{
    for(const weights of [[30000,30000],[40000,40000,40000],Array(100).fill(50000)]){
      const runtime=makeRuntime(),parcels=weights.map(weight=>packed(weight));
      const value=buildGhnQuoteSnapshot({...input(undefined),addressMode:'NEW2',newAddress:{newWardId:2001},wardCode:'2001',parcels}).snapshot;
      const request=createInput(value);request.addressMode='NEW2';request.newWardId=2001;
      delete request.orderData.to_district_id;delete request.orderData.to_ward_code;delete request.orderData.service_id;
      const preview=await runtime.service.preview('billing-fixture-admin',request);
      assert.equal(runtime.wire.create.length,0);assert.equal(runtime.db.reservations,0);
      const result=await runtime.service.create('billing-fixture-admin',request);assert.equal(result.data.attempt_status,'SUCCESS');assert.equal(result.data.total_fee,preview.total);
      const seen=runtime.wire.preview[0],sent=runtime.wire.create[0];assert.equal(sent.weight,weights.reduce((a,b)=>a+b,0));assert.equal(sent.weight,seen.weight);assert.deepEqual(sent.items,seen.items);
      assert.equal(sent.service_type_id,5);assert.equal(sent.cod_amount,100000);assert.equal(sent.insurance_value,200000);
      for(const body of [seen,sent]){assert.equal(body.is_new_to_address,true);for(const field of ['to_district_id','to_ward_code','service_id','length','width','height'])assert.equal(body[field],undefined);}
      await runtime.service.create('billing-fixture-admin',request);assert.equal(runtime.wire.create.length,1);
    }
  });

  await check('heavy totals cannot bypass per-parcel, count, integer and manifest-sum guards in either address mode',async()=>{
    const value=buildGhnQuoteSnapshot({...input(undefined),parcels:[packed(30000),packed(30000)]}).snapshot;
    const mutations=[data=>data.weight++,data=>data.weight=5000001,data=>data.weight=Number.MAX_SAFE_INTEGER,data=>data.weight=NaN,data=>data.weight=Infinity,data=>data.weight=60000.5,data=>data.items[0].weight=50001,data=>data.items=Array(101).fill(data.items[0]),data=>{delete data.items;},data=>data.items=[]];
    for(const mutate of mutations){
      const runtime=makeRuntime(),fee={...structuredClone(value.feeData),service_id:53320,service_type_id:5};mutate(fee);await assert.rejects(()=>runtime.adapter.ghn({action:'calculate_fee',shopId:'123',feeData:fee}));
      for(const mode of ['OLD3','NEW2']){
        const request=createInput(value);mutate(request.orderData);
        if(mode==='NEW2'){request.addressMode=mode;request.newWardId=2001;delete request.orderData.to_district_id;delete request.orderData.to_ward_code;delete request.orderData.service_id;await assert.rejects(()=>runtime.service.preview('billing-fixture-admin',request));}
        await assert.rejects(()=>runtime.service.create('billing-fixture-admin',request));
      }
      assert.equal(runtime.wire.fee.length,0);assert.equal(runtime.wire.preview.length,0);assert.equal(runtime.wire.create.length,0);assert.equal(runtime.db.reservations,0);
    }
  });

  await check('carrier rejection of a heavy manifest stays rejected without a fabricated success or clamped retry',async()=>{
    const value=buildGhnQuoteSnapshot({...input(undefined),parcels:[packed(30000),packed(30000)]}).snapshot;
    for(const mode of ['OLD3','NEW2']){
      const runtime=makeRuntime(),request=createInput(value);runtime.wire.rejectCreate=true;
      if(mode==='NEW2'){request.addressMode=mode;request.newWardId=2001;delete request.orderData.to_district_id;delete request.orderData.to_ward_code;delete request.orderData.service_id;runtime.wire.rejectPreview=true;await assert.rejects(()=>runtime.service.preview('billing-fixture-admin',request));assert.equal(runtime.db.reservations,0);}
      const result=await runtime.service.create('billing-fixture-admin',request);assert.equal(result.data.attempt_status,'REJECTED');assert.equal(result.data.order_code,undefined);assert.equal(runtime.wire.create[0].weight,60000);assert.equal(runtime.db.tracking.length,0);assert.equal(runtime.db.audits.length,0);
      assert.equal((await runtime.service.create('billing-fixture-admin',request)).data.attempt_status,'REJECTED');assert.equal(runtime.wire.create.length,1);
    }
  });

  await check('multi adapter/create reject changed sums, root boxes, multiplied quantities and wrong service before dispatch',async()=>{
    const value=buildGhnQuoteSnapshot({...input(undefined),parcels:[packed(1000),packed(2000)]}).snapshot;
    const runtime=makeRuntime();
    for(const mutate of [data=>data.weight++,data=>{data.length=40;data.width=30;data.height=20;},data=>data.items[1].quantity=2,data=>data.items[1].height=0,data=>data.service_type_id=2]){
      const fee={...structuredClone(value.feeData),service_id:53320,service_type_id:5};mutate(fee);await assert.rejects(()=>runtime.adapter.ghn({action:'calculate_fee',shopId:'123',feeData:fee}));
      const request=createInput(value);mutate(request.orderData);await assert.rejects(()=>runtime.service.create('billing-fixture-admin',request));
    }
    assert.equal(runtime.wire.fee.length,0);assert.equal(runtime.wire.create.length,0);assert.equal(runtime.db.reservations,0);
  });

  await check('uncertain multi create requires matching per-parcel evidence before success and never creates twice',async()=>{
    const runtime=makeRuntime(),value=buildGhnQuoteSnapshot({...input(undefined),parcels:[packed(1000),packed(2000)]}).snapshot,request=createInput(value);
    runtime.wire.throwCreate=true;assert.equal((await runtime.service.create('billing-fixture-admin',request)).data.attempt_status,'UNKNOWN');
    const submitted=runtime.wire.create[0];
    const valid={...structuredClone(submitted),shop_id:123,order_code:'TESTMULTIRECOVERED'};
    for(const patch of [{items:undefined},{items:[submitted.items[0]]},{items:submitted.items.map((row,index)=>({...row,weight:row.weight+(index===0?100:-100)}))},{items:submitted.items.map(row=>({...row,weight:String(row.weight)}))}]){
      runtime.wire.lookup={...valid,...patch};assert.equal((await runtime.service.status('billing-fixture-admin',request.idempotencyKey,true)).data.attempt_status,'UNKNOWN');assert.equal(runtime.wire.create.length,1);
    }
    runtime.wire.lookup={...valid,items:[...valid.items].reverse()};assert.equal((await runtime.service.status('billing-fixture-admin',request.idempotencyKey,true)).data.attempt_status,'SUCCESS');assert.equal(runtime.wire.create.length,1);
  });

  await check('optional unit-product metadata persists without becoming physical items or provider fields',async()=>{
    const runtime=makeRuntime(),value=snapshot(packed(4000)),request=createInput(value);
    request.productLines=[{name:'Synthetic unit product',quantity:2,weight:2000,code:'TEST-UNIT'}];
    request.orderData.content=buildGhnPackedContent(request.productLines);request.orderData.items[0].name=ghnPackedParcelItemName(request.orderData.content);
    assert.equal((await runtime.service.create('billing-fixture-admin',request)).data.attempt_status,'SUCCESS');
    assert.deepEqual(runtime.db.attempts[0].request_data.productLines,request.productLines);
    const sent=runtime.wire.create[0];assert.equal(Object.hasOwn(sent,'productLines'),false);assert.equal(sent.weight,4000);assert.equal(sent.items.length,1);assert.equal(sent.items[0].quantity,1);assert.equal(sent.service_type_id,2);assert.match(sent.content,/\[TEST-UNIT\] × 2/);
    await runtime.service.create('billing-fixture-admin',request);assert.equal(runtime.wire.create.length,1,'same metadata retries safely');
    const altered=structuredClone(request);altered.productLines[0].weight=3000;await assert.rejects(()=>runtime.service.create('billing-fixture-admin',altered),error=>error.status===409);
  });

  await check('forged or invalid new product metadata is rejected before dispatch while manual gross weight stays independent',async()=>{
    const runtime=makeRuntime(),request=createInput(snapshot(packed(5000)));
    request.productLines=structuredClone(products);request.productLines[0].weight=2000;
    assert.equal((await runtime.service.create('billing-fixture-admin',request)).data.attempt_status,'SUCCESS','manual gross may differ from known unit weights');
    const before=runtime.wire.create.length;
    for(const mutate of [row=>row.productLines[0].weight=0,row=>row.productLines[0].quantity=0,row=>row.productLines[0].code='x'.repeat(101),row=>row.productLines[0].name='forged',row=>row.productLines[0].weight='2000']){
      const bad=structuredClone(request);bad.idempotencyKey=randomUUID();mutate(bad);await assert.rejects(()=>runtime.service.create('billing-fixture-admin',bad));
    }
    assert.equal(runtime.wire.create.length,before);
  });

  console.log('GHN_PARCEL_BILLING_INDEPENDENT_PASS ' + JSON.stringify({ groups: checks.length, network: 'injected only; global fetch denied', database: 'strict in-memory fixture, NOT PostgreSQL integration', checks }));
} finally {
  globalThis.fetch = previousFetch;
}
