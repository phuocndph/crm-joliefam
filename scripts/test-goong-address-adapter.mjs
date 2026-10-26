// Synthetic transport only. No .env, database, provider or user address calls.
import assert from 'node:assert/strict';
import { GoongAddressAdapter } from '../server/goong-address-adapter.ts';
import { ExternalReadAdapters } from '../server/external-read-adapters.ts';
import { moduleRequirement } from '../server/module-permissions.ts';
const key = 'synthetic-goong-key';
const config = { token: key, configured: true, source: 'saved', mode: 'ENABLED', revision: 1, hasSavedKey: true };
const row = (id = 'test-one', description = '123 Đường Giả Lập, Phường Thử, Quận Thử, Tỉnh Thử') => ({ place_id: id, description, structured_formatting: { main_text: '123 Đường Giả Lập', secondary_text: 'Phường Thử, Quận Thử, Tỉnh Thử' } });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
let groups = 0;
const check = async (name, run) => { await run(); groups++; console.log('PASS Goong adapter: ' + name); };
const rejects = (run, status) => assert.rejects(run, error => error.status === status && !error.message.includes(key) && !error.message.includes('rsapi.goong'));
const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw Error('Real network prohibited'); };
try {
  await check('fixed endpoint, server key, timeout, no redirects/cache and bounded clean DTO', async () => {
    let calls = 0;
    const adapter = new GoongAddressAdapter(async () => config, async (url, init) => {
      calls++; assert.equal(url.origin + url.pathname, 'https://rsapi.goong.io/Place/AutoComplete'); assert.equal(url.searchParams.get('api_key'), key); assert.equal(url.searchParams.get('input'), '123 Test');
      assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.ok(init.signal instanceof AbortSignal);
      return json({ status: 'OK', predictions: [row(), row(), row('two', row().description), row('secret', key), row('unsafe', '<script>bad</script>'), ...Array.from({ length: 12 }, (_, i) => row('id' + i, 'Synthetic address ' + i))] });
    });
    assert.equal((await adapter.status()).configured, true); assert.equal(calls, 0);
    assert.equal(JSON.stringify(await adapter.status()).includes(key), false);
    const found = await adapter.autocomplete(' 123 Test ', 'employee-one'); assert.equal(found.length, 8); assert.equal(found[0].place_id, 'test-one'); assert.equal(JSON.stringify(found).includes(key), false); assert.equal(calls, 1);
  });
  await check('validation and disabled configuration never dispatch; GHN config is independent', async () => {
    let calls = 0;
    const external = new ExternalReadAdapters({ GOONG_API_KEY: key }, async () => { calls++; return json({ status: 'OK', predictions: [row()] }); }, async () => { throw Error('GHN config must not resolve'); });
    assert.equal((await external.ghn({ action: 'address_autocomplete_status' })).data.configured, true); assert.equal(calls, 0);
    assert.equal((await external.ghn({ action: 'address_autocomplete', input: '123 Test' }, undefined, 'employee-one')).data.length, 1);
    for (const extra of [{ url: 'https://fixture.invalid' }, { api_key: key }, { endpoint: '/unused' }]) await rejects(() => external.ghn({ action: 'address_autocomplete', input: '123 Test', ...extra }, undefined, 'employee-one'), 400);
    await rejects(() => external.ghn({ action: 'address_autocomplete_status', input: '123 Test' }), 400);
    const adapter = new GoongAddressAdapter(async () => config, async () => { throw Error('must not dispatch'); });
    for (const input of ['', 'ab', 'x'.repeat(501), 'abc\u0000', 123, null, {}]) await rejects(() => adapter.autocomplete(input, 'employee-one'), 400);
    await rejects(() => adapter.autocomplete('123 Test', ''), 403);
    const disabled = new GoongAddressAdapter(async () => ({ ...config, configured: false }), async () => { throw Error('must not dispatch'); });
    await rejects(() => disabled.autocomplete('123 Test', 'employee-one'), 503); assert.equal(calls, 1);
  });
  await check('empty/error/malformed/upstream reflections and thrown errors remain sanitized', async () => {
    assert.deepEqual(await new GoongAddressAdapter(async () => config, async () => json({ status: 'ZERO_RESULTS' })).autocomplete('123 Test', 'employee'), []);
    assert.deepEqual(await new GoongAddressAdapter(async () => config, async () => json({ status: 'OK', predictions: [] })).autocomplete('123 Test', 'employee'), []);
    for (const response of [() => json({ error_message: key, status: 'REQUEST_DENIED' }), () => json({ status: 'OK', predictions: null }), () => json({ status: 'OK', predictions: Array(101).fill(row()) }), () => new Response('{broken ' + key), () => new Response(key, { status: 500 })]) await rejects(() => new GoongAddressAdapter(async () => config, async () => response()).autocomplete('123 Test', 'employee'), 502);
    await rejects(() => new GoongAddressAdapter(async () => config, async () => { throw Object.assign(new Error(key), { status: 400 }); }).autocomplete('123 Test', 'employee'), 502);
    await rejects(() => new GoongAddressAdapter(async () => config, async () => { throw new DOMException(key, 'TimeoutError'); }).autocomplete('123 Test', 'employee'), 502);
    await rejects(() => new GoongAddressAdapter(async () => config, async () => json({ message: key }, 429)).autocomplete('123 Test', 'employee'), 429);
  });
  await check('stream bound cancels before reading excessive body', async () => {
    let cancelled = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(131073)); }, cancel() { cancelled = true; } });
    await rejects(() => new GoongAddressAdapter(async () => config, async () => new Response(stream)).autocomplete('123 Test', 'employee'), 502); assert.equal(cancelled, true);
  });
  await check('account rate, global concurrency, bucket cap and cleanup have bounded memory', async () => {
    let time = 1000, calls = 0;
    const limited = new GoongAddressAdapter(async () => config, async () => { calls++; return json({ status: 'OK', predictions: [] }); }, () => time);
    for (let i = 0; i < 30; i++) await limited.autocomplete('123 Test', 'employee-one');
    await rejects(() => limited.autocomplete('123 Test', 'employee-one'), 429); assert.equal(calls, 30);
    await limited.autocomplete('123 Test', 'employee-two'); time += 60001; await limited.autocomplete('123 Test', 'employee-one');
    let release; const gate = new Promise(resolve => { release = resolve; }); let entered = 0;
    const concurrent = new GoongAddressAdapter(async () => config, async () => { entered++; await gate; return json({ status: 'OK', predictions: [] }); });
    const pending = Array.from({ length: 8 }, (_, i) => concurrent.autocomplete('123 Test', 'employee-' + Math.floor(i / 2)));
    for (let i = 0; i < 16; i++) await Promise.resolve(); assert.equal(entered, 8);
    await rejects(() => concurrent.autocomplete('123 Test', 'employee-extra'), 429); await rejects(() => concurrent.autocomplete('123 Test', 'employee-0'), 429); release(); await Promise.all(pending);
    const capped = new GoongAddressAdapter(async () => config, async () => json({ status: 'OK', predictions: [] }), () => time);
    for (let i = 0; i < 1000; i++) await capped.autocomplete('123 Test', 'employee-' + i);
    await rejects(() => capped.autocomplete('123 Test', 'employee-1001'), 429); time += 60001; await capped.autocomplete('123 Test', 'employee-1001');
  });
  await check('all private aliases fail closed; address route retains module guards', () => {
    for (const adapter of ['table', 'snapshot', 'rpc', 'functions']) for (const name of ['goong_settings', 'goong-config', 'local_goong_settings', 'get_goong_settings', 'integration_private.goong_settings', '%67oong_settings']) assert.equal(moduleRequirement('GET', `/api/local-${adapter}/${name}`), false, adapter + ':' + name);
    assert.deepEqual(moduleRequirement('POST', '/api/local-functions/ghn-tracking'), ['ghn_tracking', 'orders']);
  });
} finally { globalThis.fetch = originalFetch; }
console.log(`PASS ${groups} Goong adapter groups (synthetic transport only).`);
