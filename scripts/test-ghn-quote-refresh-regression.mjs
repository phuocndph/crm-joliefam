// TEST-ONLY: pure data and injected transport. No environment, network, DB or UI.
import assert from 'node:assert/strict';
import { buildGhnQuoteSnapshot, compareGhnShopQuotes, createGhnQuoteSession, findGhnSelectedQuote, StaleGhnQuoteError, validateGhnCreateItems } from '../src/lib/ghn-quote-comparison.ts';
import { ExternalReadAdapters } from '../server/external-read-adapters.ts';

const item = name => ({ name, quantity: 1, weight: 1, length: 1, width: 1, height: 1 });
const input = items => ({ provinceId: '202', districtId: '1444', wardCode: '020308', address: 'Synthetic address', items, cod: 0, insurance: 0 });
const snapshot = items => {
  const result = buildGhnQuoteSnapshot(input(items));
  assert.ok(result.snapshot, result.error);
  return result.snapshot;
};
const shop = { _id: 123, name: 'Synthetic shop', address: 'Synthetic pickup', district_id: 1452 };
const services = [2, 5].map(service_type_id => ({ service_id: 53320, service_type_id, short_name: `Synthetic ${service_type_id}` }));
const pass = message => console.log(`PASS GHN refresh regression: ${message}`);

// The create contract trims each name and the combined content. The quote
// remains available at either side of every create-only boundary.
{
  for (const [name, accepted] of [
    ['', false], [' \t\n ', false], ['x'.repeat(200), true], ['x'.repeat(201), false],
    ['  ' + 'x'.repeat(200) + '  ', true], ['  ' + 'x'.repeat(201) + '  ', false],
  ]) {
    const rows = [item(name)];
    assert.equal(validateGhnCreateItems(rows) === '', accepted);
    assert.deepEqual(snapshot(rows), snapshot([item('Other name')]));
    assert.equal(rows[0].name, name);
  }
  // Nine separators consume 18 characters: 9*200 + 182 + 18 = 2000.
  const exact = [...Array.from({ length: 9 }, () => item('x'.repeat(200))), item('y'.repeat(182))];
  assert.equal(exact.map(row => row.name).join(', ').length, 2000);
  assert.equal(validateGhnCreateItems(exact), '');
  const beyond = exact.map(row => ({ ...row }));
  beyond.at(-1).name += 'y';
  assert.match(validateGhnCreateItems(beyond), /2.000/);
  assert.equal(snapshot(exact).key, snapshot(beyond).key);
  const padded = exact.map(row => ({ ...row }));
  padded[0].name = '  ' + padded[0].name;
  padded.at(-1).name += '  ';
  assert.equal(validateGhnCreateItems(padded), '');
  const many = Array.from({ length: 100 }, () => item('x'));
  assert.equal(validateGhnCreateItems(many), '');
  assert.equal(snapshot(many).feeData.items.at(-1).name, 'Sản phẩm 100');
  assert.notEqual(validateGhnCreateItems([...many, item('x')]), '');
  assert.equal(buildGhnQuoteSnapshot(input([...many, item('x')])).snapshot, null);
  pass('trimmed 200-name / 2000-content boundaries and 100-item ceiling; quote identity stays name-independent');
}

