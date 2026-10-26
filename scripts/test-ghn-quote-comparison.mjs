// TEST-ONLY. Pure/synthetic: no credentials, database, HTTP or GHN provider.
import assert from 'node:assert/strict';
import {
  GHN_PACKED_PARCEL_NAME, buildGhnPackedContent, buildGhnPackedParcelItemName,
  buildGhnQuoteSnapshot, compareGhnShopQuotes, createGhnQuoteSession,
  eligibleGhnServices, findGhnAutomaticCheapest, findGhnSelectedQuote,
  ghnServiceChoiceKey, isGhnServiceEligible, parseGhnKilograms,
  StaleGhnQuoteError, validateGhnCreateItems,
} from '../src/lib/ghn-quote-comparison.ts';

const pass = name => console.log(`PASS GHN quote comparison: ${name}`);
const services = [
  { service_id: 12, service_type_id: 2, short_name: 'Synthetic type 2' },
  { service_id: 15, service_type_id: 5, short_name: 'Synthetic type 5' },
];
const route = { provinceId: '202', districtId: '1444', wardCode: '020308', address: 'Synthetic address', cod: 180000, insurance: 200000 };
const final = (weight, dimensions = { length: 10, width: 20, height: 30 }) => {
  const result = buildGhnQuoteSnapshot({ ...route, parcel: { weight, ...dimensions } });
  assert.ok(result.snapshot, result.error);
  return result.snapshot;
};

{
  for (const [entry, grams] of [['0,001', 1], ['19.999', 19999], ['20', 20000], ['40', 40000], ['50', 50000]]) assert.equal(parseGhnKilograms(entry), grams, entry);
  for (const entry of ['', '  ', '-1', '0', '1e3', 'NaN', '50.001', '1.0001']) assert.equal(parseGhnKilograms(entry), null, entry);
  pass('Vietnamese kg parser is exact to grams and rejects malformed/out-of-range values');
}

{
  const preliminary = buildGhnQuoteSnapshot({ ...route, parcel: { weight: 20000 } });
  assert.equal(preliminary.error, ''); assert.equal(preliminary.snapshot?.kind, 'preliminary');
  assert.deepEqual(preliminary.snapshot?.feeData, { to_district_id: 1444, to_ward_code: '020308', weight: 20000, cod_value: 180000, insurance_value: 200000 });
  assert.equal(buildGhnQuoteSnapshot({ ...route, parcel: { weight: 20000, length: 10 } }).snapshot, null, 'partial dimensions never send a partial quote');
  const quote = final(40000);
  assert.equal(quote.kind, 'final');
  assert.deepEqual(quote.feeData.items, [{ name: GHN_PACKED_PARCEL_NAME, quantity: 1, weight: 40000, length: 10, width: 20, height: 30 }]);
  assert.equal(quote.feeData.weight, quote.feeData.items[0].weight);
  pass('weight-only quote omits dimensions/items; final quote uses one canonical measured parcel');
}

{
  const productLines = [{ name: 'Áo thử', quantity: 2 }, { name: 'Quần thử', quantity: 1 }];
  assert.equal(validateGhnCreateItems(productLines), '');
  assert.equal(buildGhnPackedContent(productLines), 'Áo thử × 2, Quần thử × 1');
  assert.equal(buildGhnPackedParcelItemName(productLines), 'Áo thử × 2, Quần thử × 1');
  const long = [{ name: 'x'.repeat(200), quantity: 1 }, { name: 'y'.repeat(200), quantity: 1 }];
  assert.equal(buildGhnPackedParcelItemName(long).length, 200);
  assert.match(buildGhnPackedParcelItemName(long), /…$/);
  assert.match(validateGhnCreateItems([{ name: '', quantity: 1 }]), /tên/);
  assert.match(validateGhnCreateItems([{ name: 'x', quantity: 0 }]), /Số lượng/);
  pass('product rows are create-only content and produce a safe parcel label');
}

{
  assert.deepEqual(eligibleGhnServices(services, 19999).map(row => row.service_type_id), [2]);
  for (const weight of [20000, 40000, 50000]) assert.deepEqual(eligibleGhnServices(services, weight).map(row => row.service_type_id), [5]);
  assert.equal(isGhnServiceEligible(services[0], 20000), false);
  assert.equal(isGhnServiceEligible(services[1], 19999), false);
  pass('service types follow the 20 kg boundary consistently');
}

{
  const shops = [123, 456].map(_id => ({ _id, name: `Shop ${_id}`, address: `Synthetic ${_id}`, district_id: 1000 + _id }));
  const reads = [];
  const session = createGhnQuoteSession(async (action, body) => {
    if (action === 'get_services') return services;
    reads.push(body.feeData);
    assert.equal(body.feeData.service_type_id, 5);
    const item = body.feeData.items[0];
    assert.equal(item.quantity, 1);
    assert.equal(item.weight, body.feeData.weight);
    assert.equal(item.length, body.feeData.length);
    assert.equal(item.width, body.feeData.width);
    assert.equal(item.height, body.feeData.height);
    // Synthetic only: the rate reads the canonical item weight, not root weight.
    return { total: item.weight * 4 + Number(body.shopId) };
  });
  const at20 = final(20000), at40 = final(40000);
  const comparison20 = await compareGhnShopQuotes(session, shops, at20);
  assert.deepEqual(comparison20.quotes.map(row => row.total), [80123, 80456]);
  const comparison40 = await compareGhnShopQuotes(session, shops, at40);
  assert.deepEqual(comparison40.quotes.map(row => row.total), [160123, 160456]);
  assert.equal(reads.at(-1).items[0].weight, 40000);
  assert.equal(reads.at(-1).weight, 40000);
  assert.equal(findGhnAutomaticCheapest(comparison40, at40.key)?.total, 160123);
  assert.equal(findGhnSelectedQuote(comparison40, at40.key, '123', services[1])?.total, 160123);
  await assert.rejects(session.quote('123', services[0], at40), /không phù hợp/);
  pass('20→40 kg refresh prices canonical items at synthetic 80,000→160,000 before shop adjustment');
}

{
  const snapshot = final(20000), pending = [];
  const session = createGhnQuoteSession(async action => {
    if (action === 'get_services') return services;
    return new Promise(resolve => pending.push(resolve));
  });
  const old = session.quote('123', services[1], snapshot);
  const stale = assert.rejects(old, StaleGhnQuoteError);
  session.invalidate();
  const fresh = session.quote('123', services[1], snapshot);
  pending.shift()({ total: 80000 }); await stale;
  pending.shift()({ total: 81000 }); assert.equal((await fresh), 81000);
  assert.equal(session.peekQuote('123', services[1], snapshot), 81000);
  pass('refresh rejects stale price and retains only the current quote');
}

{
  const snapshot = final(19999);
  const session = createGhnQuoteSession(async action => action === 'get_services' ? services : { total: 1 });
  const result = await compareGhnShopQuotes(session, [{ _id: 1, name: 'One', address: 'One', district_id: 1 }], snapshot);
  assert.deepEqual(result.quotes.map(row => row.service.service_type_id), [2]);
  assert.equal(ghnServiceChoiceKey(result.quotes[0].service), '12:2');
  pass('comparison filters unsupported types before quote fan-out');
}

console.log('PASS GHN quote comparison suite (pure/synthetic only).');
