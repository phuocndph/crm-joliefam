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


// The unrelated order-list GHN import regression is outside this focused suite.
// Keep legacy approve, null relationship, concurrency and rollback checks.
const historicalStart = source.indexOf("  await check('historical display uses only");
const historicalEnd = source.indexOf("  await check('order insert failure", historicalStart);
assert.ok(historicalStart > 0 && historicalEnd > historicalStart);
source = source.slice(0, historicalStart) + source.slice(historicalEnd);
const extension = String.raw`
  await check('delivery address changes and standard VN phone/name formats resolve the existing customer', async()=>{
    const c=await customer('Nguyễn Hồng UX','0901234567',manager,{email:'Hong@fixture.invalid',address:'Master address'});
    const before=(await pool.query('select * from local_customers where id=$1',[c.id])).rows;
    for(const phone of ['+84 901.234.567','0084-901-234-567','0901 234 567']) {
      const q=await quote({customer:{name:'  '+c.name.normalize('NFD')+'  ',phone,email:'hong@fixture.invalid',address:'Other delivery address'}});
      assert.equal(q.customer_id,c.id);
    }
    assert.deepEqual((await pool.query('select * from local_customers where id=$1',[c.id])).rows,before);
  });
  await check('first contact links unique same-name master; truly distinct strong contact may create another person',async()=>{
    const c=await customer('First contact UX');
    assert.equal((await quote({customer:{name:c.name,phone:'0901234568',address:'Delivery'}})).customer_id,c.id);
    const old=await customer('Same name separate UX','0901234569');
    const another=await quote({customer:{name:old.name,phone:'0901234570'}});assert.notEqual(another.customer_id,old.id);
    assert.equal((await pool.query('select count(*)::int n from local_customers where name=$1',[old.name])).rows[0].n,2);
    assert.equal((await pool.query('select phone from local_customers where id=$1',[c.id])).rows[0].phone,null,'master is not populated from quote snapshot');
  });
  await check('explicit selection accepts quote-only contact snapshots and historical inactive links',async()=>{
    const c=await customer('Selected snapshot UX','0901234571',manager,{email:'master@fixture.invalid'});
    const before=(await pool.query('select * from local_customers where id=$1',[c.id])).rows;
    const q=await quote({customer_id:c.id,customer:{name:c.name,phone:'0901234599',email:'delivery@fixture.invalid',address:'Other delivery'}});
    assert.equal(q.customer_id,c.id);assert.deepEqual((await pool.query('select * from local_customers where id=$1',[c.id])).rows,before);
    await pool.query('update local_customers set is_active=false where id=$1',[c.id]);
    assert.equal(ok(await call('/api/quotes/'+q.id,'PATCH',{customer_id:null,notes:'legacy null patch'})).customer_id,c.id);
    assert.equal((await quote({customer_id:c.id,customer:{name:c.name}})).customer_id,c.id,'deliberate inactive selection preserves existing policy');
    const collision=await call('/api/quotes','POST',{quote_number:randomUUID(),manager_id:manager,customer:{name:c.name,phone:c.phone}});
    assert.equal(collision.status,409);assert.equal(collision.body.code,'QUOTE_CUSTOMER_CONFLICT');assert.equal(collision.body.candidates[0].is_active,false);
  });
  await check('genuine conflicts return bounded same-owner public DTO and preserve save rollback',async()=>{
    const own=[];for(let n=0;n<23;n++)own.push(await customer('Bounded duplicate UX','0901234572'));
    const foreign=await customer('Bounded duplicate UX','0901234572',otherManager);
    const before=(await pool.query('select count(*)::int n from local_quotes')).rows[0].n;
    const r=await call('/api/quotes','POST',{quote_number:randomUUID(),manager_id:manager,customer:{name:'Bounded duplicate UX',phone:'+84 901234572'}});
    assert.equal(r.status,409);assert.equal(r.body.code,'QUOTE_CUSTOMER_CONFLICT');assert.equal(r.body.candidates.length,20);
    assert.ok(!r.body.candidates.some(c=>c.id===foreign.id));
    for(const c of r.body.candidates)assert.deepEqual(Object.keys(c).sort(),['id','name','phone','email','address','is_active'].sort());
    assert.equal((await pool.query('select count(*)::int n from local_quotes')).rows[0].n,before);
    const picked=await quote({customer_id:r.body.candidates[0].id,customer:{name:'Bounded duplicate UX',phone:'Other delivery phone'}});assert.ok(picked.customer_id);
  });
  await check('quote suggestions support name phone email address with exact canonical owner and persisted editing owner',async()=>{
    const own=await customer('Suggestion owner UX','0901234573',manager,{email:'own-suggestion@fixture.invalid',address:'Distinct lookup address UX'});
    const foreign=await customer(own.name,own.phone,otherManager,{email:own.email,address:own.address});
    for(const search of ['Suggestion owner UX','+84 901234573','own-suggestion@fixture.invalid','Distinct lookup address UX']){
      const rows=ok(await call('/api/quotes/customer-suggestions?search='+encodeURIComponent(search)));
      assert.ok(rows.some(c=>c.id===own.id),search);assert.ok(!rows.some(c=>c.id===foreign.id));assert.ok(rows.length<=20);
    }
    assert.equal((await call('/api/quotes/customer-suggestions?search=UX&managerId='+otherManager)).status,403);
    const q=await quote({customer_id:own.id});
    assert.ok(ok(await call('/api/quotes/customer-suggestions?search=Suggestion&quoteId='+q.id+'&managerId='+otherManager)).some(c=>c.id===own.id),'editing owner comes from saved quote');
    const foreignQuote=(await pool.query("insert into local_quotes(id,quote_number,manager_id,status)values($1,$2,$3,'draft')returning id",[randomUUID(),randomUUID(),otherManager])).rows[0];
    assert.equal((await call('/api/quotes/customer-suggestions?search=UX&quoteId='+foreignQuote.id)).status,403);
    const managerToken=token,password='QuoteLookupOnly!222',salt=randomBytes(16).toString('hex'),hash='scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex');
    for(const actorRole of ['employee','accountant','admin']){
      const actor=randomUUID(),email=actorRole+'-lookup@fixture.invalid';
      await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[actor,email,hash]);
      await pool.query('insert into local_user_roles(user_id,role,assigned_by)values($1,$2,$3)',[actor,actorRole,actorRole==='admin'?null:manager]);
      if(actorRole!=='admin')await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'quotes',true)",[actor]);
      token=ok(await call('/api/local-auth/login','POST',{email,password})).token;
      const rows=ok(await call('/api/quotes/customer-suggestions?search=Suggestion&managerId='+manager));assert.ok(rows.some(c=>c.id===own.id));assert.ok(!rows.some(c=>c.id===foreign.id));
      if(actorRole==='admin'){
        const editing=ok(await call('/api/quotes/customer-suggestions?search=Suggestion&quoteId='+q.id+'&managerId='+otherManager));assert.ok(editing.some(c=>c.id===own.id));assert.ok(!editing.some(c=>c.id===foreign.id));
        const ownAdmin=ok(await call('/api/quotes/customer-suggestions?search=Suggestion'));assert.equal(ownAdmin.length,0,'admin creation defaults exact actor, not global customers');
      }
    }
    token=managerToken;
  });
  console.log('QUOTE CUSTOMER UX focused checks passed; disposable data only.');
`;
assert.ok(source.includes('  console.log(`QUOTE CUSTOMER API:'),'baseline marker');
source=source.replace('  console.log(`QUOTE CUSTOMER API:',()=>extension+'\n  console.log(`QUOTE CUSTOMER API:');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
await new AsyncFunction('assert','spawn','spawnSync','once','createServer','randomBytes','randomUUID','scryptSync','pg','repo','systemEnvironment',source)(assert,spawn,spawnSync,once,createServer,randomBytes,randomUUID,scryptSync,pg,repo,systemEnvironment);