// Exercise the actual server fee adapter with an injected fetcher. Arbitrary
// operator names must never reach its strict fee-item name boundary.
{
  const payloads = [];
  const adapter = new ExternalReadAdapters({}, async (rawUrl, init) => {
    const url = new URL(rawUrl);
    let data;
    if (url.pathname.endsWith('/v2/shop/all')) {
      data = { shops: [{ _id: 123, name: 'Synthetic shop', district_id: 1452, status: 1 }], last_offset: 0 };
    } else if (url.pathname.endsWith('/v2/shipping-order/fee')) {
      payloads.push(JSON.parse(init.body));
      data = { total: 12345 };
    } else assert.fail(`Unexpected synthetic endpoint ${url.pathname}`);
    return new Response(JSON.stringify({ code: 200, data }), { headers: { 'Content-Type': 'application/json' } });
  }, async () => ({ token: 'synthetic-only-key', primaryShop: '123', shops: ['123'], configured: true, source: 'saved', mode: 'ENABLED', revision: 1, hasSavedKey: true }));
  const rawItems = [item(''), item(' \n '), item('x'.repeat(201))];
  const value = snapshot(rawItems);
  const response = await adapter.ghn({ action: 'calculate_fee', shopId: '123', feeData: { ...value.feeData, service_id: 53320, service_type_id: 5 } });
  assert.equal(response.success, true);
  assert.equal(response.data.total, 12345);
  assert.equal(payloads.length, 1);
  assert.deepEqual(payloads[0].items.map(row => row.name), ['Sản phẩm 1', 'Sản phẩm 2', 'Sản phẩm 3']);
  assert.equal(payloads[0].from_district_id, 1452);
  assert.equal(payloads[0].service_type_id, 5);
  assert.deepEqual(rawItems.map(row => row.name), ['', ' \n ', 'x'.repeat(201)]);
  pass('generic quote labels survive actual injected fee adapter; original create names are untouched');
}

// A successful matrix can recover the failed selected fee without a second
// fee read, and resolving it against a different current type uses that type.
{
  const value = snapshot([item('')]);
  let first = true, feeReads = 0;
  const session = createGhnQuoteSession(async (action, body) => {
    if (action === 'get_services') return services;
    feeReads++;
    if (first) { first = false; throw new Error('Synthetic selected-fee failure'); }
    return { total: body.feeData.service_type_id === 5 ? 17000 : 25000 };
  });
  const available = await session.services('123', 1444);
  await assert.rejects(session.quote('123', available[0], value), /selected-fee failure/);
  assert.equal(session.peekQuote('123', available[0], value), undefined);
  const comparison = await compareGhnShopQuotes(session, [shop], value);
  assert.equal(feeReads, 3);
  for (const [current, total] of [[available[0], 25000], [available[1], 17000]]) {
    assert.equal(findGhnSelectedQuote(comparison, value.key, '123', current)?.total, total);
    assert.equal(await session.quote('123', current, value), total);
  }
  assert.equal(feeReads, 3);
  assert.equal(findGhnSelectedQuote(comparison, value.key, '456', available[0]), undefined);
  assert.equal(findGhnSelectedQuote(comparison, snapshot([item('new name')]).key, '123', available[1])?.total, 17000);
  const changed = buildGhnQuoteSnapshot({ ...input([item('')]), cod: 1 }).snapshot;
  assert.equal(findGhnSelectedQuote(comparison, changed.key, '123', available[0]), undefined);
  pass('failed selected-fee recovery, exact current ID/type/shop, name-only reuse and changed-parcel rejection');
}

// Explicit refresh of identical input discards both cached and pending quotes,
// preserves route services, and cannot receive the prior generation's price.
{
  const value = snapshot([item('')]);
  const pending = [];
  let price = 10000, serviceReads = 0, feeReads = 0;
  const session = createGhnQuoteSession(async action => {
    if (action === 'get_services') { serviceReads++; return services; }
    feeReads++;
    const capturedPrice = price;
    return new Promise(resolve => pending.push(() => resolve({ total: capturedPrice })));
  });
  const available = await session.services('123', 1444);
  const oldPromise = session.quote('123', available[1], value);
  const staleResult = assert.rejects(oldPromise, StaleGhnQuoteError);
  session.invalidate();
  price = 11000;
  assert.equal(await session.services('123', 1444), available);
  const freshPromise = session.quote('123', available[1], value);
  pending.shift()();
  await staleResult;
  assert.equal(session.peekQuote('123', available[1], value), undefined);
  pending.shift()();
  assert.equal(await freshPromise, 11000);
  assert.equal(session.peekQuote('123', available[1], value), 11000);
  price = 12000;
  assert.equal(await session.quote('123', available[1], snapshot([item('changed create name')])), 11000);
  session.invalidate();
  const refreshed = session.quote('123', available[1], value);
  pending.shift()();
  assert.equal(await refreshed, 12000);
  assert.equal(serviceReads, 1);
  assert.equal(feeReads, 3);
  pass('same-payload refresh obtains new price, retains route cache and suppresses stale pending result');
}

console.log('PASS 4 GHN refresh regression groups (synthetic only).');
