// Independent customer UX/API regressions. Disposable PostgreSQL only; no .env or provider calls.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const parentUrl = new URL('./test-sales-quote-fixes-isolated.mjs', import.meta.url);
let source = await readFile(parentUrl, 'utf8');
const marker = "  console.log('SALES QUOTE FIXES: strict assertions passed; no operational records touched.');";
const extra = String.raw`
  const safeCandidateKeys = ['address','email','id','is_active','name','phone'];
  const candidateShape = row => assert.deepEqual(Object.keys(row).sort(), safeCandidateKeys, 'bounded customer candidate DTO');
  await check('independent customer: selected identity survives contact/delivery snapshot changes without master changes',async()=>{
    const c=await customer('test selected stable contact','0907310001',manager,{email:'old-selected@qa.invalid',address:'old delivery'});
    const before=(await pool.query('select * from local_customers where id=$1',[c.id])).rows[0];
    const q=await quote({customer_id:c.id,customer:{name:c.name,phone:'0907310002',email:'snapshot@qa.invalid',address:'new delivery'},quote_data:{customerName:c.name,customerPhone:'0907310002',customerEmail:'snapshot@qa.invalid',customerAddress:'new delivery'}});
    const saved=ok(await call('/api/quotes/'+q.id,'PATCH',{customer_id:c.id,customer:{name:c.name,phone:'',email:'second-snapshot@qa.invalid',address:'other delivery'},quote_data:{customerPhone:'',customerEmail:'second-snapshot@qa.invalid',customerAddress:'other delivery'}}));
    assert.equal(saved.customer_id,c.id);assert.equal(saved.quote_data.customerPhone,'');assert.equal(saved.quote_data.customerAddress,'other delivery');
    assert.deepEqual((await pool.query('select * from local_customers where id=$1',[c.id])).rows[0],before,'customer master untouched');
  });
  await check('independent customer: address snapshot and VN phone prefix changes resolve one canonical ID',async()=>{
    const c=await customer('test prefix delivery','0907310003',manager,{address:'master delivery'});
    const before=(await pool.query('select * from local_customers where id=$1',[c.id])).rows[0];
    for(const phone of ['+84 907 310 003','0084 907 310 003','0907.310.003']){
      const q=await quote({customer:{name:' test  prefix delivery ',phone,address:'different delivery each quote'}});
      assert.equal(q.customer_id,c.id,'VN phone canonical match');
    }
    assert.deepEqual((await pool.query('select * from local_customers where id=$1',[c.id])).rows[0],before,'auto match never edits master');
  });
  await check('independent customer: first contact reuse and distinct same-name contacts are explicit canonical results',async()=>{
    const c=await customer('test first contact only');
    const first=await quote({customer:{name:c.name,phone:'0907310004',address:'new delivery'}});assert.equal(first.customer_id,c.id);
    assert.equal((await pool.query('select phone from local_customers where id=$1',[c.id])).rows[0].phone,null,'first contact remains quote snapshot');
    const old=await customer('test same-name different person','0907310005');
    const fresh=await quote({customer:{name:old.name,phone:'0907310006'}});assert.notEqual(fresh.customer_id,old.id);
    const repeated=await quote({customer:{name:old.name,phone:'+84907310006'}});assert.equal(repeated.customer_id,fresh.customer_id);
  });
  await check('independent customer: contradictory contact collision returns scoped precise DTO and leaves no writes',async()=>{
    const a=await customer('test bounded first','0907310007',manager,{email:'first@qa.invalid'});
    const b=await customer('test bounded second','0907310008',manager,{email:'second@qa.invalid'});
    const foreign=await customer('test bounded hidden','0907310007',otherManager,{email:'second@qa.invalid'});
    await pool.query('update local_customers set notes=$2,company=$3 where id=any($1::text[])',[[a.id,b.id,foreign.id],'private candidate notes','private company']);
    const before=(await pool.query('select (select count(*) from local_quotes)::int q,(select count(*) from local_customers)::int c')).rows[0];
    const response=await call('/api/quotes','POST',{...finance,manager_id:manager,quote_number:'TEST-CONTACT-COLLISION',customer:{name:a.name,phone:a.phone,email:'second@qa.invalid'}});
    assert.equal(response.status,409);assert.equal(response.body.code,'QUOTE_CUSTOMER_CONFLICT');assert.equal(typeof response.body.message,'string');
    assert.deepEqual(new Set(response.body.candidates.map(row=>row.id)),new Set([a.id,b.id]));response.body.candidates.forEach(candidateShape);
    assert.ok(!JSON.stringify(response.body).includes('private'));assert.ok(!JSON.stringify(response.body).includes(foreign.id));
    assert.deepEqual((await pool.query('select (select count(*) from local_quotes)::int q,(select count(*) from local_customers)::int c')).rows[0],before,'conflict atomic rollback');
    const chosen=await quote({customer_id:a.id,customer:{name:a.name,phone:a.phone,email:'second@qa.invalid',address:'keep snapshot'}});assert.equal(chosen.customer_id,a.id);
  });
  await check('independent customer: suggestions search address/normalized phone, show inactive, cap DTO and enforce scope',async()=>{
    const c=await customer('test suggestions visible','+84 907 310 009',manager,{address:'independent address needle'});
    const hidden=await customer('test suggestions hidden','0907310009',otherManager,{address:'independent address needle'});
    const inactive=await customer('test suggestions inactive','0907310010',manager,{address:'independent address needle'});
    await pool.query('update local_customers set is_active=false where id=$1',[inactive.id]);
    const byAddress=ok(await call('/api/quotes/customer-suggestions?search='+encodeURIComponent('independent address needle')));
    assert.deepEqual(new Set(byAddress.map(row=>row.id)),new Set([c.id,inactive.id]));byAddress.forEach(candidateShape);
    assert.equal(byAddress.find(row=>row.id===inactive.id).is_active,false);assert.ok(!byAddress.some(row=>row.id===hidden.id));
    assert.ok(ok(await call('/api/quotes/customer-suggestions?search='+encodeURIComponent('0907310009'))).some(row=>row.id===c.id));
    assert.deepEqual(ok(await call('/api/quotes/customer-suggestions?search='+encodeURIComponent('%_'))),[],'search terms are literal, not SQL wildcard');
    assert.equal((await call('/api/quotes/customer-suggestions?search=test&managerId='+otherManager)).status,403);
    assert.deepEqual(ok(await call('/api/quotes/customer-suggestions?search=x')),[]);
    for(let n=0;n<24;n++)await customer('test capped suggestions '+n,'09900'+String(n).padStart(5,'0'));
    const capped=ok(await call('/api/quotes/customer-suggestions?search='+encodeURIComponent('test capped suggestions')));assert.equal(capped.length,20);capped.forEach(candidateShape);
  });
  await check('independent customer: admin edit suggestions use persisted owner including null and ignore conflicting requested owner',async()=>{
    const password='AdminCustomerFixture!111',salt=randomBytes(16).toString('hex'),hash='scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex'),admin=randomUUID();
    await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[admin,'customer-admin-independent@invalid.test',hash]);
    await pool.query("insert into local_user_roles(user_id,role)values($1,'admin')",[admin]);
    const own=await customer('test admin persisted owner','0907310011',manager),outside=await customer('test admin persisted owner','0907310012',otherManager),unassigned=await customer('test admin null owner','0907310013',null);
    const q=await quote({customer_id:own.id,customer:{name:own.name,phone:own.phone}}),nullQuote=await legacyQuote(unassigned.name,unassigned.phone,null);
    const previousToken=token;
    try{
      token=ok(await call('/api/local-auth/login','POST',{email:'customer-admin-independent@invalid.test',password})).token;
      const rows=ok(await call('/api/quotes/customer-suggestions?quoteId='+q.id+'&managerId='+otherManager+'&search='+encodeURIComponent('test admin persisted owner')));
      assert.deepEqual(rows.map(row=>row.id),[own.id]);assert.ok(!rows.some(row=>row.id===outside.id));
      const nullRows=ok(await call('/api/quotes/customer-suggestions?quoteId='+nullQuote.id+'&search='+encodeURIComponent('test admin null owner')));assert.deepEqual(nullRows.map(row=>row.id),[unassigned.id]);
      assert.equal((await call('/api/quotes/customer-suggestions?quoteId='+randomUUID()+'&search=test')).status,404);
    }finally{token=previousToken;}
    assert.equal((await call('/api/quotes','POST',{...finance,manager_id:manager,quote_number:'TEST-FOREIGN-CUSTOMER-INDEPENDENT',customer_id:outside.id,customer:{name:outside.name,phone:outside.phone}})).status,403);
  });
  await check('independent customer: normalized concurrent creates deduplicate while preserving contact snapshots',async()=>{
    const results=await Promise.all(Array.from({length:8},(_,n)=>quote({customer:{name:'test independent concurrent same-name',phone:n%2?'+84907310014':'090 731 0014',address:'independent delivery '+n}})));
    assert.equal(new Set(results.map(row=>row.customer_id)).size,1);
    const rows=(await pool.query('select * from local_customers where name=$1',['test independent concurrent same-name'])).rows;assert.equal(rows.length,1);
  });
  console.log('INDEPENDENT CUSTOMER UX: 7 additional boundary groups passed.');
`;
assert.ok(source.includes(marker), 'parent suite insertion point unchanged');
source = source.replace(marker, () => extra + '\n' + marker)
  .replace(/^import .*;\r?\n/gm, '')
  .replace("const repo = fileURLToPath(new URL('..', import.meta.url));", "const repo = fileURLToPath(new URL('..', " + JSON.stringify(parentUrl.href) + "));")
  .replace("await readFile(new URL('./test-quote-customer-isolated.mjs', import.meta.url), 'utf8')", "await readFile(new URL('./test-quote-customer-isolated.mjs', " + JSON.stringify(parentUrl.href) + "), 'utf8')");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
await new AsyncFunction('assert','spawn','spawnSync','once','createServer','randomBytes','randomUUID','scryptSync','readFile','fileURLToPath','pg',source)(assert,spawn,spawnSync,once,createServer,randomBytes,randomUUID,scryptSync,readFile,fileURLToPath,pg);
