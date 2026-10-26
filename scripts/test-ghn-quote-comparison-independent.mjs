// Independent TEST-ONLY verification. No environment, network, DB or providers.
import assert from 'node:assert/strict';
import { buildGhnQuoteSnapshot, compareGhnShopQuotes, createGhnQuoteSession, eligibleGhnServices, findGhnAutomaticCheapest, findGhnSelectedQuote, parseGhnKilograms, StaleGhnQuoteError } from '../src/lib/ghn-quote-comparison.ts';

const pass = name => console.log(`PASS independent GHN quote: ${name}`);
const input = (parcel, extras = {}) => ({ provinceId: '202', districtId: '1444', wardCode: '020308', address: 'Independent destination', cod: 0, insurance: 0, parcel, ...extras });
const quote = (parcel, extras) => {
  const result = buildGhnQuoteSnapshot(input(parcel, extras)); assert.ok(result.snapshot, result.error); return result.snapshot;
};
const light = { service_id: 702, service_type_id: 2, short_name: 'Independent 2' };
const heavy = { service_id: 705, service_type_id: 5, short_name: 'Independent 5' };
const service = (service_id, service_type_id) => ({ service_id, service_type_id, short_name: `${service_type_id}/${service_id}` });
const shop = _id => ({ _id, name: `Shop ${_id}`, address: `Synthetic ${_id}`, district_id: _id + 100 });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

{
  const preliminary = quote({ weight: 1 });
  assert.equal(preliminary.kind, 'preliminary'); assert.equal('items' in preliminary.feeData, false);
  for (const dimensions of [{ length: 1 }, { width: 1 }, { height: 1 }, { length: 1, width: 1 }]) assert.equal(buildGhnQuoteSnapshot(input({ weight: 1, ...dimensions })).snapshot, null);
  for (const value of [1, 19999, 20000, 50000]) assert.ok(quote({ weight: value, length: 1, width: 1, height: 1 }));
  for (const raw of ['1,001', '19.999', '20', '40', '50']) assert.ok(parseGhnKilograms(raw));
  pass('preliminary versus final snapshots, strict all-or-none dimensions, kg boundaries');
}

// Snapshots must not retain references and their identity must cover every
// price-affecting measured value while product descriptions remain create-only.
{
  const source = input({ weight: 1200, length: 20, width: 30, height: 40 }, { items: [{ name: 'Product only', quantity: 3 }] });
  const original = buildGhnQuoteSnapshot(source).snapshot;
  assert.ok(original);
  const payload = structuredClone(original.feeData), key = original.key;
  source.parcel.weight = 999; source.items[0].name = 'Changed product name';
  assert.deepEqual(original.feeData, payload); assert.equal(original.key, key);
  for (const change of [
    { provinceId: '203' }, { districtId: '1445' }, { wardCode: '020309' }, { address: 'Other destination' }, { cod: 1 }, { insurance: 1 },
    { parcel: { weight: 1201, length: 20, width: 30, height: 40 } }, { parcel: { weight: 1200, length: 21, width: 30, height: 40 } },
    { parcel: { weight: 1200, length: 20, width: 31, height: 40 } }, { parcel: { weight: 1200, length: 20, width: 30, height: 41 } },
  ]) assert.notEqual(buildGhnQuoteSnapshot({ ...input({ weight: 1200, length: 20, width: 30, height: 40 }), ...change }).snapshot?.key, key);
  assert.equal(buildGhnQuoteSnapshot(input({ weight: 1200, length: 20, width: 30, height: 40 }, { items: [{ name: 'Renamed', quantity: 999 }] })).snapshot?.key, key);
  for (const bad of [
    { provinceId: 'Infinity' }, { districtId: '1.5' }, { wardCode: '' }, { address: '   ' }, { cod: -1 }, { cod: 50000001 }, { cod: 1.5 }, { insurance: -1 }, { insurance: 5000001 },
    { parcel: { weight: 0, length: 20, width: 30, height: 40 } }, { parcel: { weight: 50001, length: 20, width: 30, height: 40 } }, { parcel: { weight: 1200, length: 201, width: 30, height: 40 } },
  ]) assert.equal(buildGhnQuoteSnapshot({ ...input({ weight: 1200, length: 20, width: 30, height: 40 }), ...bad }).snapshot, null, JSON.stringify(bad));
  pass('detached snapshot, complete measured-parcel fingerprint, money/route boundaries and create-only product rows');
}

