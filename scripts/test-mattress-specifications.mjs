import assert from 'node:assert/strict';
import { parseSku, planProduct, createPlan, applyPlan, connectionConfig } from './repair-mattress-specifications.mjs';

const row = (sku, specifications = '', category = 'Đệm lò xo') => ({ id: 'test-id', sku,
  name: 'Đệm thử nghiệm', category, specifications, price: '123456.00', price_list_id: 'unchanged',
  local_modified_at: null, updated_at: '2026-01-01T00:00:00+00:00' });
const expect = (input, value) => assert.equal(planProduct(input).specifications, value);
expect(row('DLXTDL140X25', '140x200cm'), '140x200x25cm');
expect(row('DLXTDL160X22', '160x200cm'), '160x200x22cm');
expect(row('DBE100X14F-C', '100x190cm'), '100x190x14cm');
expect(row('DBECS120X17', '', 'Đệm bông ép mút cao su 120x190'), '120x190x17cm');
expect(row('DLXTDL200X27', '200x220cm'), '200x220x27cm');
expect(row('DLX120', '', 'Đệm lò xo túi độc lập 120x200x23F'), '120x200x23cm');
expect(row('DCSTH-TRON', '', 'Đệm cao su tròn 2mx22F'), 'D200x22cm');
expect(row('DBE120X9-M', '', 'Đệm bông ép 1,2mx2mx9f'), '120x200x9cm');
assert.equal(planProduct(row('DLXTDL140X25', '160x200cm')).status, 'conflict');
assert.equal(planProduct(row('DLXTDL140X25', '140x200x22cm')).status, 'conflict');
assert.equal(planProduct(row('DLXTDL140X25', '140x200x25cm')).status, 'complete');
assert.equal(planProduct(row('DCSTH-TRON', 'D200x22cm')).status, 'complete');
assert.equal(planProduct(row('DLXTDL140X25')).status, 'skip'); // Never assumes length200.
assert.equal(planProduct(row('unknown', '', 'Đệm 140x200')).status, 'skip');
assert.equal(planProduct(row('DBE120X9', 'ghi chú không rõ')).status, 'skip');
for (const category of ['Ga trải giường', 'Bảo vệ đệm', 'Vỏ đệm']) {
  assert.equal(planProduct(row('DBE120X9', '120x200cm', category)).status, 'excluded');
}
for (const sku of ['DBE120X0', 'DBE120X99', 'SKUDBE120X9', 'DBE120X9trailing']) assert.equal(parseSku(sku), null);
const plan = createPlan([row('DBE100X14F-C', '100x190cm')], '2026-10-28T01:00:00.000Z');
assert.equal(createPlan(plan.changes.map(item => item.after)).changes.length, 0);
for (const [key, value] of Object.entries(plan.changes[0].before)) {
  if (!['specifications', 'updated_at', 'local_modified_at'].includes(key)) assert.deepEqual(plan.changes[0].after[key], value);
}
const calls = [];
const fake = stale => ({ query: async (sql, params) => {
  calls.push({ sql, params });
  if (sql.startsWith('SELECT')) return { rows: [{ row: stale ? { ...plan.changes[0].before, price: '999' } : plan.changes[0].before }] };
  return { rowCount: 1 };
} });
await assert.rejects(applyPlan(fake(true), plan), /changed since dry-run/);
assert.equal(calls.at(-1).sql, 'ROLLBACK');
assert.ok(!calls.some(call => call.sql.startsWith('UPDATE')));
calls.length = 0;
assert.equal(await applyPlan(fake(false), plan), 1);
assert.equal(calls.at(-1).sql, 'COMMIT');
assert.match(calls.find(call => call.sql.startsWith('UPDATE')).sql, /SET specifications = \$2, local_modified_at = \$3, updated_at = \$3 WHERE id = \$1$/);
const tampered = structuredClone(plan);
tampered.changes[0].after.price = '0';
await assert.rejects(applyPlan(fake(false), tampered), /inconsistent/);
const env = { PGHOST: '127.0.0.1', PGPORT: '16543', PGDATABASE: 'crm_local', PGUSER: 'test', PGPASSWORD: 'test' };
assert.equal(connectionConfig(env).port, 16543);
assert.throws(() => connectionConfig({ ...env, PGHOST: 'remote.example' }), /loopback/);
assert.throws(() => connectionConfig({ TEST_URL: 'postgres://test:test@localhost/crm_local?host=remote' }, 'TEST_URL'), /plain PostgreSQL/);
console.log('Mattress specifications: parsing, exclusions, idempotence, preserved fields, stale rollback, plan validation and loopback connection checks passed.');
