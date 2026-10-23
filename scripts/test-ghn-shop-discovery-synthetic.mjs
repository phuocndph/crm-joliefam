// Pure GHN discovery checks. No database, environment file, running API, or
// network provider is used by this script.
import assert from 'node:assert/strict';
import { ExternalIntegrationSettings } from '../server/external-integration-settings.ts';
import { ExternalReadAdapters } from '../server/external-read-adapters.ts';

const savedKey = 'synthetic-saved-key';
const draftKey = 'synthetic-draft-key';
const secret = 'SYNTHETIC_PROVIDER_SECRET';

const response = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

async function rejectedMessage(action, status = 502) {
  try {
    await action();
    assert.fail('Expected request to reject');
  } catch (error) {
    assert.equal(error?.status, status);
    return String(error?.message || '');
  }
}

function scriptedAdapter(steps, calls = []) {
  let index = 0;
  return new ExternalReadAdapters({}, async (url, init) => {
    calls.push({ url: String(url), init });
    const next = steps[index++];
    if (next instanceof Error) throw next;
    return next;
  });
}

function memorySettingsPool() {
  let row;
  const select = () => ({ rows: row ? [{ ...row, allowed_shop_ids: [...row.allowed_shop_ids] }] : [] });
  const client = {
    query: async (sql, values = []) => {
      if (/^begin$|^commit$|^rollback$|^set local |pg_advisory_xact_lock|local_auth_audit_events/i.test(sql.trim())) return { rows: [] };
      if (/from integration_private\.ghn_settings where id=true for update/i.test(sql)) return select();
      if (/^insert into integration_private\.ghn_settings/i.test(sql.trim())) {
        row = { mode: values[0], api_key: values[1], primary_shop_id: values[2], allowed_shop_ids: values[3], revision: 1 };
        return select();
      }
      if (/^update integration_private\.ghn_settings/i.test(sql.trim())) {
        row = { mode: values[0], api_key: values[1], primary_shop_id: values[2], allowed_shop_ids: values[3], revision: row.revision + 1 };
        return select();
      }
      throw new Error(`Unexpected fake SQL: ${sql}`);
    },
    release() {},
  };
  return {
    query: async (sql) => {
      if (/from integration_private\.ghn_settings where id=true/i.test(sql)) return select();
      throw new Error(`Unexpected fake pool SQL: ${sql}`);
    },
    connect: async () => client,
  };
}

const firstPageCalls = [];
const valid = scriptedAdapter([
  response({ code: 200, data: { shops: [{ _id: 123, status: 1, name: 'Cửa hàng giả lập' }], last_offset: 1 } }),
  response({ code: 200, data: { shops: [], last_offset: 0 } }),
], firstPageCalls);
const shops = await valid.discoverShops(savedKey);
assert.deepEqual(shops.map((shop) => shop._id), [123]);
assert.equal(firstPageCalls.length, 2);
assert.equal(firstPageCalls[0].init.method, 'GET');
assert.equal(firstPageCalls[0].init.redirect, 'error');
assert.ok(firstPageCalls[0].init.signal, 'discovery must retain its timeout signal');
assert.match(firstPageCalls[0].url, /offset=0&limit=200&client_phone=$/);

const httpMessage = await rejectedMessage(() => scriptedAdapter([response({}, 401)]).discoverShops(savedKey));
assert.match(httpMessage, /HTTP 401/);
assert.match(httpMessage, /trang 1/);

const businessMessage = await rejectedMessage(() => scriptedAdapter([
  response({ code: 401, message: `Token ${secret}`, code_message: `token ${secret}` }),
]).discoverShops(savedKey));
assert.match(businessMessage, /mã GHN 401/);
assert.match(businessMessage, /loại token/);
assert.match(businessMessage, /trang 1/);
assert.equal(businessMessage.includes(secret), false, 'provider text must not leak through the diagnostic');

const timeout = new Error(secret);
timeout.name = 'TimeoutError';
const timeoutMessage = await rejectedMessage(() => scriptedAdapter([timeout]).discoverShops(savedKey));
assert.match(timeoutMessage, /hết thời gian chờ/);
assert.equal(timeoutMessage.includes(secret), false);