{
  const services = [light, heavy, { ...heavy }, { service_id: 1, service_type_id: 1, short_name: 'Unsupported' }];
  assert.deepEqual(eligibleGhnServices(services, 19999).map(row => row.service_type_id), [2]);
  assert.deepEqual(eligibleGhnServices(services, 20000).map(row => row.service_type_id), [5, 5]);
  const final = quote({ weight: 40000, length: 11, width: 12, height: 13 });
  const calls = [];
  const session = createGhnQuoteSession(async (action, body) => {
    if (action === 'get_services') return services;
    calls.push(body.feeData); return { total: body.feeData.items[0].weight * 4 + Number(body.shopId) };
  });
  const result = await compareGhnShopQuotes(session, [shop(7), shop(42)], final);
  assert.deepEqual(result.quotes.map(row => [row.shop._id, row.service.service_type_id, row.total]), [[7, 5, 160007], [42, 5, 160042]]);
  assert.equal(calls.length, 2); assert.equal(calls.every(body => body.items.length === 1 && body.items[0].weight === 40000), true);
  assert.equal(findGhnAutomaticCheapest(result, final.key)?.shop._id, 7);
  assert.equal(findGhnSelectedQuote(result, final.key, '42', heavy)?.total, 160042);
  pass('comparison de-duplicates, filters types, ranks canonical-item prices and keeps exact selection');
}

{
  const final = quote({ weight: 20000, length: 1, width: 1, height: 1 });
  const session = createGhnQuoteSession(async action => action === 'get_services' ? [heavy] : { total: 80000 });
  await assert.rejects(session.quote('7', light, final), /không phù hợp/);
  assert.equal(await session.quote('7', heavy, final), 80000);
  const invalidTotals = createGhnQuoteSession(async action => action === 'get_services' ? [heavy] : { total: -1 });
  const failed = await compareGhnShopQuotes(invalidTotals, [shop(7)], final);
  assert.equal(failed.quotes.length, 0); assert.equal(failed.failures.length, 1);
  pass('wrong service boundary and malformed fee totals fail closed');
}

// Scramble shops and services. A light parcel permits type 2 only; quote ranking
// still follows safe integer total, then shop/type/id, including zero and ties.
{
  const value = quote({ weight: 1200, length: 20, width: 30, height: 40 });
  const shops = [shop(91), shop(7), shop(42), shop(15)];
  const totals = { 9102: 300, 702: 0, 4202: Number.MAX_SAFE_INTEGER, 1502: 300 };
  const calls = [];
  const session = createGhnQuoteSession(async (action, body) => {
    calls.push(structuredClone({ action, body })); await Promise.resolve();
    if (action === 'get_services') {
      const id = Number(body.shopId);
      return [service(id * 100 + 5, 5), service(id * 100 + 2, 2), service(id * 100 + 2, 2), service(0, 2), service(1.5, 2), service(Number.MAX_SAFE_INTEGER + 1, 5), service(999, 1)];
    }
    const { service_id, service_type_id, ...payload } = body.feeData;
    assert.equal(service_type_id, 2); assert.deepEqual(payload, value.feeData); return { total: totals[service_id], service_fee: 999999 };
  });
  const result = await compareGhnShopQuotes(session, shops, value);
  assert.deepEqual(result.quotes.map(row => [row.shop._id, row.service.service_type_id, row.service.service_id, row.total]), [
    [7, 2, 702, 0], [15, 2, 1502, 300], [91, 2, 9102, 300], [42, 2, 4202, Number.MAX_SAFE_INTEGER],
  ]);
  assert.equal(result.failures.length, 0); assert.equal(calls.filter(row => row.action === 'calculate_fee').length, 4);
  assert.equal(session.peekQuote('7', { service_id: 702, service_type_id: 2, short_name: 'x' }, value), 0);
  assert.equal(session.peekQuote('7', { service_id: 702, service_type_id: 5, short_name: 'x' }, value), undefined);
  const before = calls.length; await compareGhnShopQuotes(session, [...shops].reverse(), value); assert.equal(calls.length, before);
  pass('valid light-class pair matrix, invalid service IDs, total ranking, zero/safe-int/ties and cache');
}

