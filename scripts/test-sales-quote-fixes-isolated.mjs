// Strict quote repair regressions. Disposable DB; no .env, hosted APIs or operational writes.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const repo = fileURLToPath(new URL('..', import.meta.url));
const systemEnvironment = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
let source = await readFile(new URL('./test-quote-customer-isolated.mjs', import.meta.url), 'utf8');
source = source.replace(/^import .*;\r?\n/gm, '')
  .replaceAll('@127.0.0.1:55432/', '@127.0.0.1:16543/')
  .replace("'server-dist/index.js'", "'--import', 'tsx', 'server/index.ts'")
  .replace("new URL('..', import.meta.url)", 'repo')
  .replace('...process.env,', '...systemEnvironment,')
  .replace("throw new Error('QA API exited')", "throw new Error('QA API exited: ' + logs.replaceAll(secret, '[fixture secret]'))")
  .replace('items: [], total_amount: 123456', "items: [{name:'test baseline',quantity:1,price:123456,total:123456}], subtotal:123456, total_amount:123456")
  .replace('status,total_amount,items,notes,created_at', 'status,subtotal,vat_rate,vat_amount,include_vat,total_amount,items,notes,created_at')
  .replace("'draft',123456,'[]',$4", String.raw`'draft',123456,0,0,false,123456,'[{\"name\":\"test legacy\",\"quantity\":1,\"price\":123456,\"total\":123456}]',$4`)
  .replace('JSON.stringify(body) : undefined', "JSON.stringify(route === '/api/quotes' && method === 'POST' ? {items:[{name:'test baseline',quantity:1,price:123456,total:123456}],subtotal:123456,total_amount:123456,vat_rate:0,vat_amount:0,include_vat:false,...body} : body) : undefined");
source = source.replace('globalThis.fetch=async()=>{throw new Error("QA denies hosted requests")};',
  'import net from "node:net";const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const value=args[0];const options=typeof value==="object"?value:{host:typeof args[1]==="string"?args[1]:"localhost"};if(options.host&&!new Set(["127.0.0.1","localhost","::1"]).has(options.host))throw new Error("QA denies non-loopback sockets");return connect.apply(this,args)};globalThis.fetch=async()=>{throw new Error("QA denies hosted requests")};');

