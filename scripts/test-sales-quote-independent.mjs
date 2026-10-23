// Independent tester-only extension. Reuses disposable fixtures and outbound guards.
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
  await check('independent: rejected/expired cannot approve and sent can approve', async()=>{
    for(const status of ['rejected','expired']) {
      const q=await quote({...finance,status,customer:{name:'test closed lifecycle '+status}});
      assert.equal((await call('/api/quotes/'+q.id+'/approve','POST',{})).status,409);
      assert.equal((await pool.query('select count(*)::int n from local_orders where quote_id=$1',[q.id])).rows[0].n,0);
      assert.equal((await pool.query('select status from local_quotes where id=$1',[q.id])).rows[0].status,status);
    }
    const q=await quote({...finance,status:'sent',customer:{name:'test sent lifecycle'}});
    assert.equal(ok(await call('/api/quotes/'+q.id+'/approve','POST',{})).quote.status,'approved');
  });
  await check('independent: approve/edit race preserves exactly one consistent immutable snapshot',async()=>{
    for(let n=0;n<4;n++) {
      const q=await quote({...finance,customer:{name:'test approval edit race '+n}});
      const [edit,approval]=await Promise.all([
        call('/api/quotes/'+q.id,'PATCH',{items:[{name:'test raced product',quantity:3,price:100000}]}),
        call('/api/quotes/'+q.id+'/approve','POST',{})
      ]);
      assert.ok([200,409].includes(edit.status),JSON.stringify(edit));ok(approval);
      const saved=(await pool.query('select * from local_quotes where id=$1',[q.id])).rows[0];
      const orders=(await pool.query('select * from local_orders where quote_id=$1',[q.id])).rows;
      assert.equal(orders.length,1);assert.equal(saved.status,'approved');
      for(const key of ['subtotal','vat_rate','vat_amount','total_amount','include_vat']) assert.equal(orders[0][key],saved[key],key+' race snapshot');
      assert.deepEqual(orders[0].items,saved.items);
      assert.equal(Number(saved.total_amount),edit.status===200?324000:216000);
    }
  });
  await check('independent: malformed retry keys and failed create leave no receipt/customer residue',async()=>{
    const before=(await pool.query('select (select count(*) from local_quotes)::int q,(select count(*) from local_customers)::int c')).rows[0];
    for(const key of ['',1,{},[],null,'not-a-uuid']) rejected(await call('/api/quotes','POST',{...finance,manager_id:manager,quote_number:'TEST-BAD-KEY',idempotency_key:key,customer:{name:'test bad key customer'}}),'malformed retry key');
    assert.deepEqual((await pool.query('select (select count(*) from local_quotes)::int q,(select count(*) from local_customers)::int c')).rows[0],before);
    const key=randomUUID(),body={...finance,manager_id:manager,quote_number:'TEST-FAILED-RETRY',idempotency_key:key,customer:{name:'test failure then retry'}};
    rejected(await call('/api/quotes','POST',{...body,items:[]}),'first invalid attempt');
    const created=ok(await call('/api/quotes','POST',body),201);
    const replay=ok(await call('/api/quotes','POST',body));assert.equal(replay.id,created.id);
    assert.equal((await pool.query('select count(*)::int n from local_customers where name=$1',[body.customer.name])).rows[0].n,1);
  });
  await check('independent: client cannot expose or replace durable create receipt',async()=>{
    const body={...finance,manager_id:manager,quote_number:'TEST-RECEIPT-'+randomUUID(),idempotency_key:randomUUID(),customer:{name:'test receipt protection'}};
    const created=ok(await call('/api/quotes','POST',body),201);
    const before=(await pool.query('select quote_data from local_quotes where id=$1',[created.id])).rows[0].quote_data.__local_create_receipt;
    assert.ok(before.fingerprint);
    const updated=ok(await call('/api/quotes/'+created.id,'PATCH',{quote_data:{__local_create_receipt:{fingerprint:'client cannot replace'}}}));
    assert.ok(!JSON.stringify(updated).includes('__local_create_receipt'));
    assert.deepEqual((await pool.query('select quote_data from local_quotes where id=$1',[created.id])).rows[0].quote_data.__local_create_receipt,before);
    assert.equal(ok(await call('/api/quotes','POST',body)).id,created.id);
    for(const result of [await call('/api/quotes'),await call('/api/quotes/'+created.id+'/quote-data')]) {
      ok(result);assert.ok(!JSON.stringify(result.body).includes('__local_create_receipt'));
    }
  });
`;
assert.ok(source.includes(marker), 'parent suite marker unchanged');
source = source.replace(marker, extra + '\n' + marker)
  .replace(/^import .*;\r?\n/gm, '')
  .replace("const repo = fileURLToPath(new URL('..', import.meta.url));", "const repo = fileURLToPath(new URL('..', " + JSON.stringify(parentUrl.href) + "));")
  .replace("await readFile(new URL('./test-quote-customer-isolated.mjs', import.meta.url), 'utf8')", "await readFile(new URL('./test-quote-customer-isolated.mjs', " + JSON.stringify(parentUrl.href) + "), 'utf8')");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
await new AsyncFunction('assert','spawn','spawnSync','once','createServer','randomBytes','randomUUID','scryptSync','readFile','fileURLToPath','pg',source)(assert,spawn,spawnSync,once,createServer,randomBytes,randomUUID,scryptSync,readFile,fileURLToPath,pg);
