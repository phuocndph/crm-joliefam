// Pure/synthetic only: no credentials, database, HTTP or GHN provider.
import assert from 'node:assert/strict';
import { buildGhnQuoteSnapshot, compareGhnShopQuotes, createGhnQuoteSession, findGhnSelectedQuote, ghnServiceChoiceKey, validateGhnCreateItems, StaleGhnQuoteError } from '../src/lib/ghn-quote-comparison.ts';

const shops = [123, 456, 789].map(_id => ({ _id, name: `Shop thử ${_id}`, address: `Địa chỉ thử ${_id}`, district_id: _id + 1000 }));
const input = { provinceId: '202', districtId: '1444', wardCode: '020308', address: 'Địa chỉ tổng hợp', items: [{ name: 'Kiện thử', quantity: 2, weight: 1000, length: 10, width: 12, height: 15 }], cod: 180000, insurance: 200000 };
const snapshot = buildGhnQuoteSnapshot(input).snapshot;
assert.ok(snapshot);
assert.equal(snapshot.feeData.weight, 2000);
assert.equal(snapshot.feeData.height, 30);
assert.notEqual(snapshot.feeData.items[0], input.items[0]);
for (const change of [
  { cod: -1 }, { cod: 50000001 }, { cod: 1.5 }, { insurance: 5000001 }, { insurance: NaN }, { districtId: '' },
  { items: [{ ...input.items[0], weight: 0 }] }, { items: [{ ...input.items[0], quantity: 1.5 }] },
  { items: [{ ...input.items[0], weight: 30000 }] }, { items: [{ ...input.items[0], height: 101 }] },
  { items: [{ ...input.items[0], length: 201 }] },
]) assert.equal(buildGhnQuoteSnapshot({ ...input, ...change }).snapshot, null);
assert.ok(buildGhnQuoteSnapshot({ ...input, items: [{ ...input.items[0], quantity: 1, weight: 50000, height: 200 }] }).snapshot);
for (const name of ['', '   ', 'Tên đã đổi', 'x'.repeat(201)]) {
  const items = [{ ...input.items[0], name }], quote = buildGhnQuoteSnapshot({ ...input, items }).snapshot;
  assert.equal(quote?.key, snapshot.key, 'item names never affect quote identity');
  assert.equal(quote?.feeData.items[0].name, 'Sản phẩm 1', 'quote-only labels satisfy the fee adapter');
  assert.equal(items[0].name, name, 'raw create item name is untouched');
  assert.equal(Boolean(validateGhnCreateItems(items)), !name.trim() || name.length > 200);
}
assert.equal(validateGhnCreateItems(input.items), '');
const longContent = Array.from({ length: 11 }, () => ({ ...input.items[0], name: 'x'.repeat(200), quantity: 1, height: 1 }));
assert.ok(buildGhnQuoteSnapshot({ ...input, items: longContent }).snapshot, 'content length does not block a physical quote');
assert.match(validateGhnCreateItems(longContent), /2.000/);

