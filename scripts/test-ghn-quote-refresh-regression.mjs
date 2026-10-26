// TEST-ONLY: injected transport and pure session; no environment, DB or GHN.
import assert from 'node:assert/strict';
import { ExternalReadAdapters } from '../server/external-read-adapters.ts';
import { buildGhnPackedContent, buildGhnQuoteSnapshot, compareGhnShopQuotes, createGhnQuoteSession, findGhnSelectedQuote, StaleGhnQuoteError, validateGhnCreateItems } from '../src/lib/ghn-quote-comparison.ts';

const pass = name => console.log(`PASS GHN refresh regression: ${name}`);
const route = { provinceId: '202', districtId: '1444', wardCode: '020308', address: 'Synthetic address', cod: 0, insurance: 0 };
const snapshot = (parcel, extras = {}) => {
  const result = buildGhnQuoteSnapshot({ ...route, parcel, ...extras });
  assert.ok(result.snapshot, result.error); return result.snapshot;
};
const service = (id, type = 5) => ({ service_id: id, service_type_id: type, short_name: `Synthetic ${type}/${id}` });
const shop = { _id: 123, name: 'Synthetic shop', address: 'Synthetic pickup', district_id: 1452 };

// Product text is create-only. The exact parser and UI label contract must
// accept every valid name/content boundary without changing a quote snapshot.
{
  for (const [name, accepted] of [
    ['', false], [' \t\n ', false], ['x'.repeat(200), true], ['x'.repeat(201), false],
    ['  ' + 'x'.repeat(200) + '  ', true], ['  ' + 'x'.repeat(201) + '  ', false],
  ]) assert.equal(validateGhnCreateItems([{ name, quantity: 1 }]) === '', accepted, name.length);
  const exact = [...Array.from({ length: 9 }, () => ({ name: 'x'.repeat(200), quantity: 1 })), { name: 'y'.repeat(142), quantity: 1 }];
  assert.equal(buildGhnPackedContent(exact).length, 2000);
  assert.equal(validateGhnCreateItems(exact), '');
  const beyond = exact.map(row => ({ ...row })); beyond.at(-1).name += 'y';
  assert.equal(buildGhnPackedContent(beyond).length, 2001); assert.match(validateGhnCreateItems(beyond), /2.000/);
  const padded = exact.map(row => ({ ...row })); padded[0].name = `  ${padded[0].name}`; padded.at(-1).name += '  ';
  assert.equal(validateGhnCreateItems(padded), '');
  const many = Array.from({ length: 100 }, () => ({ name: 'x', quantity: 1 }));
  assert.equal(validateGhnCreateItems(many), ''); assert.match(validateGhnCreateItems([...many, { name: 'x', quantity: 1 }]), /100/);
  const base = snapshot({ weight: 20000, length: 10, width: 20, height: 30 }, { items: [{ name: '', quantity: 1 }] });
  assert.equal(snapshot({ weight: 20000, length: 10, width: 20, height: 30 }, { items: [{ name: 'Different product', quantity: 999 }] }).key, base.key);
  pass('trimmed 200-name, exact 2000-content/2001 failure, 100/101 product limits, and create-only product text');
}

// Snapshot identity includes every route/financial/measured field. It must
// detach its canonical parcel from caller mutations and never fingerprint text.
{
  const base = snapshot({ weight: 20000, length: 10, width: 20, height: 30 });
  const source = { ...route, parcel: { weight: 20000, length: 10, width: 20, height: 30 } };
  const made = buildGhnQuoteSnapshot(source).snapshot, before = structuredClone(made.feeData);
  source.parcel.weight = 40000; assert.deepEqual(made.feeData, before);
  for (const change of [
    { provinceId: '203' }, { districtId: '1445' }, { wardCode: '020309' }, { address: 'Other destination' }, { cod: 1 }, { insurance: 1 },
    { parcel: { weight: 20001, length: 10, width: 20, height: 30 } }, { parcel: { weight: 20000, length: 11, width: 20, height: 30 } },
    { parcel: { weight: 20000, length: 10, width: 21, height: 30 } }, { parcel: { weight: 20000, length: 10, width: 20, height: 31 } },
  ]) assert.notEqual(buildGhnQuoteSnapshot({ ...route, parcel: { weight: 20000, length: 10, width: 20, height: 30 }, ...change }).snapshot?.key, base.key, JSON.stringify(change));
  pass('complete fingerprint changes for route/COD/insurance/all measured fields and detached canonical parcel');
}

