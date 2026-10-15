// Real API regressions. Fresh disposable database; never reads .env or calls hosted APIs.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import pg from 'pg';

const suffix = process.pid + '_' + Date.now(), database = 'quote_customer_qa_' + suffix, role = 'quote_customer_role_' + suffix;
const secret = randomBytes(24).toString('hex'), connectionString = `postgres://${role}:${secret}@127.0.0.1:55432/${database}`;
const adminSql = statement => {
  const result = spawnSync('docker', ['exec', 'crm-joliefam-local-postgres', 'psql', '-U', 'crm_local', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Disposable SQL control failed: ' + result.stderr);
  return result.stdout;
};
let api, pool, created = false, logs = '', base, token;
const manager = randomUUID(), otherManager = randomUUID();
const call = async (route, method = 'GET', body) => {
  const response = await fetch(base + route, { method, headers: { origin: 'https://crm.example.com', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; };
const customer = async (name, phone = null, owner = manager, extra = {}) => (await pool.query('insert into local_customers(name,phone,email,address,manager_id,tenant_id)values($1,$2,$3,$4,$5,$6) returning *', [name, phone, extra.email || null, extra.address || null, owner, extra.tenant || 'default'])).rows[0];
const quote = async (data = {}) => ok(await call('/api/quotes', 'POST', { quote_number: 'QA-' + randomUUID(), manager_id: manager, items: [], total_amount: 123456, ...data }), 201);
const legacyQuote = async (name, phone = '', owner = manager) => (await pool.query("insert into local_quotes(id,quote_number,manager_id,status,total_amount,items,notes,created_at)values($1,$2,$3,'draft',123456,'[]',$4,now())returning *", [randomUUID(), 'LEGACY-' + randomUUID(), owner, `Khách hàng: ${name}\nĐiện thoại: ${phone}\nEmail: \nĐịa chỉ: \nNgày hết hạn: 21/10/2026`])).rows[0];
const checks = [];
const check = async (label, action) => { await action(); checks.push(label); console.log('PASS ' + label); };
try {
  adminSql(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${secret}'`);
  adminSql(`create database ${database} owner ${role}`); created = true;
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening'); const port = listener.address().port; await new Promise(resolve => listener.close(resolve)); base = 'http://127.0.0.1:' + port;
  api = spawn(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent('globalThis.fetch=async()=>{throw new Error("QA denies hosted requests")};'), 'server-dist/index.js'], { cwd: new URL('..', import.meta.url), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'production', PUBLIC_APP_URL: 'https://crm.example.com', LOCAL_DATABASE_URL: connectionString, LOCAL_API_PORT: String(port), LOCAL_API_HOST: '127.0.0.1', LOCAL_SYNC_AUTO: 'false', LOCAL_AUTH_SUPABASE_BRIDGE: 'false', LOCAL_DEMO_AUTH: 'false', LOCAL_INTEGRATION_API: 'false' } });
  api.stdout.on('data', value => logs += value); api.stderr.on('data', value => logs += value);
  let ready = false;
  for (let n = 0; n < 160; n++) { if (api.exitCode !== null) throw new Error('QA API exited'); try { if ((await (await fetch(base + '/health')).json()).database === database) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(ready, 'Disposable database API ready'); pool = new pg.Pool({ connectionString });
  const password = 'QuoteFixtureOnly!222', salt = randomBytes(16).toString('hex'), hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
  await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)', [manager, 'quote-fixture@invalid.test', hash]);
  await pool.query("insert into local_user_roles(user_id,role)values($1,'manager')", [manager]);
  token = ok(await call('/api/local-auth/login', 'POST', { email: 'quote-fixture@invalid.test', password })).token;
  await check('new free-text quote creates one canonical customer with owner and contact', async () => {
    const q = await quote({ customer: { name: 'Nguyễn Tuấn QA', phone: '090 111 2222', email: 'tuan@qa.invalid', address: 'Địa chỉ QA' } });
    const c = (await pool.query('select * from local_customers where id=$1', [q.customer_id])).rows[0];
    assert.equal(c.name, 'Nguyễn Tuấn QA'); assert.equal(c.manager_id, manager); assert.equal(c.phone, '090 111 2222');
  });
  await check('selected imported customer survives quote edits without mutating master snapshot', async () => {
    const c = await customer('Khách đã chọn QA', '0900000001', manager, { address: 'Master address', tenant: 'default' });
    const before = (await pool.query('select * from local_customers where id=$1', [c.id])).rows;
    const q = await quote({ customer_id: c.id, customer: { name: c.name, phone: c.phone, address: 'Delivery snapshot' } });
    assert.equal(q.customer_id, c.id);
    assert.equal(ok(await call('/api/quotes/' + q.id, 'PATCH', { customer_id: c.id, customer: { name: c.name, phone: c.phone, address: 'Other delivery' }, notes: 'Edited quote' })).customer_id, c.id);
    assert.equal(ok(await call('/api/quotes/' + q.id, 'PATCH', { customer_id: null, notes: 'Legacy client' })).customer_id, c.id);
    assert.deepEqual((await pool.query('select * from local_customers where id=$1', [c.id])).rows, before);
    const changed = ok(await call('/api/quotes/' + q.id, 'PATCH', { customer_id: null, customer: { name: 'Khách mới thay thế QA', phone: '0900000002' } }));
    assert.notEqual(changed.customer_id, c.id);
  });
  await check('explicit missing and other-owner customer rejected; quote owner cannot be reassigned', async () => {
    const c = await customer('Foreign QA', '0900000003', otherManager);
    assert.equal((await call('/api/quotes', 'POST', { quote_number: 'FOREIGN', manager_id: manager, customer_id: c.id })).status, 403);
    assert.equal((await call('/api/quotes', 'POST', { quote_number: 'MISSING', manager_id: manager, customer_id: randomUUID() })).status, 400);
    const q = await quote({ customer: { name: 'Owner QA' } });
    assert.equal((await call('/api/quotes/' + q.id, 'PATCH', { manager_id: otherManager })).status, 409);
  });
  await check('unique exact name and contact disambiguates same-name customers', async () => {
    const target = await customer('Anh John QA', '0900000004'); await customer('Anh John QA', '0900000005');
    const q = await quote({ customer: { name: '  Anh John QA ', phone: '090 000 0004' } }); assert.equal(q.customer_id, target.id);
  });
  await check('ambiguous duplicate identity, name-only, and conflicting contacts never guess', async () => {
    await customer('Tố Loan QA', '0900000006'); await customer('Tố Loan QA', '0900000006');
    await customer('Trang Minh QA', '0900000007');
    const count = (await pool.query('select count(*)::int n from local_customers')).rows[0].n;
    for (const identity of [{ name: 'Tố Loan QA', phone: '0900000006' }, { name: 'Anh John QA' }, { name: 'Tố Nga QA', phone: '0900000007' }]) assert.equal((await call('/api/quotes', 'POST', { quote_number: randomUUID(), manager_id: manager, customer: identity })).status, 409);
    assert.equal((await pool.query('select count(*)::int n from local_customers')).rows[0].n, count);
  });
  await check('legacy notes approval creates and persists customer and order association atomically', async () => {
    const q = await legacyQuote('Khách cũ ghi chú QA', '0900000008');
    const result = ok(await call('/api/quotes/' + q.id + '/approve', 'POST', {}));
    assert.ok(result.quote.customer_id); assert.equal(result.order.customer_id, result.quote.customer_id); assert.equal(result.order.manager_id, manager);
    assert.equal((await pool.query('select name,phone,email,address from local_customers where id=$1', [result.quote.customer_id])).rows[0].email, null, 'blank email must not consume next notes line');
  });
  await check('replay repairs only missing customer link and leaves business fields and payments intact', async () => {
    const q = await legacyQuote('Replay QA', '0900000009'), id = randomUUID();
    await pool.query("insert into local_orders(id,quote_id,manager_id,customer_id,status,payment_status,total_amount,delivery_date,items,notes)values($1,$2,$3,null,'delivered','partial',789123,'2026-10-21','[]','Preserve existing order')", [id, q.id, manager]);
    await pool.query("insert into local_order_payments(id,order_id,payment_amount,notes)values($1,$2,1000,'Preserve payment')", [randomUUID(), id]);
    const before = (await pool.query('select status,payment_status,total_amount,delivery_date,items,notes from local_orders where id=$1', [id])).rows;
    const payments = (await pool.query('select * from local_order_payments where order_id=$1', [id])).rows;
    for (let n = 0; n < 2; n++) { const result = ok(await call('/api/quotes/' + q.id + '/approve', 'POST', {})); assert.equal(result.reused, true); assert.equal(result.order.id, id); assert.ok(result.order.customer_id); assert.equal(result.order.total_paid, 1000); }
    assert.deepEqual((await pool.query('select status,payment_status,total_amount,delivery_date,items,notes from local_orders where id=$1', [id])).rows, before);
    assert.deepEqual((await pool.query('select * from local_order_payments where order_id=$1', [id])).rows, payments);
  });
  await check('existing nonnull mismatched customer or owner aborts entire approval', async () => {
    const first = await customer('Linked first QA'), second = await customer('Linked second QA');
    for (const [owner, customerId] of [[manager, second.id], [otherManager, first.id]]) {
      const q = await quote({ customer_id: first.id });
      await pool.query("insert into local_orders(id,quote_id,manager_id,customer_id,status,total_amount)values($1,$2,$3,$4,'pending',100)", [randomUUID(), q.id, owner, customerId]);
      assert.equal((await call('/api/quotes/' + q.id + '/approve', 'POST', {})).status, 409);
      assert.equal((await pool.query('select status from local_quotes where id=$1', [q.id])).rows[0].status, 'draft');
    }
  });
  await check('concurrent approvals return one order and one resolved canonical customer', async () => {
    const q = await legacyQuote('Concurrent approval QA', '0900000010');
    const results = await Promise.all(Array.from({ length: 8 }, () => call('/api/quotes/' + q.id + '/approve', 'POST', {})));
    results.forEach(value => ok(value)); assert.equal(new Set(results.map(value => value.body.order.id)).size, 1);
    assert.equal((await pool.query('select count(*)::int n from local_orders where quote_id=$1', [q.id])).rows[0].n, 1);
    assert.equal((await pool.query('select count(*)::int n from local_customers where name=$1', ['Concurrent approval QA'])).rows[0].n, 1);
  });
  await check('concurrent free-text quote saves deduplicate normalized identity within same owner', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, n) => quote({ customer: { name: n % 2 ? 'Concurrent save QA' : ' Concurrent  save QA ', phone: n % 2 ? '0900000011' : '090 000 0011' } })));
    assert.equal(new Set(results.map(q => q.customer_id)).size, 1);
  });
  await check('historical display uses only same-owner linked quote snapshot for genuinely null customer', async () => {
    const q = await legacyQuote('Tên khách lịch sử QA', '0900000099');
    const fixtures = [
      [randomUUID(), manager, null, q.id, 'Tên khách lịch sử QA'],
      [randomUUID(), otherManager, null, q.id, null],
      [randomUUID(), manager, 'missing-canonical-id', q.id, null],
      [randomUUID(), manager, null, null, null],
    ];
    for (const [id, owner, customerId, quoteId] of fixtures) await pool.query("insert into local_orders(id,order_number,manager_id,customer_id,quote_id,status,total_amount,created_at)values($1,$1,$2,$3,$4,'pending',100,now())", [id, owner, customerId, quoteId]);
    const rows = ok(await call('/api/orders?limit=100'));
    for (const [id, , , , expected] of fixtures) { const row = rows.find(value => value.id === id); assert.equal(row.quote_customer_name, expected); assert.equal(row.customers, null); assert.equal(row.quote_customer_notes, undefined); }
    const searched = ok(await call('/api/orders?search=' + encodeURIComponent('Tên khách lịch sử QA')));
    assert.deepEqual(searched.map(value => value.id), [fixtures[0][0]], 'server search finds only eligible quote name');
  });
  await check('order insert failure rolls back newly resolved customer and approval status', async () => {
    const q = await legacyQuote('Rollback order QA', '0900000012');
    await pool.query(`create function qa_fail_order() returns trigger language plpgsql as $$begin if new.quote_id='${q.id}' then raise exception 'QA injected insert failure'; end if; return new; end$$; create trigger qa_fail_order before insert on local_orders for each row execute function qa_fail_order()`);
    try {
      assert.ok((await call('/api/quotes/' + q.id + '/approve', 'POST', {})).status >= 400);
      const saved = (await pool.query('select status,customer_id from local_quotes where id=$1', [q.id])).rows[0]; assert.equal(saved.status, 'draft'); assert.equal(saved.customer_id, null);
      assert.equal((await pool.query('select count(*)::int n from local_customers where name=$1', ['Rollback order QA'])).rows[0].n, 0);
      assert.equal((await pool.query('select count(*)::int n from local_orders where quote_id=$1', [q.id])).rows[0].n, 0);
    } finally { await pool.query('drop trigger qa_fail_order on local_orders; drop function qa_fail_order()'); }
  });
  await check('quote insert failure rolls back customer created during save', async () => {
    await pool.query("create function qa_fail_quote() returns trigger language plpgsql as $$begin if new.quote_number='QA-ROLLBACK' then raise exception 'QA injected quote failure'; end if; return new; end$$; create trigger qa_fail_quote before insert on local_quotes for each row execute function qa_fail_quote()");
    try {
      assert.ok((await call('/api/quotes', 'POST', { quote_number: 'QA-ROLLBACK', manager_id: manager, customer: { name: 'Rollback save QA' } })).status >= 400);
      assert.equal((await pool.query('select count(*)::int n from local_customers where name=$1', ['Rollback save QA'])).rows[0].n, 0);
    } finally { await pool.query('drop trigger qa_fail_quote on local_quotes; drop function qa_fail_quote()'); }
  });
  console.log(`QUOTE CUSTOMER API: ${checks.length} groups passed.`);
} finally {
  if (api && api.exitCode === null) { api.kill(); await Promise.race([once(api, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]); }
  await pool?.end(); if (created) adminSql(`drop database ${database} with (force)`); adminSql(`drop role if exists ${role}`);
  assert.ok(!logs.includes(secret), 'No credentials in logs'); console.log('CLEANUP disposable quote customer database and role removed');
}