const serviceRows = id => id === '789' ? [] : [
  { service_id: Number(id) * 10 + 2, service_type_id: 2, short_name: 'Loại 2' },
  { service_id: Number(id) * 10 + 2, service_type_id: 2, short_name: 'Trùng dịch vụ' },
  { service_id: Number(id) * 10 + 5, service_type_id: 5, short_name: 'Loại 5' },
  { service_id: Number(id) * 10 + 1, service_type_id: 1, short_name: 'Không hỗ trợ' },
];
const calls = [], price = { 1232: 11000, 1235: 12000, 4562: 9000, 4565: 8000 };
let inFlight = 0, maxInFlight = 0;
const session = createGhnQuoteSession(async (action, body) => {
  calls.push({ action, body: structuredClone(body) });
  inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
  await new Promise(resolve => setTimeout(resolve, 3));
  inFlight--;
  if (action === 'get_services') return serviceRows(body.shopId);
  assert.ok(serviceRows(body.shopId).some(row => row.service_id === body.feeData.service_id && row.service_type_id === body.feeData.service_type_id), 'service ID belongs to its shop');
  return { total: price[body.feeData.service_id], service_fee: body.shopId === '123' ? 1000 : 7000 };
});
const selectedServices = await session.services('123', 1444);
const [comparison, selectedTotal] = await Promise.all([
  compareGhnShopQuotes(session, shops, snapshot),
  session.quote('123', selectedServices[0], snapshot),
]);
assert.equal(selectedTotal, 11000);
assert.equal(comparison.quotes.length, 4, 'both available types are quoted at every shop');
assert.equal(comparison.quotes[0].shop._id, 456, 'rank total, not the cheaper base service fee');
assert.equal(comparison.quotes[0].service.service_id, 4565);
assert.deepEqual(comparison.noServices.map(row => row._id), [789]);
assert.equal(comparison.failures.length, 0);
assert.ok(maxInFlight <= 3);
const feeCalls = calls.filter(row => row.action === 'calculate_fee');
assert.equal(feeCalls.length, 4, 'selected quote and matrix share their pending cache');
for (const { body } of feeCalls) {
  const { service_id, service_type_id, ...parcel } = body.feeData;
  assert.ok([2, 5].includes(service_type_id)); assert.ok(service_id);
  assert.deepEqual(parcel, snapshot.feeData, 'every shop receives the exact same destination/parcel/COD/insurance');
}
const chosen = comparison.quotes[0], callsBeforeChoice = calls.length;
assert.equal(session.peekQuote(String(chosen.shop._id), chosen.service, snapshot), chosen.total);
assert.equal(await session.quote(String(chosen.shop._id), chosen.service, snapshot), 8000);
assert.equal(calls.length, callsBeforeChoice, 'choosing a comparison pair performs no extra API read');
assert.equal(session.peekQuote('123', chosen.service, snapshot), undefined, 'a different shop cannot reuse the service quote');

// GHN's contract identifies a service by ID + type, even if two types share an ID.
const sharedServices = [2, 5].map(service_type_id => ({ service_id: 53320, service_type_id, short_name: `Loại ${service_type_id}` }));
const sharedId = createGhnQuoteSession(async (action, body) => action === 'get_services' ? sharedServices : { total: body.feeData.service_type_id === 5 ? 17000 : 25000 });
const sharedResult = await compareGhnShopQuotes(sharedId, [shops[0]], snapshot);
assert.equal(sharedResult.quotes.length, 2);
const sharedChoice = ghnServiceChoiceKey(sharedResult.quotes[0].service);
assert.equal(sharedChoice, '53320:5');
assert.notEqual(sharedChoice, ghnServiceChoiceKey(sharedServices[0]));
const exactSelected = sharedResult.quotes[0].services.find(row => ghnServiceChoiceKey(row) === sharedChoice);
assert.equal(exactSelected.service_id, 53320); assert.equal(exactSelected.service_type_id, 5);
assert.equal(sharedId.peekQuote('123', exactSelected, snapshot), 17000, 'the second type selects its displayed total and exact numeric pair');
assert.equal(sharedId.peekQuote('123', sharedServices[0], snapshot), 25000, 'the first type retains a separate cached quote');
assert.equal(findGhnSelectedQuote(sharedResult, snapshot.key, '123', sharedServices[1])?.total, 17000);
assert.equal(findGhnSelectedQuote(sharedResult, snapshot.key, '123', sharedServices[0])?.total, 25000, 'promotion resolves the current type, including a changed selection');
assert.equal(findGhnSelectedQuote(sharedResult, snapshot.key, '456', sharedServices[1]), undefined);
assert.equal(findGhnSelectedQuote(sharedResult, 'old-context', '123', sharedServices[1]), undefined);
assert.equal(findGhnSelectedQuote(null, snapshot.key, '123', sharedServices[1]), undefined);
session.invalidate();
await session.services('123', 1444);
assert.equal(calls.filter(row => row.action === 'get_services' && row.body.shopId === '123').length, 1, 'successful route services survive parcel changes');
const heavy = buildGhnQuoteSnapshot({ ...input, items: [{ ...input.items[0], weight: 21000, quantity: 1 }] }).snapshot;
await session.quote('123', selectedServices[1], heavy);
assert.equal(calls.at(-1).body.feeData.service_type_id, 5, 'weight change keeps the explicitly chosen valid service');

