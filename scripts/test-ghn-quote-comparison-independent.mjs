// Independent TEST-ONLY verification. No environment, network, database, or providers.
import assert from 'node:assert/strict';
import { buildGhnQuoteSnapshot, compareGhnShopQuotes, createGhnQuoteSession, StaleGhnQuoteError } from '../src/lib/ghn-quote-comparison.ts';

const shop = _id => ({ _id, name: `Independent ${_id}`, address: `Synthetic ${_id}`, district_id: _id + 100 });
const service = (service_id, service_type_id) => ({ service_id, service_type_id, short_name: `${service_type_id}/${service_id}` });
const input = () => ({ provinceId: '202', districtId: '1444', wardCode: '020308', address: 'Synthetic destination', items: [{ name: 'Box', quantity: 1, weight: 1200, length: 20, width: 30, height: 40 }], cod: 0, insurance: 0 });
const snapshot = buildGhnQuoteSnapshot(input()).snapshot;
assert.ok(snapshot);
const pass = name => console.log(`PASS independent GHN quote: ${name}`);
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

// The snapshot is detached from UI item objects, and its key changes for every
// input that affects the destination, parcel, COD, or insurance.
{
  const source = input(), { snapshot: original } = buildGhnQuoteSnapshot(source);
  const originalPayload = structuredClone(original.feeData), originalKey = original.key;
  source.items[0].weight = 999;
  source.items.push({ ...source.items[0], name: 'Later' });
  assert.deepEqual(original.feeData, originalPayload);
  assert.equal(original.key, originalKey);
  for (const change of [
    { provinceId: '203' }, { districtId: '1445' }, { wardCode: '020309' }, { address: 'Other destination' },
    { cod: 1 }, { insurance: 1 },
    ...['quantity', 'weight', 'length', 'width', 'height'].map(field => ({ items: [{ ...input().items[0], [field]: input().items[0][field] + 1 }] })),
  ]) assert.notEqual(buildGhnQuoteSnapshot({ ...input(), ...change }).snapshot?.key, snapshot.key);
  for (const change of [
    { provinceId: 'Infinity' }, { districtId: '1.5' }, { districtId: String(Number.MAX_SAFE_INTEGER + 1) },
    { wardCode: '' }, { address: '   ' }, { items: [] }, { items: Array.from({ length: 101 }, () => input().items[0]) },
    ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(cod => ({ cod })),
    { cod: 50000001 }, { insurance: -1 }, { insurance: 5000001 },
    ...['quantity', 'weight', 'length', 'width', 'height'].flatMap(field => [0, -1, 0.5, NaN, Infinity].map(value => ({ items: [{ ...input().items[0], [field]: value }] }))),
    { items: [{ ...input().items[0], quantity: 1001 }] },
    { items: [{ ...input().items[0], weight: 50001 }] },
    { items: [{ ...input().items[0], length: 201 }] },
    { items: [{ ...input().items[0], quantity: 2, weight: 25001 }] },
    { items: [{ ...input().items[0], quantity: 2, height: 101 }] },
  ]) assert.equal(buildGhnQuoteSnapshot({ ...input(), ...change }).snapshot, null, JSON.stringify(change));
  for (const name of ['', 'Other box', 'x'.repeat(201)]) assert.equal(buildGhnQuoteSnapshot({ ...input(), items: [{ ...input().items[0], name }] }).snapshot?.key, snapshot.key);
  assert.ok(buildGhnQuoteSnapshot({ ...input(), cod: 50000000, insurance: 5000000, items: [{ ...input().items[0], weight: 50000, length: 200, width: 200, height: 200 }] }).snapshot);
  pass('detached snapshot, complete fingerprint, and boundary validation');
}

