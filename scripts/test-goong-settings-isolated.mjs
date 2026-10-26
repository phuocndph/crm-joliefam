// Entirely disposable PostgreSQL container; no operational database or provider.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import { GoongIntegrationSettings, registerGoongIntegrationSettings } from '../server/goong-integration-settings.ts';
import { ExternalReadAdapters } from '../server/external-read-adapters.ts';
const container = `goong-settings-fixture-${process.pid}-${Date.now()}`;
assert.match(container, /^goong-settings-fixture-\d+-\d+$/);
const password = randomBytes(24).toString('hex');
const docker = args => { const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true }); if (result.status) throw Error('Disposable Goong fixture Docker operation failed: ' + args[0]); return result.stdout.trim(); };
let started = false, adminPool, pool, readerPool, server;
let groups = 0;
const check = async (name, run) => { await run(); groups++; console.log('PASS Goong settings: ' + name); };
const reject = (action, status) => assert.rejects(action, error => !status || error.status === status);
try {
  docker(['run', '--detach', '--pull=never', '--name', container, '--label', 'codex.fixture=goong-settings', '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_USER=fixture_admin', '--env', 'POSTGRES_DB=fixture', '--env', `POSTGRES_PASSWORD=${password}`, 'postgres:16-alpine']); started = true;
  const port = docker(['port', container, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1]; assert.ok(port);
  adminPool = new pg.Pool({ connectionString: `postgres://fixture_admin:${password}@127.0.0.1:${port}/fixture`, connectionTimeoutMillis: 1000 });
  for (let attempt = 0; ; attempt++) { try { await adminPool.query('select 1'); break; } catch { if (attempt > 30) throw Error('Disposable PostgreSQL not ready'); await new Promise(resolve => setTimeout(resolve, 300)); } }
  await adminPool.query(`create role fixture_owner login nosuperuser nocreatedb nocreaterole password '${password}'; create role fixture_reader login nosuperuser nocreatedb nocreaterole password '${password}'; grant create on database fixture to fixture_owner; grant usage,create on schema public to fixture_owner`);
  pool = new pg.Pool({ connectionString: `postgres://fixture_owner:${password}@127.0.0.1:${port}/fixture` });
  readerPool = new pg.Pool({ connectionString: `postgres://fixture_reader:${password}@127.0.0.1:${port}/fixture` });
  await pool.query('create table local_auth_audit_events(entity_type text,entity_id text,action text,actor_id text,reason text)');
  for (const migration of ['061_local_external_integration_settings.sql', '063_local_goong_settings.sql']) await pool.query(await readFile(new URL('../server/db/migrations/' + migration, import.meta.url), 'utf8'));
  const environment = { GOONG_API_KEY: 'synthetic-env-goong-key' }, savedKey = 'synthetic-saved-goong-key';
  const settings = new GoongIntegrationSettings(pool, environment);
  const enable = (revision, api_key = savedKey) => ({ mode: 'ENABLED', revision, api_key });
  let providerCalls = 0;
  const adapter = new ExternalReadAdapters({}, async () => { providerCalls++; return new Response(JSON.stringify({ status: 'OK', predictions: [] })); }, undefined, () => settings.snapshot());
  await check('environment/saved/retained/disabled modes and write-only statuses never call provider', async () => {
    const initial = await settings.status(); assert.equal(initial.source, 'server_env'); assert.equal(initial.revision, 0); assert.equal(initial.configured, true);
    assert.equal(JSON.stringify(initial).includes(environment.GOONG_API_KEY), false);
    const first = await settings.save(enable(0), 'admin-one'); assert.equal(first.revision, 1); assert.equal(first.source, 'saved'); assert.equal(JSON.stringify(first).includes(savedKey), false);
    const retained = await settings.save(enable(1, ''), 'admin-one'); assert.equal(retained.revision, 2); assert.equal((await settings.snapshot()).token, savedKey);
    assert.equal((await adapter.ghn({ action: 'address_autocomplete_status' })).data.configured, true); assert.equal(providerCalls, 0);
    const disabled = await settings.save({ mode: 'DISABLED', revision: 2 }, 'admin-one'); assert.equal(disabled.source, 'disabled'); assert.equal(disabled.configured, false); assert.equal((await pool.query('select api_key from integration_private.goong_settings')).rows[0].api_key, null);
    await reject(() => settings.save(enable(3, ''), 'admin-one'), 400);
    const inherited = await settings.save({ mode: 'INHERIT_ENV', revision: 3 }, 'admin-one'); assert.equal(inherited.source, 'server_env'); assert.equal((await settings.snapshot()).token, environment.GOONG_API_KEY); assert.equal(providerCalls, 0);
    await reject(() => settings.save({ ...enable(4), arbitrary_url: 'https://fixture.invalid' }, 'admin-one'));
    await reject(() => settings.save(enable(4, 'bad key'), 'admin-one'), 400);
  });
  await check('concurrent save revision, atomic audit rollback and database constraints', async () => {
    const both = await Promise.allSettled([settings.save(enable(4), 'admin-one'), settings.save(enable(4, 'synthetic-other-goong-key'), 'admin-two')]);
    assert.equal(both.filter(row => row.status === 'fulfilled').length, 1); assert.equal(both.filter(row => row.status === 'rejected' && row.reason.status === 409).length, 1);
    const before = await settings.status();
    assert.equal((await pool.query('select count(*)::int n from local_auth_audit_events')).rows[0].n, 5);
    await reject(() => pool.query("update integration_private.goong_settings set api_key=null where id=true"));
    await pool.query("create function reject_goong_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic-saved-goong-key';end$$; create trigger reject_goong_audit before insert on local_auth_audit_events for each row execute function reject_goong_audit()");
    await assert.rejects(() => settings.save({ mode: 'DISABLED', revision: before.revision }, 'admin-one'), error => error.status === 503 && !error.message.includes(savedKey));
    assert.equal((await settings.status()).revision, before.revision); await pool.query('drop trigger reject_goong_audit on local_auth_audit_events; drop function reject_goong_audit()');
    const audit = JSON.stringify((await pool.query('select * from local_auth_audit_events')).rows); assert.equal(audit.includes(savedKey), false); assert.equal(audit.includes(environment.GOONG_API_KEY), false);
  });
  await check('private schema grants and RLS protect key even after accidental SELECT grant', async () => {
    await reject(() => readerPool.query('select api_key from integration_private.goong_settings'));
    await pool.query('grant usage on schema integration_private to fixture_reader; grant select on integration_private.goong_settings to fixture_reader');
    assert.equal((await readerPool.query('select api_key from integration_private.goong_settings')).rows.length, 0);
    await reject(() => readerPool.query("update integration_private.goong_settings set mode='DISABLED',api_key=null"));
  });
  await check('real-admin-only GET/PUT, no-store and safe validation/conflicts', async () => {
    let actor = 'employee-one', role = 'employee'; const app = express(); app.use(express.json());
    registerGoongIntegrationSettings(app, settings, () => actor, () => role);
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const request = (method = 'GET', body) => fetch(origin + '/api/external-integrations/goong', { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    for (const entry of [['employee-one','employee'],['manager-one','manager'],['local-admin','admin']]) { [actor,role] = entry; for (const method of ['GET','PUT']) assert.equal((await request(method, method === 'PUT' ? enable(5) : undefined)).status, 403); }
    actor = 'admin-one'; role = 'admin'; const read = await request(); assert.equal(read.status, 200); assert.equal(read.headers.get('cache-control'), 'no-store'); assert.equal(JSON.stringify(await read.json()).includes(savedKey), false);
    assert.equal((await request('PUT', { ...enable(5), url: 'https://fixture.invalid' })).status, 400);
    assert.equal((await request('PUT', enable(0))).status, 409);
    const saved = await request('PUT', { mode: 'DISABLED', revision: 5 }); assert.equal(saved.status, 200); assert.equal((await saved.json()).configured, false); assert.equal(providerCalls, 0);
  });
  console.log(`PASS ${groups} Goong settings groups (disposable PostgreSQL, no providers).`);
} finally {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await Promise.allSettled([pool?.end(), readerPool?.end(), adminPool?.end()]);
  if (started) docker(['rm', '--force', container]);
}