// Partial failures must isolate to the applicable service and only failed reads
// retry. One light type is expected per eligible shop under the new rule.
{
  const value = quote({ weight: 1000, length: 1, width: 1, height: 1 }), calls = new Map(); let retry = false;
  const session = createGhnQuoteSession(async (action, body) => {
    const key = `${action}:${body.shopId}:${body.feeData?.service_id || ''}`; calls.set(key, (calls.get(key) || 0) + 1);
    if (action === 'get_services') {
      if (body.shopId === '30' && !retry) throw new Error('temporary service');
      if (body.shopId === '40') return [];
      if (body.shopId === '50' && !retry) return null;
      return [ { service_id: Number(body.shopId) * 10 + 2, service_type_id: 2, short_name: 'Light' }, { service_id: Number(body.shopId) * 10 + 5, service_type_id: 5, short_name: 'Heavy' } ];
    }
    if (body.feeData.service_id === 202 && !retry) return { total: 1.5 };
    return { total: Number(body.shopId) };
  });
  const stores = [10, 20, 30, 40, 50].map(shop), first = await compareGhnShopQuotes(session, stores, value);
  assert.equal(first.quotes.length, 1); assert.equal(first.failures.length, 3); assert.deepEqual(first.noServices.map(row => row._id), [40]);
  retry = true; const second = await compareGhnShopQuotes(session, stores, value);
  assert.equal(second.quotes.length, 4); assert.equal(second.failures.length, 0); assert.deepEqual(second.noServices.map(row => row._id), [40]);
  for (const id of ['10', '20', '40']) assert.equal(calls.get(`get_services:${id}:`), 1);
  for (const id of ['30', '50']) assert.equal(calls.get(`get_services:${id}:`), 2);
  assert.equal(calls.get('calculate_fee:10:102'), 1); assert.equal(calls.get('calculate_fee:20:202'), 2);
  pass('partial malformed/failed services and money isolate; successes cache and only failures retry');
}

{
  const value = quote({ weight: 1000, length: 1, width: 1, height: 1 });
  for (const response of [undefined, null, {}, { total: undefined }, { total: null }, { total: true }, { total: '0' }, { total: -1 }, { total: 0.1 }, { total: NaN }, { total: Infinity }, { total: -Infinity }, { total: Number.MAX_SAFE_INTEGER + 1 }]) {
    const session = createGhnQuoteSession(async action => action === 'get_services' ? [light, heavy] : response);
    const result = await compareGhnShopQuotes(session, [shop(1)], value);
    assert.equal(result.quotes.length, 0, String(response)); assert.equal(result.failures.length, 1);
  }
  const allFailed = await compareGhnShopQuotes(createGhnQuoteSession(async () => { throw new Error('all unavailable'); }), [shop(2), shop(1)], value);
  assert.equal(allFailed.quotes.length, 0); assert.deepEqual(allFailed.failures.map(row => row.shop._id), [1, 2]);
  const unsupported = await compareGhnShopQuotes(createGhnQuoteSession(async () => [{ service_id: 1, service_type_id: 1, short_name: 'No' }, { service_id: -1, service_type_id: 2, short_name: 'Bad' }]), [shop(2), shop(1)], value);
  assert.deepEqual(unsupported.noServices.map(row => row._id), [1, 2]);
  assert.deepEqual(await compareGhnShopQuotes(createGhnQuoteSession(async () => { assert.fail('empty shops do not read'); }), [], value), { quotes: [], failures: [], noServices: [] });
  pass('all-failed, no-service, empty-shop and malformed-money values fail closed');
}