// Deliberately scramble order and resolve asynchronously. Every valid pair must
// receive the same payload, and rank by GHN total even when base fees disagree.
{
  const shops = [shop(91), shop(7), shop(42), shop(15)];
  const rows = id => [service(Number(id) * 100 + 5, 5), service(Number(id) * 100 + 2, 2), service(Number(id) * 100 + 5, 5), service(0, 2), service(1.5, 2), service(Number.MAX_SAFE_INTEGER + 1, 5), service(999, 1)];
  const totals = { 9105: 800, 9102: 300, 705: 0, 702: 100, 4205: Number.MAX_SAFE_INTEGER, 4202: 300, 1505: 300, 1502: 300 };
  const calls = [];
  const session = createGhnQuoteSession(async (action, body) => {
    calls.push(structuredClone({ action, body }));
    await Promise.resolve();
    if (action === 'get_services') return rows(body.shopId);
    assert.ok(rows(body.shopId).some(row => row.service_id === body.feeData.service_id && row.service_type_id === body.feeData.service_type_id));
    const { service_id, service_type_id, ...payload } = body.feeData;
    assert.deepEqual(payload, snapshot.feeData);
    return { total: totals[service_id], service_fee: totals[service_id] === 0 ? 999999 : 0 };
  });
  const result = await compareGhnShopQuotes(session, shops, snapshot);
  assert.deepEqual(result.quotes.map(row => [row.shop._id, row.service.service_type_id, row.service.service_id, row.total]), [
    [7, 5, 705, 0], [7, 2, 702, 100], [15, 2, 1502, 300], [15, 5, 1505, 300], [42, 2, 4202, 300], [91, 2, 9102, 300], [91, 5, 9105, 800], [42, 5, 4205, Number.MAX_SAFE_INTEGER],
  ]);
  assert.equal(calls.filter(row => row.action === 'calculate_fee').length, 8);
  assert.equal(result.failures.length, 0);
  assert.equal(session.peekQuote('7', service(705, 5), snapshot), 0);
  assert.equal(session.peekQuote('91', service(705, 5), snapshot), undefined);
  assert.equal(session.peekQuote('7', service(705, 2), snapshot), undefined);
  const before = calls.length;
  await compareGhnShopQuotes(session, [...shops].reverse(), snapshot);
  assert.equal(calls.length, before);
  pass('complete pair matrix, distinct shop IDs, total ranking, zero/safe-int/ties, payload parity, cache');
}

// A type is part of pair identity even if malformed/provider data repeats an ID.
{
  let reads = 0;
  const session = createGhnQuoteSession(async action => { reads++; return action === 'get_services' ? [service(10, 2), service(10, 5), service(10, 2)] : { total: 1 }; });
  const result = await compareGhnShopQuotes(session, [shop(1)], snapshot);
  assert.deepEqual(result.quotes.map(row => row.service.service_type_id), [2, 5]);
  assert.equal(reads, 3);
  pass('service ID plus service type forms quote cache identity');
}

// Partial failures preserve successes; only failed reads retry. A malformed
// provider response is isolated to its shop/pair and cannot become a price.
{
  const calls = new Map();
  let retry = false;
  const session = createGhnQuoteSession(async (action, body) => {
    const key = `${action}:${body.shopId}:${body.feeData?.service_id || ''}`;
    calls.set(key, (calls.get(key) || 0) + 1);
    if (action === 'get_services') {
      if (body.shopId === '30' && !retry) throw new Error('service temporary');
      if (body.shopId === '40') return [];
      if (body.shopId === '50' && !retry) return null;
      return [service(Number(body.shopId) * 10 + 2, 2), service(Number(body.shopId) * 10 + 5, 5)];
    }
    if (body.feeData.service_id === 205 && !retry) return { total: 1.5 };
    return { total: Number(body.shopId) };
  });
  const shops = [10, 20, 30, 40, 50].map(shop);
  const first = await compareGhnShopQuotes(session, shops, snapshot);
  assert.equal(first.quotes.length, 3);
  assert.equal(first.failures.length, 3);
  assert.deepEqual(first.noServices.map(row => row._id), [40]);
  retry = true;
  const second = await compareGhnShopQuotes(session, shops, snapshot);
  assert.equal(second.quotes.length, 8);
  assert.equal(second.failures.length, 0);
  assert.deepEqual(second.noServices.map(row => row._id), [40]);
  for (const id of ['10', '20', '40']) assert.equal(calls.get(`get_services:${id}:`), 1);
  for (const id of ['30', '50']) assert.equal(calls.get(`get_services:${id}:`), 2);
  for (const key of ['calculate_fee:10:102', 'calculate_fee:10:105', 'calculate_fee:20:202']) assert.equal(calls.get(key), 1);
  assert.equal(calls.get('calculate_fee:20:205'), 2);
  pass('partial malformed/failed services and fees isolate, successful cache persists, failed-only retry');
}