let failed = true, retryReads = 0;
const partial = createGhnQuoteSession(async (action, body) => {
  if (action === 'get_services') return serviceRows(body.shopId);
  retryReads++;
  if (body.feeData.service_id === 4565 && failed) throw new Error('Lỗi thử tạm thời');
  return { total: 10000 };
});
const first = await compareGhnShopQuotes(partial, shops, snapshot);
assert.equal(first.quotes.length, 3); assert.equal(first.failures.length, 1);
assert.deepEqual(first.quotes.map(row => row.service.service_id), [1232, 1235, 4562], 'ties use numeric shop, type, then service ID');
failed = false;
const second = await compareGhnShopQuotes(partial, shops, snapshot);
assert.equal(second.quotes.length, 4); assert.equal(retryReads, 5, 'retry only repeats the failed fee read');
let refreshPrice = 10000, serviceReads = 0, refreshReads = 0;
const refresh = createGhnQuoteSession(async action => {
  if (action === 'get_services') { serviceReads++; return serviceRows('123'); }
  refreshReads++; return { total: refreshPrice };
});
const refreshServices = await refresh.services('123', 1444);
assert.equal(await refresh.quote('123', refreshServices[0], snapshot), 10000);
refreshPrice = 12000;
assert.equal(await refresh.quote('123', refreshServices[0], snapshot), 10000, 'automatic reads share the successful cache');
refresh.invalidate();
assert.equal(await refresh.quote('123', refreshServices[0], snapshot), 12000, 'explicit refresh invalidates a successful quote for the same payload');
assert.equal(await refresh.services('123', 1444), refreshServices);
assert.equal(serviceReads, 1, 'explicit quote refresh keeps the route service cache');
assert.equal(refreshReads, 2);
const allFail = await compareGhnShopQuotes(createGhnQuoteSession(async () => { throw new Error('Lỗi thử'); }), shops, snapshot);
assert.equal(allFail.quotes.length, 0); assert.equal(allFail.failures.length, 3);
const noServices = await compareGhnShopQuotes(createGhnQuoteSession(async () => []), shops, snapshot);
assert.equal(noServices.quotes.length, 0); assert.equal(noServices.noServices.length, 3);
assert.deepEqual(await compareGhnShopQuotes(createGhnQuoteSession(async () => []), [], snapshot), { quotes: [], failures: [], noServices: [] });

for (const total of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1000']) {
  const invalid = createGhnQuoteSession(async action => action === 'get_services' ? serviceRows('123') : { total });
  const result = await compareGhnShopQuotes(invalid, [shops[0]], snapshot);
  assert.equal(result.quotes.length, 0); assert.equal(result.failures.length, 2);
}
assert.equal(await createGhnQuoteSession(async () => ({ total: 0 })).quote('123', selectedServices[0], snapshot), 0);

// Invalidating an input cancels queued jobs; in-flight work occupies its slot
// until settled and cannot cache/publish a stale result in the new generation.
const pending = [];
let actualReads = 0;
const stale = createGhnQuoteSession(async () => { actualReads++; await new Promise(resolve => pending.push(resolve)); return []; });
const old = Array.from({ length: 8 }, (_, i) => stale.services(String(i + 1), 1444));
const settled = Promise.allSettled(old);
assert.equal(actualReads, 3);
stale.invalidate();
const next = stale.services('99', 1444);
assert.equal(actualReads, 3, 'new generation still shares the same three occupied slots');
pending.splice(0).forEach(resolve => resolve());
const oldResults = await settled;
assert.ok(oldResults.every(row => row.status === 'rejected' && row.reason instanceof StaleGhnQuoteError));
assert.equal(actualReads, 4, 'five cancelled queued jobs never reached the reader');
pending.splice(0).forEach(resolve => resolve());
await next;
stale.invalidate(true);
const reload = stale.services('99', 1444);
assert.equal(actualReads, 5, 'lifecycle reload clears successful service cache');
pending.splice(0).forEach(resolve => resolve()); await reload;

console.log('PASS GHN quote comparison: payload parity, services 2/5, total ranking/ties, validation, partial/retry/empty, shared bounded concurrency/cache and stale cancellation (synthetic only).');