const extension = String.raw`
  const finance = {subtotal:200000,vat_rate:8,vat_amount:16000,include_vat:true,total_amount:216000,
    items:[{id:'test-item',name:'test product',quantity:2,price:100000,total:200000}],
    quote_data:{title:'test quote title',customerName:'test finance',payment1:50000,payment2:30000,includeVAT:true,vatRate:8}};
  const rejected = (result, label) => assert.ok([400,409,422].includes(result.status), label+': '+JSON.stringify(result));
  const denied = (result, label) => assert.ok([403,404].includes(result.status), label+': '+JSON.stringify(result));
  await check('canonical finance, VAT snapshot, planned payments and immutable approved version',async()=>{
    const q=await quote({...finance,customer:{name:'test financial snapshot',phone:'0900888000'}});
    for(const key of ['subtotal','vat_rate','vat_amount','total_amount']) assert.equal(typeof q[key],'number',key+' numeric DTO');
    const approved=ok(await call('/api/quotes/'+q.id+'/approve','POST',{}));
    const order=(await pool.query('select * from local_orders where id=$1',[approved.order.id])).rows[0];
    for(const key of ['subtotal','vat_rate','vat_amount','total_amount']) assert.equal(Number(order[key]),q[key],key+' copied');
    assert.equal(order.include_vat,true);assert.deepEqual(order.items,q.items);assert.equal(order.customer_id,q.customer_id);assert.equal(order.manager_id,manager);
    assert.equal(approved.order.total_paid,0);assert.equal(order.payment_status,'unpaid');
    assert.equal((await pool.query('select count(*)::int n from local_order_payments where order_id=$1',[order.id])).rows[0].n,0);
    assert.equal((await pool.query('select count(*)::int n from local_transactions where order_id=$1',[order.id])).rows[0].n,0);
    const before=(await pool.query('select * from local_quotes where id=$1',[q.id])).rows[0];
    for(const body of [{items:[{name:'test changed',quantity:3,price:100000}]},{total_amount:324000},{status:'draft'},{quote_number:'test changed'},{notes:'test change'},{created_at:'2026-10-01T00:00:00Z'},{quote_data:{payment1:0}}]) {
      assert.equal((await call('/api/quotes/'+q.id,'PATCH',body)).status,409,'approved PATCH immutable');
    }
    assert.equal((await call('/api/quotes/'+q.id,'DELETE')).status,409,'approved delete immutable');
    assert.deepEqual((await pool.query('select * from local_quotes where id=$1',[q.id])).rows[0],before);
    const replay=ok(await call('/api/quotes/'+q.id+'/approve','POST',{}));assert.equal(replay.reused,true);assert.equal(replay.order.id,order.id);
  });
  await check('positive forged totals are canonicalized, not trusted',async()=>{
    const q=await quote({...finance,subtotal:1,vat_amount:1,total_amount:1,items:[{name:'test forged total',quantity:2,price:100000,total:1}],customer:{name:'test forged total'}});
    assert.equal(q.subtotal,200000);assert.equal(q.vat_amount,16000);assert.equal(q.total_amount,216000);assert.equal(q.items[0].total,200000);
    const patched=ok(await call('/api/quotes/'+q.id,'PATCH',{items:[{name:'test patched forged',quantity:3,price:100000,total:1}],subtotal:1,vat_amount:1,total_amount:1}));
    assert.equal(patched.subtotal,300000);assert.equal(patched.vat_amount,24000);assert.equal(patched.total_amount,324000);
  });
  await check('all malformed and nonfinite/negative financial boundary payloads reject atomically',async()=>{
    const cases=[
      {items:[{name:'test negative quantity',quantity:-2,price:100000}]},
      {items:[{name:'test zero quantity',quantity:0,price:100000}]},
      {items:[{name:'test negative price',quantity:2,price:-100000}]},
      {items:[{name:'test NaN quantity',quantity:'NaN',price:100000}]},
      {items:[{name:'test bad quantity',quantity:'abc',price:100000}]},
      {items:[{name:'test whitespace quantity',quantity:' ',price:100000}]},
      {items:[{name:'test boolean price',quantity:1,price:true}]},
      {items:[{name:'test object price',quantity:1,price:{}}]},
      {items:[{name:'',quantity:1,price:0}]},{items:[{name:'   ',quantity:1,price:0}]},
      {items:[]},{items:{}},{items:'{bad json'},{items:'123'},{items:null},{items:[null,3,'test']},
      {total_amount:-1},{total_amount:'NaN'},{total_amount:'Infinity'},{total_amount:'abc'},{total_amount:null},
      {subtotal:-1},{vat_amount:-1},{vat_rate:-8},{vat_rate:101},{vat_rate:'NaN'},
      {vat_rate:8.1234},{include_vat:'false'},
      {quote_data:{payment1:-1}},{quote_data:{payment2:'NaN'}},
      {items:[{name:'test overflow',quantity:'999999999999999999999999999999999',price:100000}]},
    ];
    const baseline=(await pool.query('select (select count(*) from local_quotes)::int q,(select count(*) from local_customers)::int c')).rows[0];
    for(const [i,body]of cases.entries()) rejected(await call('/api/quotes','POST',{...finance,quote_number:'test boundary '+i,manager_id:manager,customer:{name:'test invalid unique '+i},...body}),'POST invalid '+i);
    const after=(await pool.query('select (select count(*) from local_quotes)::int q,(select count(*) from local_customers)::int c')).rows[0];assert.deepEqual(after,baseline,'no quote or customer residue');
    const q=await quote({...finance,customer:{name:'test PATCH boundaries'}});
    const before=(await pool.query('select * from local_quotes where id=$1',[q.id])).rows[0];
    for(const [i,body]of cases.entries()) rejected(await call('/api/quotes/'+q.id,'PATCH',body),'PATCH invalid '+i);
    assert.deepEqual((await pool.query('select * from local_quotes where id=$1',[q.id])).rows[0],before,'invalid PATCH unchanged');
  });
  await check('half-up rounding, fractional quantities, VAT off/0/8/10 and decimal rate',async()=>{
    for(const [name,items,rate,include,subtotal,vat,total]of [
      ['fraction',[{name:'test metres',quantity:1.5,price:100.5}],8,true,151,12,163],
      ['half-up lines',[{name:'test a',quantity:1,price:0.5},{name:'test b',quantity:1,price:0.5}],0,true,2,0,2],
      ['half-up VAT',[{name:'test a',quantity:1,price:5}],10,true,5,1,6],
      ['VAT off',[{name:'test a',quantity:2,price:100000}],8,false,200000,0,200000],
      ['VAT zero',[{name:'test a',quantity:2,price:100000}],0,true,200000,0,200000],
      ['VAT ten',[{name:'test a',quantity:2,price:100000}],10,true,200000,20000,220000],
      ['decimal VAT',[{name:'test a',quantity:1,price:100000}],8.125,true,100000,8125,108125],
      ['zero price valid name',[{name:'test complimentary',quantity:1,price:0}],0,false,0,0,0],
    ]) {
      const q=await quote({items,vat_rate:rate,include_vat:include,customer:{name:'test rounding '+name}});
      assert.equal(q.subtotal,subtotal,name);assert.equal(q.vat_amount,vat,name);assert.equal(q.total_amount,total,name);
      const a=ok(await call('/api/quotes/'+q.id+'/approve','POST',{}));assert.equal(a.order.total_amount,total,name+' approved');
    }
  });
  await check('generic approved-status and direct quote-linked order bypasses are rejected',async()=>{
    rejected(await call('/api/quotes','POST',{...finance,status:'approved',manager_id:manager,quote_number:'test illegal approval',customer:{name:'test illegal approval'}}),'POST approved');
    const q=await quote({...finance,customer:{name:'test bypass'}});
    rejected(await call('/api/quotes/'+q.id,'PATCH',{status:'approved'}),'PATCH approved');
    for(const body of [{quote_id:q.id},{quoteId:q.id},{quote_id:'',quoteId:q.id}]) rejected(await call('/api/orders','POST',{manager_id:manager,customer_id:q.customer_id,items:finance.items,total_amount:1,...body}),'direct linked order');
    assert.equal((await pool.query('select status from local_quotes where id=$1',[q.id])).rows[0].status,'draft');
    assert.equal((await pool.query('select count(*)::int n from local_orders where quote_id=$1',[q.id])).rows[0].n,0);
  });
  await check('quote number persists and customer master is not overwritten by delivery snapshot',async()=>{
    const c=await customer('test snapshot customer','0900888012',manager,{address:'test master address'});
    const q=await quote({...finance,customer_id:c.id,customer:{name:c.name,phone:c.phone,address:'test initial delivery'},quote_data:{customerAddress:'test initial delivery',payment1:0,payment2:0}});
    const number='TEST-RENAME-'+randomUUID();
    const updated=ok(await call('/api/quotes/'+q.id,'PATCH',{quote_number:number,customer_id:c.id,customer:{name:c.name,phone:c.phone,address:'test changed delivery'},quote_data:{customerAddress:'test changed delivery',payment1:0,payment2:0}}));
    assert.equal(updated.quote_number,number);assert.equal(updated.customer_id,c.id);
    assert.equal((await pool.query('select quote_number from local_quotes where id=$1',[q.id])).rows[0].quote_number,number);
    assert.equal((await pool.query('select address from local_customers where id=$1',[c.id])).rows[0].address,'test master address');
  });
  await check('durable create idempotency survives concurrency and rejects payload mismatch',async()=>{
    const body={...finance,manager_id:manager,quote_number:'TEST-RETRY-'+randomUUID(),idempotency_key:randomUUID(),customer:{name:'test retry customer',phone:'0900888013'}};
    const results=await Promise.all(Array.from({length:6},()=>call('/api/quotes','POST',body)));
    results.forEach(r=>assert.ok([200,201].includes(r.status),JSON.stringify(r.body)));
    assert.equal(new Set(results.map(r=>r.body.id)).size,1);const id=results[0].body.id;
    assert.equal((await pool.query('select count(*)::int n from local_quotes where quote_number=$1',[body.quote_number])).rows[0].n,1);
    assert.equal((await pool.query('select count(*)::int n from local_customers where name=$1',[body.customer.name])).rows[0].n,1);
    assert.equal((await call('/api/quotes','POST',{...body,quote_number:'TEST-DIFFERENT'})).status,409);
    assert.ok(!JSON.stringify(results[0].body).includes('__local_create_receipt'),'internal receipt hidden');
    const replay=await call('/api/quotes','POST',body);assert.equal(replay.body.id,id);
    const reordered=Object.fromEntries(Object.entries(body).reverse());const logicalReplay=await call('/api/quotes','POST',reordered);assert.ok([200,201].includes(logicalReplay.status),JSON.stringify(logicalReplay.body));assert.equal(logicalReplay.body.id,id);
    ok(await call('/api/quotes/'+id,'PATCH',{notes:'test user edited after create'}));
    const replayAfterEdit=await call('/api/quotes','POST',body);assert.equal(replayAfterEdit.body.id,id);
    const copy=ok(await call('/api/quotes','POST',{...body,idempotency_key:randomUUID(),quote_number:'TEST-COPY-'+randomUUID()}),201);assert.notEqual(copy.id,id);
  });
  await check('invalid historical finance fails new approval without rewriting history',async()=>{
    const q=await legacyQuote('test invalid legacy');
    await pool.query("update local_quotes set items='[]',subtotal=0,total_amount=123456 where id=$1",[q.id]);
    const before=(await pool.query('select * from local_quotes where id=$1',[q.id])).rows[0];
    assert.equal((await call('/api/quotes/'+q.id+'/approve','POST',{})).status,409);
    assert.deepEqual((await pool.query('select * from local_quotes where id=$1',[q.id])).rows[0],before);
    assert.equal((await pool.query('select count(*)::int n from local_orders where quote_id=$1',[q.id])).rows[0].n,0);
    for(const change of ['total_amount=1',"total_amount='NaN'",'vat_amount=-1','vat_rate=101',"items='[{\"name\":\"test old wrong qty\",\"quantity\":-1,\"price\":123456}]'"]){
      const legacy=await legacyQuote('test invalid finance '+randomUUID());await pool.query('update local_quotes set '+change+' where id=$1',[legacy.id]);
      const saved=(await pool.query('select * from local_quotes where id=$1',[legacy.id])).rows[0];assert.equal((await call('/api/quotes/'+legacy.id+'/approve','POST',{})).status,409,change);assert.deepEqual((await pool.query('select * from local_quotes where id=$1',[legacy.id])).rows[0],saved);
    }
  });
  await check('quote module and owner scoping on primary and legacy read/write paths',async()=>{
    const fixturePassword='QuoteScopeFixtureOnly!222',fixtureSalt=randomBytes(16).toString('hex'),fixtureHash='scrypt$'+fixtureSalt+'$'+scryptSync(fixturePassword,fixtureSalt,64).toString('hex');
    const employee=randomUUID(),withoutRights=randomUUID(),administrator=randomUUID();const managerToken=token;
    for(const[id,email,roleName]of [[otherManager,'other-fixture@invalid.test','manager'],[employee,'employee-fixture@invalid.test','employee'],[withoutRights,'denied-fixture@invalid.test','employee'],[administrator,'admin-fixture@invalid.test','admin']]) {
      await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,email,fixtureHash]);
      await pool.query('insert into local_user_roles(user_id,role,assigned_by)values($1,$2,$3)',[id,roleName,roleName==='employee'?manager:null]);
    }
    await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'quotes',true)",[employee]);
    const own=await quote({...finance,customer:{name:'test protected owner'},quote_data:{private:'test owner secret'}});
    token=ok(await call('/api/local-auth/login','POST',{email:'other-fixture@invalid.test',password:fixturePassword})).token;
    const foreign=await quote({...finance,manager_id:otherManager,customer:{name:'test other owner'}});
    const assertNoForeign=async(q,owner)=>{
      const list=await call('/api/quotes?managerId='+owner);assert.ok([200,403].includes(list.status));if(list.status===200)assert.ok(!list.body.some(r=>r.id===q.id),'list leak');
      const stats=await call('/api/quotes/stats?managerId='+owner);assert.ok([200,403].includes(stats.status));if(stats.status===200)assert.equal(stats.body.total,0,'stats foreign scope');
      const rpc=await call('/api/local-rpc/get_quote_stats','POST',{p_manager_id:owner});assert.ok([200,403].includes(rpc.status));if(rpc.status===200){const data=rpc.body.data??rpc.body;const row=Array.isArray(data)?data[0]:data;assert.ok(row&&Object.hasOwn(row,'total'),'stats DTO present');assert.equal(Number(row.total),0,'legacy stats leak');}
      denied(await call('/api/quotes/'+q.id+'/quote-data'),'quote-data');
      denied(await call('/api/quotes/'+q.id,'PATCH',{notes:'test unauthorized edit'}),'PATCH');
      denied(await call('/api/quotes/'+q.id+'/approve','POST',{}),'approve');
      denied(await call('/api/quotes/'+q.id,'DELETE'),'DELETE');
      denied(await call('/api/quotes','POST',{...finance,manager_id:owner,quote_number:'test forged '+randomUUID(),customer_id:q.customer_id}),'forged create');
      const detail=await call('/api/customers/'+q.customer_id);assert.ok([200,403,404].includes(detail.status));if(detail.status===200)assert.ok(!(detail.body.quotes||[]).some(r=>r.id===q.id),'embedded customer quote leak');
      const snapshot=await call('/api/local-snapshot/quotes');assert.ok([200,403,404].includes(snapshot.status));if(snapshot.status===200)assert.ok(!JSON.stringify(snapshot.body).includes(q.id),'snapshot leak');
    };
    await assertNoForeign(own,manager);
    token=ok(await call('/api/local-auth/login','POST',{email:'denied-fixture@invalid.test',password:fixturePassword})).token;
    assert.equal((await call('/api/quotes')).status,403);assert.equal((await call('/api/quotes','POST',{...finance,quote_number:'test denied',customer:{name:'test denied'}})).status,403);
    token=ok(await call('/api/local-auth/login','POST',{email:'employee-fixture@invalid.test',password:fixturePassword})).token;
    assert.ok(ok(await call('/api/quotes')).some(q=>q.id===own.id),'same team visible');
    assert.equal((await call('/api/quotes/'+own.id+'/approve','POST',{})).status,403);
    rejected(await call('/api/quotes/'+own.id,'PATCH',{status:'approved'}),'employee cannot status bypass');
    ok(await call('/api/quotes/'+own.id,'PATCH',{notes:'test same team edit'}));
    await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'quote_approval',true)",[employee]);
    await assertNoForeign(foreign,otherManager);
    ok(await call('/api/quotes/'+own.id+'/approve','POST',{}));
    token=ok(await call('/api/local-auth/login','POST',{email:'admin-fixture@invalid.test',password:fixturePassword})).token;
    assert.ok(ok(await call('/api/quotes?managerId='+manager)).some(q=>q.id===own.id),'admin manager filter');
    assert.ok(ok(await call('/api/quotes')).some(q=>q.id===foreign.id),'admin all owners');
    token=managerToken;
  });
  console.log('SALES QUOTE FIXES: strict assertions passed; no operational records touched.');
`;
assert.ok(source.includes('console.log(`QUOTE CUSTOMER API:'), 'baseline insertion point');
source = source.replace('  console.log(`QUOTE CUSTOMER API:', () => extension + '\n  console.log(`QUOTE CUSTOMER API:');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
await new AsyncFunction('assert','spawn','spawnSync','once','createServer','randomBytes','randomUUID','scryptSync','pg','repo','systemEnvironment',source)(assert,spawn,spawnSync,once,createServer,randomBytes,randomUUID,scryptSync,pg,repo,systemEnvironment);