const malformedMessage = await rejectedMessage(() => scriptedAdapter([response('{not-json')]).discoverShops(savedKey));
assert.match(malformedMessage, /không đúng định dạng/);
assert.match(malformedMessage, /trang 1/);

for (const [shape, body] of [
  ['null', { code: 200, data: { shops: null, last_offset: 0 } }],
  ['missing', { code: 200, data: { last_offset: 0 } }],
  ['other', { code: 200, data: { shops: {}, last_offset: 0 } }],
]) {
  const message = await rejectedMessage(() => scriptedAdapter([response(body)]).discoverShops(savedKey));
  assert.match(message, new RegExp(`shops ${shape}`));
  assert.match(message, /trang 1/);
}

const terminalNullCalls = [];
const terminalNull = await scriptedAdapter([
  response({ code: 200, data: { shops: [
    { _id: 123, status: 1, name: 'Cửa hàng đầu' },
    { _id: 123, status: 1, name: 'Cửa hàng đầu cập nhật' },
    { _id: 456, status: 1, name: 'Cửa hàng thứ hai' },
    { _id: 789, status: 0, name: 'Cửa hàng đã tắt' },
  ], last_offset: 9 } }),
  response({ code: 200, data: { shops: null, last_offset: 0 } }),
], terminalNullCalls).discoverShops(savedKey);
assert.equal(terminalNullCalls.length, 2);
assert.deepEqual(terminalNull.map((shop) => shop._id), [123, 456], 'the terminal null page must keep only accumulated, deduplicated active shops');
assert.equal(terminalNull[0].name, 'Cửa hàng đầu cập nhật');

const laterPageCalls = [];
const laterPageMessage = await rejectedMessage(() => scriptedAdapter([
  response({ code: 200, data: { shops: [{ _id: 123, status: 1 }], last_offset: 9 } }),
  response({ code: 200, data: { last_offset: 0, message: secret } }),
], laterPageCalls).discoverShops(savedKey));
assert.equal(laterPageCalls.length, 2);
assert.match(laterPageMessage, /shops missing/);
assert.match(laterPageMessage, /trang 2/);
assert.equal(laterPageMessage.includes(secret), false, 'a failed later page must not return any partial result or provider text');

const laterBusinessMessage = await rejectedMessage(() => scriptedAdapter([
  response({ code: 200, data: { shops: [{ _id: 123, status: 1 }], last_offset: 9 } }),
  response({ code: 401, message: secret, code_message: `token ${secret}` }),
]).discoverShops(savedKey));
assert.match(laterBusinessMessage, /mã GHN 401/);
assert.match(laterBusinessMessage, /trang 2/);
assert.equal(laterBusinessMessage.includes(secret), false, 'a later business rejection must not return partial shops or provider text');

const settings = new ExternalIntegrationSettings(memorySettingsPool(), {});
const saved = await settings.save({
  mode: 'ENABLED', revision: 0, api_key: `  ${savedKey}  `,
  primary_shop_id: ' 123 ', allowed_shop_ids: ' 123, 456 ',
}, 'synthetic-admin');
assert.equal(saved.primary_shop_id, '123');
assert.deepEqual(saved.allowed_shop_ids, ['123', '456']);
assert.equal((await settings.snapshot()).token, savedKey, 'save must store the outer-trimmed key');

const discoveryCalls = [];
const discovery = scriptedAdapter([response({ code: 200, data: { shops: [], last_offset: 0 } })], discoveryCalls);
await settings.discovery({ api_key: `  ${draftKey}  ` }, discovery);
assert.equal(discoveryCalls[0].init.headers.Token, draftKey, 'discovery must use the outer-trimmed draft key');
await rejectedMessage(() => settings.save({ mode: 'ENABLED', revision: 1, api_key: 'synthetic internal key', primary_shop_id: '123', allowed_shop_ids: '123' }, 'synthetic-admin'), 400);
await rejectedMessage(() => settings.discovery({ api_key: 'synthetic internal key' }, discovery), 400);

console.log('GHN shop discovery synthetic checks passed.');
