// Disposable PostgreSQL fixture and mocked GHN only. Never reads .env, starts
// the operational API, or contacts an external provider.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import { ExternalIntegrationSettings, registerExternalIntegrationSettings } from '../server/external-integration-settings.ts';
import { ExternalReadAdapters } from '../server/external-read-adapters.ts';
import { moduleRequirement } from '../server/module-permissions.ts';

const suffix = `${process.pid}_${Date.now()}`;
const database = `api_settings_qa_${suffix}`;
const owner = `api_settings_owner_${suffix}`;
const reader = `api_settings_reader_${suffix}`;
const password = randomBytes(24).toString('hex');
const environment = { GHN_API_KEY: 'synthetic-env-ghn-key', GHN_SHOP_ID: '901', GHN_SHOP_IDS: '902' };
let pool;
let createdDatabase = false;
let createdOwner = false;
let createdReader = false;
let upstreamCalls = 0;
let httpServer;

function control(sql) {
  const result = spawnSync('docker', ['exec', 'crm-joliefam-local-postgres', 'psql', '-U', 'crm_local', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Isolated API settings database control failed.');
}

async function expectReject(action, status) {
  await assert.rejects(action, error => !status || error?.status === status);
}

function enabled(revision, key = 'synthetic-saved-ghn-key', primary = '123', allowed = '123,456') {
  return { mode: 'ENABLED', revision, api_key: key, primary_shop_id: primary, allowed_shop_ids: allowed };
}

async function startHttp(app) {
  httpServer = await new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  return `http://127.0.0.1:${httpServer.address().port}`;
}

async function request(origin, path, method = 'GET', body) {
  const response = await fetch(origin + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

try {
  control(`create role ${owner} login nosuperuser nocreatedb nocreaterole password '${password}'`); createdOwner = true;
  control(`create database ${database} owner ${owner}`); createdDatabase = true;
  pool = new pg.Pool({ connectionString: `postgres://${owner}:${password}@127.0.0.1:55432/${database}` });
  await pool.query('create table local_auth_audit_events(entity_type text,entity_id text,action text,actor_id text,reason text)');
  await pool.query(await readFile(new URL('../server/db/migrations/061_local_external_integration_settings.sql', import.meta.url), 'utf8'));

  const settings = new ExternalIntegrationSettings(pool, environment);
  const adapter = new ExternalReadAdapters({}, async (url, init) => {
    upstreamCalls++;
    assert.equal(new URL(url).origin + new URL(url).pathname, 'https://online-gateway.ghn.vn/shiip/public-api/v2/shop/all');
    assert.equal(init.method, 'GET');
    return new Response(JSON.stringify({ code: 200, data: { shops: [{ _id: 123,status:1 }, { _id: 456,status:1 }],last_offset:0 } }));
  }, () => settings.snapshot());

  const initial = await settings.status();
  assert.equal(initial.source, 'server_env');
  assert.equal(initial.revision, 0);
  assert.deepEqual(initial.allowed_shop_ids, ['901', '902']);
  assert.equal(JSON.stringify(initial).includes(environment.GHN_API_KEY), false);
  assert.equal(upstreamCalls, 0, 'status must not call GHN');

  const first = await settings.save(enabled(0), 'admin-one');
  assert.equal(first.source, 'saved');
  assert.equal(first.revision, 1);
  assert.deepEqual(first.allowed_shop_ids, ['123', '456']);
  assert.equal(first.primary_shop_id, '123');
  assert.equal(JSON.stringify(first).includes('synthetic-saved-ghn-key'), false);
  assert.equal(upstreamCalls, 0, 'save must not call GHN');

  const readonly = await adapter.ghn({ action: 'get_shops' });
  assert.equal(readonly.success, true);
  assert.equal(upstreamCalls, 1, 'the fixed read-only shop check calls GHN once');

  const retained = await settings.save(enabled(1, '', '123', '123,456'), 'admin-one');
  assert.equal(retained.revision, 2);
  const storedAfterRetain = await pool.query('select api_key from integration_private.ghn_settings where id=true');
  assert.equal(storedAfterRetain.rows[0].api_key, 'synthetic-saved-ghn-key');

  const disabled = await settings.save({ mode: 'DISABLED', revision: 2 }, 'admin-one');
  assert.equal(disabled.source, 'disabled');
  assert.equal(disabled.revision, 3);
  assert.equal(disabled.configured, false);
  const cleared = await pool.query('select api_key,primary_shop_id,allowed_shop_ids from integration_private.ghn_settings where id=true');
  assert.equal(cleared.rows[0].api_key, null);
  assert.equal(cleared.rows[0].primary_shop_id, null);
  assert.deepEqual(cleared.rows[0].allowed_shop_ids, []);

  const inherited = await settings.save({ mode: 'INHERIT_ENV', revision: 3 }, 'admin-one');
  assert.equal(inherited.source, 'server_env');
  assert.equal(inherited.revision, 4);
  assert.deepEqual(inherited.allowed_shop_ids, ['901', '902']);
  await expectReject(() => settings.save(enabled(4, ''), 'admin-one'), 400);
  await expectReject(() => settings.save({ ...enabled(1), extra_provider_url: 'https://invalid.example' }, 'admin-one'));
  await expectReject(() => settings.save(enabled(1), 'admin-one'), 409);
  assert.equal(upstreamCalls, 1, 'validation and stale writes must not call GHN');

  const routeSaved = await settings.save(enabled(4, 'synthetic-route-ghn-key', '123', '123,456'), 'admin-one');
  let currentActor = 'manager-one';
  let currentRole = 'manager';
  const app = express();
  app.use(express.json());
  registerExternalIntegrationSettings(app, settings, adapter, () => currentActor, () => currentRole);
  const origin = await startHttp(app);
  for (const [actor, role] of [['manager-one', 'manager'], ['employee-one', 'employee'], ['local-admin', 'admin']]) {
    currentActor = actor; currentRole = role;
    for (const [path, method, body] of [
      ['/api/external-integrations/ghn', 'GET', undefined],
      ['/api/external-integrations/ghn', 'PUT', enabled(routeSaved.revision)],
      ['/api/external-integrations/ghn/test', 'POST', {}],
    ]) assert.equal((await request(origin, path, method, body)).status, 403, `${role} must not manage or probe external API settings`);
  }
  currentActor = 'admin-one'; currentRole = 'admin';
  const adminRead = await request(origin, '/api/external-integrations/ghn');
  assert.equal(adminRead.status, 200);
  assert.equal(adminRead.body.revision, routeSaved.revision);
  assert.equal(JSON.stringify(adminRead.body).includes('synthetic-route-ghn-key'), false, 'admin status must remain write-only for secrets');
  const beforeRouteProbe = upstreamCalls;
  const probe = await request(origin, '/api/external-integrations/ghn/test', 'POST', {});
  assert.equal(probe.status, 200); assert.equal(probe.body.connected, true);
  assert.equal(upstreamCalls, beforeRouteProbe + 1, 'only the explicit probe may call GHN');
  const unknown = await request(origin, '/api/external-integrations/ghn', 'PUT', { ...enabled(routeSaved.revision), arbitrary_url: 'https://invalid.example' });
  assert.equal(unknown.status, 400);
  for (const invalid of [enabled(routeSaved.revision, 'bad key'), enabled(routeSaved.revision, 'synthetic-route-ghn-key', '0', '0'), enabled(routeSaved.revision, 'synthetic-route-ghn-key', '123', Array.from({ length: 51 }, (_, index) => String(index + 1)).join(','))]) {
    assert.equal((await request(origin, '/api/external-integrations/ghn', 'PUT', invalid)).status, 400);
  }
  const beforeRouteSave = upstreamCalls;
  const disabledByRoute = await request(origin, '/api/external-integrations/ghn', 'PUT', { mode: 'DISABLED', revision: routeSaved.revision });
  assert.equal(disabledByRoute.status, 200); assert.equal(disabledByRoute.body.source, 'disabled');
  assert.equal(upstreamCalls, beforeRouteSave, 'save must not call GHN');

  await pool.query('truncate integration_private.ghn_settings,local_auth_audit_events');
  const concurrent = await Promise.allSettled([
    settings.save(enabled(0, 'synthetic-first-ghn-key', '321', '321'), 'admin-one'),
    settings.save(enabled(0, 'synthetic-second-ghn-key', '654', '654'), 'admin-two'),
  ]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1, 'only one first save may win');
  assert.equal(concurrent.filter(result => result.status === 'rejected' && result.reason?.status === 409).length, 1, 'the competing first save must receive a safe conflict');
  assert.equal((await pool.query('select count(*)::int total from integration_private.ghn_settings')).rows[0].total, 1);
  assert.equal((await pool.query('select count(*)::int total from local_auth_audit_events')).rows[0].total, 1, 'failed save rolls back its audit');

  await expectReject(() => pool.query("update integration_private.ghn_settings set api_key=null,primary_shop_id=null,allowed_shop_ids=array[null::text] where id=true"));
  await expectReject(() => pool.query("update integration_private.ghn_settings set primary_shop_id='0',allowed_shop_ids=array['0'] where id=true"));
  await pool.query(`create function reject_external_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure';end$$;
    create trigger reject_external_audit before insert on local_auth_audit_events for each row execute function reject_external_audit()`);
  const beforeAuditFailure = await settings.status();
  await expectReject(() => settings.save({ mode: 'DISABLED', revision: beforeAuditFailure.revision }, 'admin-one'), 503);
  const afterAuditFailure = await settings.status();
  assert.equal(afterAuditFailure.revision, beforeAuditFailure.revision, 'audit failure rolls back the setting change');
  await pool.query('drop trigger reject_external_audit on local_auth_audit_events; drop function reject_external_audit()');
  control(`create role ${reader} login nosuperuser nocreatedb nocreaterole password '${password}'`); createdReader = true;
  const publicPool = new pg.Pool({ connectionString: `postgres://${reader}:${password}@127.0.0.1:55432/${database}` });
  await expectReject(() => publicPool.query('select api_key from integration_private.ghn_settings'));
  await publicPool.end();

  for (const path of [
    '/api/local-snapshot/integration_private',
    '/api/local-table/einvoice_settings',
    '/api/local-rpc/external_integration_settings',
    '/api/local-functions/ghn_settings',
    '/api/local-snapshot/%69ntegration_private',
  ]) assert.equal(moduleRequirement('GET', path), false, `private alias must fail closed: ${path}`);

  const indexSource = await readFile(new URL('../server/index.ts', import.meta.url), 'utf8');
  assert.match(indexSource, /app\.post\("\/api\/einvoice-settings", async \(_req, res\) => \{\s*return res\.status\(409\)/, 'local e-invoice writer must reject credential saves');

  const unavailable = new ExternalIntegrationSettings({ query: async () => { throw new Error('synthetic database unavailable'); } }, environment);
  const failingAdapter = new ExternalReadAdapters({}, async () => { throw new Error('unexpected upstream'); }, () => unavailable.snapshot());
  const beforeResolverFailure = upstreamCalls;
  await expectReject(() => failingAdapter.snapshot(), 503);
  assert.equal(upstreamCalls, beforeResolverFailure, 'database resolver failure must not fall back to environment or call GHN');
  console.log('API settings isolated checks passed.');
} finally {
  if (httpServer?.listening) await new Promise(resolve => httpServer.close(resolve));
  await pool?.end();
  if (createdDatabase) control(`drop database ${database} with (force)`);
  if (createdOwner) control(`drop role if exists ${owner}`);
  if (createdReader) control(`drop role if exists ${reader}`);
}
