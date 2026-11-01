// Real API regressions. Fresh disposable database; never reads .env or calls hosted APIs.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

const suffix = process.pid + '_' + Date.now(), database = 'quote_customer_qa_' + suffix, role = 'quote_customer_role_' + suffix;
const hostedRole='contract_authenticated_'+suffix;
const secret = randomBytes(24).toString('hex'), connectionString = `postgres://${role}:${secret}@127.0.0.1:16543/${database}`;
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
  api = spawn(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent('import net from "node:net";const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const value=args[0];const options=typeof value==="object"?value:{host:typeof args[1]==="string"?args[1]:"localhost"};if(options.host&&!new Set(["127.0.0.1","localhost","::1"]).has(options.host))throw new Error("QA denies remote sockets");return connect.apply(this,args)};globalThis.fetch=async()=>{throw new Error("QA denies hosted requests")};'), '--import', 'tsx', 'server/index.ts'], { cwd: new URL('..', import.meta.url), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'].filter(key=>process.env[key]).map(key=>[key,process.env[key]])), NODE_ENV: 'production', PUBLIC_APP_URL: 'https://crm.example.com', LOCAL_DATABASE_URL: connectionString, LOCAL_API_PORT: String(port), LOCAL_API_HOST: '127.0.0.1', LOCAL_SYNC_AUTO: 'false', LOCAL_AUTH_SUPABASE_BRIDGE: 'false', LOCAL_DEMO_AUTH: 'false', LOCAL_INTEGRATION_API: 'false' } });
  api.stdout.on('data', value => logs += value); api.stderr.on('data', value => logs += value);
  let ready = false;
  for (let n = 0; n < 160; n++) { if (api.exitCode !== null) throw new Error('QA API exited: '+logs.replaceAll(secret,'[redacted]')); try { if ((await (await fetch(base + '/health')).json()).database === database) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(ready, 'Disposable database API ready'); pool = new pg.Pool({ connectionString });
  const password = 'QuoteFixtureOnly!222', salt = randomBytes(16).toString('hex'), hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
  await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)', [manager, 'quote-fixture@invalid.test', hash]);
  await pool.query("insert into local_user_roles(user_id,role)values($1,'manager')", [manager]);
  token = ok(await call('/api/local-auth/login', 'POST', { email: 'quote-fixture@invalid.test', password })).token;

  const managerToken=token;
  const identities={manager};
  const tokens={manager:token};
  for (const [name,type,assigned] of [['admin','admin',null],['accountant','accountant',manager],['employee','employee',manager],['orphan','employee',null],['leader','team_leader',manager],['foreign','manager',null]]) {
    const id=randomUUID(); identities[name]=id;
    await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,name+'@contract.invalid',hash]);
    await pool.query('insert into local_user_roles(user_id,role,assigned_by)values($1,$2,$3)',[id,type,assigned]);
    tokens[name]=ok(await call('/api/local-auth/login','POST',{email:name+'@contract.invalid',password})).token;
  }
  for(const id of Object.values(identities))await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'contracts',true)on conflict do nothing",[id]);
  const finance={buyer_info:{company_name:'Fixture buyer'},items:[{name:'Fixture metre',quantity:1.5,price:100.5,total:1}],include_vat:true,vat_rate:8,deposit_percentage:70,seller_info:{company_name:'Saved seller',deposit_mode:'percent'}};
  const make=async(extra={})=>ok(await call('/api/contracts','POST',{...finance,contract_number:'CT-'+randomUUID(),...extra}),201);
  const denied=r=>assert.ok([403,404].includes(r.status),JSON.stringify(r));
  const rejected=r=>assert.ok([400,409,422].includes(r.status),JSON.stringify(r));
  let baseline;
  await check('canonical whole-VND finance and explicit zero VAT/deposit; legacy metadata preserved',async()=>{
    baseline=await make({subtotal:1,vat_amount:1,total_amount:1});
    assert.equal(baseline.subtotal,151);assert.equal(baseline.vat_amount,12);assert.equal(baseline.total_amount,163);assert.equal(baseline.deposit_amount,114);assert.equal(baseline.items[0].total,151);assert.equal(baseline.manager_id,manager);
    const zero=await make({vat_rate:0,deposit_percentage:0});assert.equal(zero.vat_rate,0);assert.equal(zero.deposit_amount,0);
    await pool.query("update local_contracts set items='[]',total_amount=123.45,deposit_amount=10.25 where id=$1",[zero.id]);
    const edited=ok(await call('/api/contracts/'+zero.id,'PATCH',{notes:'metadata'}));assert.equal(edited.total_amount,123.45);assert.equal(edited.deposit_amount,10.25);assert.deepEqual(edited.items,[]);
    const framework=await make({contract_number:'HDNT-'+randomUUID(),items:[],total_amount:0,deposit_amount:0});assert.equal(framework.total_amount,0);
  });
  await check('invalid finance/date rejects atomically',async()=>{
    const cases=[{items:[]},{items:[{name:'zero',quantity:0,price:1}]},{items:[{name:'negative',quantity:-1,price:1}]},{items:[{name:'bad',quantity:1,price:'NaN'}]},{total_amount:-1},{vat_rate:101},{deposit_percentage:-1},{deposit_percentage:101},{seller_info:{deposit_mode:'amount'},deposit_amount:1000},{contract_date:'2026-02-30'},{start_date:'2026-10-30',end_date:'2026-10-01'}];
    const before=(await pool.query('select count(*)::int n from local_contracts')).rows[0].n;
    for(const data of cases)rejected(await call('/api/contracts','POST',{...finance,contract_number:randomUUID(),...data}));
    assert.equal((await pool.query('select count(*)::int n from local_contracts')).rows[0].n,before);
  });
  await check('persisted timestamp dates survive metadata and financial edits',async()=>{
    const dated=await make({contract_date:'2026-10-27',start_date:'2026-10-28',end_date:'2026-11-01'});
    const edited=ok(await call('/api/contracts/'+dated.id,'PATCH',{notes:'Keep saved dates'}));
    assert.equal(edited.contract_date.slice(0,10),'2026-10-27');
    const financial=ok(await call('/api/contracts/'+dated.id,'PATCH',{vat_rate:0,deposit_percentage:0}));
    assert.equal(financial.total_amount,151);assert.equal(financial.deposit_amount,0);
  });
  await check('business date display preserves historical UTC+7 signatures and metadata does not recalculate legacy snapshots',async()=>{
    const { tsImport }=await import('tsx/esm/api');const { contractBusinessDate }=await tsImport('../server/contract-calculation.ts',import.meta.url);
    assert.equal(contractBusinessDate('2026-10-26T17:00:00.000Z'),'2026-10-27');assert.equal(contractBusinessDate('2026-10-27T00:00:00+07:00'),'2026-10-27');assert.equal(contractBusinessDate('2026-10-27'),'2026-10-27');
    const c=await make();const customerId=(await customer('Historic linked owner mismatch',null,identities.foreign)).id;
    await pool.query("update local_contracts set customer_id=$2,items='[]',total_amount=123.45,deposit_amount=10.25,seller_info='{\"company_name\":\"Saved\"}',contract_date='2026-10-26T17:00:00Z' where id=$1",[c.id,customerId]);
    const before=(await pool.query('select contract_date,seller_info,total_amount,deposit_amount from local_contracts where id=$1',[c.id])).rows[0];
    const updated=ok(await call('/api/contracts/'+c.id,'PATCH',{customer_id:customerId,notes:'Only metadata',seller_info:{company_name:'Saved',representative:'Changed representative'}}));
    assert.equal(updated.total_amount,123.45);assert.equal(updated.deposit_amount,10.25);assert.equal(updated.seller_info.deposit_mode,undefined);assert.equal(updated.contract_date,new Date(before.contract_date).toISOString());
    for(const buyer_info of [null,{},[],{company_name:''},{company_name:'   '},{company_name:5}])rejected(await call('/api/contracts/'+c.id,'PATCH',{buyer_info}));
  });
  await check('quote prefill drops only completely empty template separators and keeps meaningful invalid rows visible',async()=>{
    const { tsImport }=await import('tsx/esm/api');const { contractPrefillItems,canonicalContract }=await tsImport('../server/contract-calculation.ts',import.meta.url);
    const input=[{name:'Product A',quantity:2,price:1200000,total:2400000},{name:'Product B',quantity:1,price:250,total:250},{name:'',specifications:'',quantity:1,price:0,total:0},{name:'   ',quantity:0,price:0,total:0}];
    const original=JSON.stringify(input),items=contractPrefillItems(input);assert.equal(items.length,2);assert.equal(JSON.stringify(input),original);assert.equal(canonicalContract({...finance,items,include_vat:false}).total_amount,2400250);
    const meaningful=[{name:'',quantity:2,price:0},{name:'',quantity:1,price:10},{name:'',specifications:'Specified row',quantity:1,price:0},{name:'',sku:'SKU-1',quantity:1,price:0}];assert.equal(contractPrefillItems(meaningful).length,4);assert.throws(()=>canonicalContract({...finance,items:contractPrefillItems(meaningful)}));
  });
  await check('ownership scoped lists/mutations and raw aliases fail closed for every role',async()=>{
    for(const name of ['employee','accountant']){token=tokens[name];assert.ok(ok(await call('/api/contracts')).some(c=>c.id===baseline.id));const c=await make();assert.equal(c.manager_id,manager);}
    token=tokens.foreign;assert.ok(!ok(await call('/api/contracts')).some(c=>c.id===baseline.id));denied(await call('/api/contracts/'+baseline.id,'PATCH',{notes:'foreign'}));denied(await call('/api/contracts/'+baseline.id,'DELETE'));
    for(const name of ['orphan','leader']){token=tokens[name];denied(await call('/api/contracts'));denied(await call('/api/contracts','POST',{...finance,contract_number:randomUUID()}));}
    for(const name of ['admin','manager','employee','accountant']){token=tokens[name];for(const endpoint of ['/api/local-snapshot/contracts','/api/local-table/contracts','/api/local-snapshot/local_contracts','/api/local-table/local_einvoices','/api/local-snapshot/contract_templates'])denied(await call(endpoint));}
    token=managerToken;
  });
  await check('cross-owner/customer/tenant links reject even global administrator',async()=>{
    const a=await customer('Fixture self'),b=await customer('Fixture foreign',null,identities.foreign);
    token=tokens.admin;denied(await call('/api/contracts','POST',{...finance,contract_number:randomUUID(),manager_id:manager,customer_id:b.id}));
    const order=randomUUID();await pool.query("insert into local_orders(id,manager_id,customer_id,tenant_id,total_amount)values($1,$2,$3,'default',100)",[order,manager,b.id]);
    rejected(await call('/api/contracts','POST',{...finance,contract_number:randomUUID(),manager_id:manager,customer_id:a.id,order_id:order}));
    const self=await make({customer_id:a.id});assert.equal(self.tenant_id,'default');assert.equal(self.manager_id,manager);
    token=managerToken;
  });
  await check('duplicate number concurrent creates reserve atomically; saved historic duplicate untouched',async()=>{
    const number='CONCURRENT-'+randomUUID(),results=await Promise.all(Array.from({length:6},()=>call('/api/contracts','POST',{...finance,contract_number:number})));
    assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===409).length,5);
    await pool.query('alter table local_contracts disable trigger local_contract_number_guard');
    try{await pool.query("insert into local_contracts(id,contract_number,manager_id,tenant_id)values($1,'HISTORIC',$3,'local-tenant'),($2,'HISTORIC',$3,'local-tenant')",[randomUUID(),randomUUID(),manager]);}finally{await pool.query('alter table local_contracts enable trigger local_contract_number_guard');}
    const old=(await pool.query("select id from local_contracts where contract_number='HISTORIC' limit 1")).rows[0].id;ok(await call('/api/contracts/'+old,'PATCH',{contract_number:'HISTORIC',notes:'preserve duplicate'}));
  });
  await check('actual receipts only; missing/ambiguous contract allocations unknown',async()=>{
    assert.equal(ok(await call('/api/contracts/'+baseline.id+'/payment-summary')).known,false);
    const order=randomUUID();await pool.query("insert into local_orders(id,manager_id,tenant_id,total_amount)values($1,$2,'local-tenant',163)",[order,manager]);
    const c=await make({order_id:order,deposit_amount:114});let summary=ok(await call('/api/contracts/'+c.id+'/payment-summary'));assert.equal(summary.paid,0);assert.equal(summary.remaining,163);
    await pool.query('insert into local_order_payments(id,order_id,payment_amount)values($1,$2,40)',[randomUUID(),order]);
    await pool.query("insert into local_transactions(id,order_id,amount,type)values($1,$2,40,'income')",[randomUUID(),order]);
    summary=ok(await call('/api/contracts/'+c.id+'/payment-summary'));assert.equal(summary.paid,40);assert.equal(summary.remaining,123);
    const ignoredPayment=randomUUID();await pool.query('insert into local_order_payments(id,order_id,payment_amount)values($1,$2,99)',[ignoredPayment,order]);await pool.query("insert into local_projection_tombstones(source_table,source_key,tombstone_kind)values('order_payments',$1,'SOURCE')",[ignoredPayment]);assert.equal(ok(await call('/api/contracts/'+c.id+'/payment-summary')).paid,40);
    token=tokens.foreign;denied(await call('/api/contracts/'+c.id+'/payment-summary'));token=managerToken;
    await make({order_id:order});assert.equal(ok(await call('/api/contracts/'+c.id+'/payment-summary')).known,false);
  });
  await check('templates mirror role ownership with accountant read-only',async()=>{
    const t=ok(await call('/api/contract-templates','POST',{name:'Fixture template',vat_rate:0}),201);
    token=tokens.employee;assert.ok(ok(await call('/api/contract-templates')).some(r=>r.id===t.id));denied(await call('/api/contract-templates/'+t.id,'PATCH',{name:'No'}));
    token=tokens.accountant;denied(await call('/api/contract-templates/'+t.id,'DELETE'));token=tokens.foreign;assert.ok(!ok(await call('/api/contract-templates')).some(r=>r.id===t.id));token=managerToken;
  });
  await check('legacy invoice draft writes retired, owner reads, no issuing/import deletion',async()=>{
    const countBefore=(await pool.query('select count(*)::int n from local_einvoices')).rows[0].n;
    assert.equal((await call('/api/einvoices/draft','POST',{contract:{id:baseline.id,total_amount:1,buyer_info:{company_name:'Forged'},items:[]},options:{}})).status,409);
    assert.equal((await pool.query('select count(*)::int n from local_einvoices')).rows[0].n,countBefore);
    const created=(await pool.query("insert into local_einvoices(id,contract_id,manager_id,tenant_id,total_amount,vat_amount,total_with_vat,status,is_draft)values($1,$2,$3,$4,151,12,163,'draft',true)returning *",[randomUUID(),baseline.id,manager,baseline.tenant_id])).rows[0];
    const before=(await pool.query('select * from local_einvoices where id=$1',[created.id])).rows;
    assert.equal((await call('/api/einvoices/'+created.id+'/issue','POST',{})).status,409);assert.deepEqual((await pool.query('select * from local_einvoices where id=$1',[created.id])).rows,before);
    token=tokens.employee;assert.ok(ok(await call('/api/einvoices')).some(r=>r.id===created.id));denied(await call('/api/einvoices/'+created.id,'DELETE'));
    token=tokens.foreign;assert.ok(!ok(await call('/api/einvoices')).some(r=>r.id===created.id));denied(await call('/api/einvoices/'+created.id+'/preview','POST',{}));
    token=managerToken;await pool.query("update local_einvoices set is_snapshot_record=true,status='issued',is_draft=false where id=$1",[created.id]);assert.equal((await call('/api/einvoices/'+created.id,'DELETE')).status,409);
    assert.equal((await call('/api/contracts/'+baseline.id,'DELETE')).status,409);
    const standaloneCount=(await pool.query('select count(*)::int n from local_einvoices')).rows[0].n;assert.equal((await call('/api/einvoices/draft','POST',{contract:{buyer_info:{company_name:'Standalone'},items:[{name:'metre',quantity:1.5,unit_price:100.5}],include_vat:true,vat_rate:8},options:{}})).status,409);assert.equal((await pool.query('select count(*)::int n from local_einvoices')).rows[0].n,standaloneCount);
  });
  await check('future source invoice projections refresh trusted owner/tenant without changing issued status',async()=>{
    const id=randomUUID();await pool.query("insert into local_source_snapshots(source_table,source_key,source_hash,payload)values('einvoices',$1,'fixture',$2)",[id,{manager_id:manager,tenant_id:'default'}]);
    await pool.query("insert into local_einvoices(id,status,is_draft)values($1,'issued',false)",[id]);
    assert.equal((await pool.query('select manager_id from local_einvoices where id=$1',[id])).rows[0].manager_id,manager);
    await pool.query("update local_source_snapshots set payload=$2 where source_key=$1",[id,{manager_id:identities.foreign,tenant_id:'other'}]);
    await pool.query('update local_einvoices set updated_at=now() where id=$1',[id]);
    const row=(await pool.query('select manager_id,tenant_id,status from local_einvoices where id=$1',[id])).rows[0];assert.deepEqual(row,{manager_id:identities.foreign,tenant_id:'other',status:'issued'});
  });
  // Isolated hosted-compatible schema: no production or existing Supabase database is touched.
  await pool.query(`create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table user_roles(user_id uuid,role text,assigned_by uuid);
    create function has_role(u uuid,r text)returns boolean language sql stable as $$select exists(select 1 from user_roles where user_id=u and role=r)$$;
    create table contracts(like local_contracts including defaults);
    alter table contracts alter column id type uuid using id::uuid; alter table contracts alter column id set default gen_random_uuid();
    alter table contracts alter column customer_id type uuid using customer_id::uuid; alter table contracts alter column order_id type uuid using order_id::uuid; alter table contracts alter column quote_id type uuid using quote_id::uuid; alter table contracts alter column template_id type uuid using template_id::uuid;
    create table orders(id uuid,manager_id text,tenant_id text,customer_id uuid); create table customers(like orders); create table quotes(like orders); create table contract_templates(like orders); create table order_payments(order_id uuid,payment_amount numeric); create table einvoices(contract_id uuid);`);
  adminSql(`grant create on database ${database} to ${role}`);
  adminSql(`create role ${hostedRole} nologin; grant ${hostedRole} to ${role}`);
  await pool.query((await readFile(new URL('../supabase/migrations/20261027124950_contract_integrity_and_payment_summary.sql',import.meta.url),'utf8')).replaceAll('authenticated',hostedRole));
  await pool.query("insert into user_roles values($1,'manager',null),($2,'manager',null)",[manager,identities.foreign]);
  await pool.query(`alter table contracts enable row level security;
    create policy own_contract on contracts to ${hostedRole} using(manager_id=auth.uid()::text) with check(manager_id=auth.uid()::text);
    grant usage on schema public,auth to ${hostedRole};grant select,insert,update,delete on contracts to ${hostedRole};grant select on user_roles to ${hostedRole};grant execute on function auth.uid(),has_role(uuid,text) to ${hostedRole};`);
  const hostedInsert=async(client,number,owner=manager,data=finance)=>client.query("insert into contracts(id,contract_number,manager_id,tenant_id,buyer_info,seller_info,items,vat_rate,include_vat,deposit_percentage)values(gen_random_uuid(),$1,$2,'default',$3,$4,$5,$6,$7,$8)returning *",[number,owner,data.buyer_info,data.seller_info,JSON.stringify(data.items),data.vat_rate,data.include_vat,data.deposit_percentage]);
  await pool.query("select set_config('test.uid',$1,false)",[manager]);
  await check('hosted guard canonical arithmetic and invalid writes verified in isolated schema',async()=>{
    const client=await pool.connect();
    try{await client.query('set role '+hostedRole);await client.query("select set_config('test.uid',$1,false)",[manager]);
      const c=(await hostedInsert(client,'HOSTED')).rows[0];assert.equal(Number(c.total_amount),163);assert.equal(Number(c.deposit_amount),114);
      await client.query("select set_config('test.uid',$1,false)",[identities.foreign]);await assert.rejects(client.query('select contract_payment_summary($1)',[c.id]),e=>e.code==='42501');
      await client.query("select set_config('test.uid','',false)");await assert.rejects(client.query('select contract_payment_summary($1)',[c.id]),e=>e.code==='42501');await client.query("select set_config('test.uid',$1,false)",[manager]);
      for(const extra of [{vat_rate:-1},{deposit_percentage:101},{items:[{name:'zero',quantity:0,price:1}]},{items:null}])await assert.rejects(hostedInsert(client,randomUUID(),manager,{...finance,...extra}));
      await client.query('update contracts set order_id=null where id=$1',[c.id]);assert.equal((await client.query('select contract_payment_summary($1) s',[c.id])).rows[0].s.known,false);
      await pool.query('insert into einvoices(contract_id)values($1)',[c.id]);await assert.rejects(client.query('delete from contracts where id=$1',[c.id]),e=>e.code==='23503');assert.equal((await client.query('select id from contracts where id=$1',[c.id])).rowCount,1);
    }finally{await client.query('reset role');client.release();}
  });
  await check('hosted RLS-hidden duplicate concurrency rejects exactly one, even across owners',async()=>{
    const clients=await Promise.all([pool.connect(),pool.connect()]);const number=randomUUID();
    try{for(let i=0;i<2;i++){await clients[i].query('set role '+hostedRole);await clients[i].query("select set_config('test.uid',$1,false)",[i?identities.foreign:manager]);}
      const results=await Promise.allSettled(clients.map((c,i)=>hostedInsert(c,number,i?identities.foreign:manager)));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='23505').length,1);
    }finally{for(const client of clients){await client.query('reset role');client.release();}}
  });
  await check('hosted old duplicate numbers and financial snapshots survive metadata edits',async()=>{
    await pool.query('alter table contracts disable trigger z_contract_integrity_guard');
    const id=randomUUID();
    try{await pool.query("insert into contracts(id,contract_number,manager_id,tenant_id,total_amount,items)values($1,'OLD-DUP',$3,'default',123.45,'[]'),($2,'OLD-DUP',$3,'default',123.45,'[]')",[id,randomUUID(),manager]);}finally{await pool.query('alter table contracts enable trigger z_contract_integrity_guard');}
    const client=await pool.connect();try{await client.query('set role '+hostedRole);await client.query("select set_config('test.uid',$1,false)",[manager]);await client.query("update contracts set notes='metadata',contract_number='OLD-DUP' where id=$1",[id]);assert.equal(Number((await client.query('select total_amount from contracts where id=$1',[id])).rows[0].total_amount),123.45);}finally{await client.query('reset role');client.release();}
  });
  console.log(`CONTRACTS AND INVOICES: ${checks.length} groups passed.`);
} finally {
  if (api && api.exitCode === null) { api.kill(); await Promise.race([once(api, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]); }
  await pool?.end(); if (created) adminSql(`drop database ${database} with (force)`); adminSql(`drop role if exists ${role}`); adminSql(`drop role if exists ${hostedRole}`);
  assert.ok(!logs.includes(secret), 'No credentials in logs'); console.log('CLEANUP disposable quote customer database and role removed');
}