{
  const final = quote({ weight: 20000, length: 1, width: 1, height: 1 }), pending = [];
  const session = createGhnQuoteSession(async action => action === 'get_services' ? [heavy] : new Promise(resolve => pending.push(resolve)));
  const stale = assert.rejects(session.quote('7', heavy, final), StaleGhnQuoteError);
  session.invalidate();
  const current = session.quote('7', heavy, final);
  pending.shift()({ total: 80000 }); await stale;
  pending.shift()({ total: 81000 }); assert.equal(await current, 81000);
  pass('generation cancellation prevents stale pending quote from becoming cache');
}

// The scheduler is shared between comparison and explicitly selected quote.
// In-flight jobs occupy all three slots through two invalidations; stale queued
// jobs must never execute, cache, or publish in the latest generation.
{
  const value = quote({ weight: 1000, length: 1, width: 1, height: 1 });
  let active = 0, maxActive = 0; const executed = [], pending = [];
  const session = createGhnQuoteSession((action, body) => {
    active++; maxActive = Math.max(maxActive, active); executed.push(structuredClone({ action, body }));
    return new Promise(resolve => pending.push(() => { active--; resolve(action === 'get_services' ? [{ service_id: Number(body.shopId) * 10 + 2, service_type_id: 2, short_name: 'Light' }] : { total: Number(body.shopId) }); }));
  });
  const oldToken = session.capture();
  const old = Promise.allSettled([compareGhnShopQuotes(session, [11, 12, 13, 14, 15, 16].map(shop), value), session.quote('99', { service_id: 992, service_type_id: 2, short_name: 'Light' }, value)]);
  assert.equal(executed.length, 3); session.invalidate(); assert.equal(session.current(oldToken), false);
  const middle = Promise.allSettled([compareGhnShopQuotes(session, [21, 22, 23, 24, 25, 26].map(shop), value), session.quote('98', { service_id: 982, service_type_id: 2, short_name: 'Light' }, value)]);
  assert.equal(executed.length, 3); session.invalidate();
  const latest = Promise.all([compareGhnShopQuotes(session, [31, 32, 33, 34, 35, 36].map(shop), value), session.quote('97', { service_id: 972, service_type_id: 2, short_name: 'Light' }, value)]);
  for (let rounds = 0; rounds < 30; rounds++) { pending.splice(0).forEach(resolve => resolve()); await flush(); if (!pending.length && active === 0) break; }
  const [oldResults, middleResults, [result, selected]] = await Promise.all([old, middle, latest]);
  for (const row of [...oldResults, ...middleResults]) assert.ok(row.status === 'rejected' && row.reason instanceof StaleGhnQuoteError);
  assert.equal(result.quotes.length, 6); assert.equal(selected, 97); assert.equal(maxActive, 3);
  assert.ok(executed.every(row => !['14', '15', '16', '21', '22', '23', '24', '25', '26', '98', '99'].includes(row.body.shopId)));
  assert.equal(session.peekQuote('99', { service_id: 992, service_type_id: 2, short_name: 'Light' }, value), undefined);
  assert.equal(session.peekQuote('97', { service_id: 972, service_type_id: 2, short_name: 'Light' }, value), 97); assert.equal(active, 0);
  pass('one max-3 scheduler across selected/matrix reads and generations; stale queue/cache suppression');
}

{
  const value = quote({ weight: 1000, length: 1, width: 1, height: 1 }), calls = [];
  const session = createGhnQuoteSession(async (action, body) => { calls.push({ action, body }); return action === 'get_services' ? [light] : { total: 0 }; });
  const [a, b] = await Promise.all([session.services('1', 1444), session.services('1', 1444)]); assert.equal(a, b);
  await Promise.all([session.quote('1', a[0], value), session.quote('1', a[0], value)]); assert.equal(calls.length, 2);
  session.invalidate(); await session.services('1', 1444); assert.equal(calls.length, 2); assert.equal(session.peekQuote('1', a[0], value), undefined);
  await session.quote('1', a[0], value); assert.equal(calls.length, 3); await session.services('1', 1445); assert.equal(calls.length, 4);
  session.invalidate(true); await session.services('1', 1444); assert.equal(calls.length, 5);
  pass('pending deduplication, parcel reset clears fees, route cache survives then lifecycle clears services');
}

console.log('PASS 10 independent GHN quote groups (synthetic only).');