// Exercise the actual server fee adapter. Final quotes have one canonical
// parcel; preliminary quotes omit all dimensions/items and reject no fake rate.
{
  const payloads = [];
  const adapter = new ExternalReadAdapters({}, async (rawUrl, init) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/v2/shop/all')) return new Response(JSON.stringify({ code: 200, data: { shops: [{ _id: 123, name: 'Synthetic', district_id: 1452, status: 1 }], last_offset: 0 } }));
    assert.ok(url.pathname.endsWith('/v2/shipping-order/fee')); payloads.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ code: 200, data: { total: 12345 } }));
  }, async () => ({ token: 'synthetic-only-key', primaryShop: '123', shops: ['123'], configured: true, source: 'saved', mode: 'ENABLED', revision: 1, hasSavedKey: true }));
  const preliminary = snapshot({ weight: 19999 });
  await adapter.ghn({ action: 'calculate_fee', shopId: '123', feeData: { ...preliminary.feeData, service_id: 2, service_type_id: 2 } });
  assert.equal('items' in payloads[0], false); assert.equal('length' in payloads[0], false); assert.equal('width' in payloads[0], false); assert.equal('height' in payloads[0], false);
  const final = snapshot({ weight: 20000, length: 10, width: 20, height: 30 });
  await adapter.ghn({ action: 'calculate_fee', shopId: '123', feeData: { ...final.feeData, service_id: 5, service_type_id: 5 } });
  assert.deepEqual(payloads[1].items, final.feeData.items); assert.equal(payloads[1].items[0].weight, 20000); assert.equal(payloads[1].from_district_id, 1452);
  for (const feeData of [
    { ...final.feeData, service_id: 2, service_type_id: 2 },
    { ...final.feeData, service_id: 5, service_type_id: 5, items: [{ ...final.feeData.items[0], weight: 1 }] },
    { ...final.feeData, service_id: 5, service_type_id: 5, items: undefined },
    { ...preliminary.feeData, service_id: 2 },
  ]) await assert.rejects(adapter.ghn({ action: 'calculate_fee', shopId: '123', feeData }));
  pass('actual fee adapter preserves preliminary omission and enforces final canonical parcel/service data');
}

// A failed selected fee is repaired by a completed comparison without a third
// selected read. Use two type-5 IDs because the 20 kg parcel permits type 5.
{
  const value = snapshot({ weight: 20000, length: 1, width: 1, height: 1 });
  const services = [service(51), service(52)]; let first = true, reads = 0;
  const session = createGhnQuoteSession(async (action, body) => {
    if (action === 'get_services') return services;
    reads++; if (first && body.feeData.service_id === 51) { first = false; throw new Error('selected failure'); }
    return { total: body.feeData.service_id === 51 ? 17000 : 25000 };
  });
  const available = await session.services('123', 1444);
  await assert.rejects(session.quote('123', available[0], value), /selected failure/);
  const comparison = await compareGhnShopQuotes(session, [shop], value);
  assert.equal(reads, 3); assert.equal(findGhnSelectedQuote(comparison, value.key, '123', available[0])?.total, 17000);
  assert.equal(await session.quote('123', available[0], value), 17000); assert.equal(reads, 3);
  assert.equal(findGhnSelectedQuote(comparison, value.key, '999', available[0]), undefined);
  assert.equal(findGhnSelectedQuote(comparison, value.key, '123', { ...available[0], service_type_id: 2 }), undefined);
  const changed = snapshot({ weight: 40000, length: 1, width: 1, height: 1 });
  assert.equal(findGhnSelectedQuote(comparison, changed.key, '123', available[0]), undefined);
  pass('failed selected fee is repaired by successful same-class matrix with exact shop/ID/type/current-snapshot checks');
}

// 20→40 must price canonical `items[0]`, not a stale outer field.
{
  const old = snapshot({ weight: 20000, length: 10, width: 20, height: 30 });
  const changed = snapshot({ weight: 40000, length: 10, width: 20, height: 30 }); const calls = [];
  const session = createGhnQuoteSession(async (action, body) => action === 'get_services' ? [service(5)] : (calls.push(body.feeData), { total: body.feeData.items[0].weight * 4 }));
  assert.equal((await compareGhnShopQuotes(session, [shop], old)).quotes[0].total, 80000);
  assert.equal((await compareGhnShopQuotes(session, [shop], changed)).quotes[0].total, 160000);
  assert.equal(calls[1].weight, 40000); assert.equal(calls[1].items[0].weight, 40000);
  pass('20 to 40 kg reads fresh canonical item weight at synthetic 80,000 to 160,000');
}

// Explicit refresh discards cached/pending quotes, keeps route service cache,
// and refuses the stale value. Product text alone reuses the physical snapshot.
{
  const value = snapshot({ weight: 20000, length: 1, width: 1, height: 1 }, { items: [{ name: 'Old content', quantity: 1 }] });
  const pending = []; let price = 80000, serviceReads = 0, feeReads = 0;
  const session = createGhnQuoteSession(async action => {
    if (action === 'get_services') { serviceReads++; return [service(5)]; }
    feeReads++; const captured = price; return new Promise(resolve => pending.push(() => resolve({ total: captured })));
  });
  const available = await session.services('123', 1444);
  const old = session.quote('123', available[0], value); const stale = assert.rejects(old, StaleGhnQuoteError);
  session.invalidate(); price = 81000; assert.equal(await session.services('123', 1444), available);
  const fresh = session.quote('123', available[0], value); pending.shift()(); await stale; assert.equal(session.peekQuote('123', available[0], value), undefined);
  pending.shift()(); assert.equal(await fresh, 81000); assert.equal(session.peekQuote('123', available[0], value), 81000);
  assert.equal(await session.quote('123', available[0], snapshot({ weight: 20000, length: 1, width: 1, height: 1 }, { items: [{ name: 'Changed create text', quantity: 99 }] })), 81000);
  session.invalidate(); price = 82000; const refresh = session.quote('123', available[0], value); pending.shift()(); assert.equal(await refresh, 82000);
  assert.equal(serviceReads, 1); assert.equal(feeReads, 3);
  pass('same-payload refresh, pending suppression, product-text reuse and route-service cache');
}

console.log('PASS 6 GHN refresh regression groups (synthetic only).');