{
  for (const response of [undefined, null, {}, { total: undefined }, { total: null }, { total: true }, { total: '0' }, { total: -1 }, { total: 0.1 }, { total: NaN }, { total: Infinity }, { total: -Infinity }, { total: Number.MAX_SAFE_INTEGER + 1 }]) {
    const session = createGhnQuoteSession(async action => action === 'get_services' ? [service(1, 2), service(2, 5)] : response);
    const result = await compareGhnShopQuotes(session, [shop(1)], snapshot);
    assert.equal(result.quotes.length, 0, `malformed response ${String(response)}`);
    assert.equal(result.failures.length, 2);
  }
  const allFailed = await compareGhnShopQuotes(createGhnQuoteSession(async () => { throw new Error('All unavailable'); }), [shop(2), shop(1)], snapshot);
  assert.equal(allFailed.quotes.length, 0);
  assert.deepEqual(allFailed.failures.map(row => row.shop._id), [1, 2]);
  const unsupported = await compareGhnShopQuotes(createGhnQuoteSession(async () => [service(1, 1), service(-1, 2)]), [shop(2), shop(1)], snapshot);
  assert.deepEqual(unsupported.noServices.map(row => row._id), [1, 2]);
  assert.deepEqual(await compareGhnShopQuotes(createGhnQuoteSession(async () => { assert.fail('Empty list must not read'); }), [], snapshot), { quotes: [], failures: [], noServices: [] });
  pass('all-failed, no-service, empty-shops and malformed money fail closed');
}

// Two successive resets occur while the three initial slots are still occupied.
// Both matrix and selected-fee work must share those slots, and neither stale
// generation may start queued reads, publish prices, or populate the new cache.
{
  let active = 0, maxActive = 0;
  const executed = [], pending = [];
  const session = createGhnQuoteSession((action, body) => {
    active++; maxActive = Math.max(maxActive, active);
    executed.push(structuredClone({ action, body }));
    return new Promise(resolve => pending.push(() => {
      active--;
      resolve(action === 'get_services' ? [service(Number(body.shopId) * 10 + 2, 2), service(Number(body.shopId) * 10 + 5, 5)] : { total: Number(body.shopId) });
    }));
  });
  const oldToken = session.capture();
  const old = Promise.allSettled([compareGhnShopQuotes(session, [11, 12, 13, 14, 15, 16].map(shop), snapshot), session.quote('99', service(992, 2), snapshot)]);
  assert.equal(executed.length, 3);
  session.invalidate();
  assert.equal(session.current(oldToken), false);
  const middle = Promise.allSettled([compareGhnShopQuotes(session, [21, 22, 23, 24, 25, 26].map(shop), snapshot), session.quote('98', service(982, 2), snapshot)]);
  assert.equal(executed.length, 3);
  session.invalidate();
  const latest = Promise.all([compareGhnShopQuotes(session, [31, 32, 33, 34, 35, 36].map(shop), snapshot), session.quote('97', service(972, 2), snapshot)]);
  assert.equal(executed.length, 3);
  for (let rounds = 0; rounds < 30; rounds++) {
    pending.splice(0).forEach(resolve => resolve());
    await flush();
    if (!pending.length && active === 0) break;
  }
  const [oldResults, middleResults, [result, selected]] = await Promise.all([old, middle, latest]);
  for (const row of [...oldResults, ...middleResults]) assert.ok(row.status === 'rejected' && row.reason instanceof StaleGhnQuoteError);
  assert.equal(result.quotes.length, 12);
  assert.equal(selected, 97);
  assert.equal(maxActive, 3);
  assert.ok(executed.every(row => !['14', '15', '16', '21', '22', '23', '24', '25', '26', '98', '99'].includes(row.body.shopId)));
  assert.equal(session.peekQuote('99', service(992, 2), snapshot), undefined);
  assert.equal(session.peekQuote('97', service(972, 2), snapshot), 97);
  assert.equal(active, 0);
  pass('one max-3 scheduler across selected/matrix reads and three generations, stale queue/cache suppression');
}

{
  const calls = [];
  const session = createGhnQuoteSession(async (action, body) => { calls.push({ action, body }); return action === 'get_services' ? [service(1, 2)] : { total: 0 }; });
  const [a, b] = await Promise.all([session.services('1', 1444), session.services('1', 1444)]);
  assert.equal(a, b);
  await Promise.all([session.quote('1', a[0], snapshot), session.quote('1', a[0], snapshot)]);
  assert.equal(calls.length, 2);
  session.invalidate();
  await session.services('1', 1444);
  assert.equal(calls.length, 2);
  assert.equal(session.peekQuote('1', a[0], snapshot), undefined);
  await session.quote('1', a[0], snapshot);
  assert.equal(calls.length, 3);
  await session.services('1', 1445);
  assert.equal(calls.length, 4);
  session.invalidate(true);
  await session.services('1', 1444);
  assert.equal(calls.length, 5);
  pass('pending deduplication, parcel reset clears fee, route services cache, lifecycle clears services');
}

console.log('PASS 7 independent GHN quote groups (pure/synthetic only).');
