// Disposable API regressions reuse the sanitized OS-only environment, local port 16543,
// and outbound HTTP/socket denial in the existing strict sales quote harness.
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
  await check('phase2: every original snapshot conflict rejects 409 before customer resolution, order creation or replay repair', async()=>{
    const cases=[
      ['audited line total',q=>q.items[0].total=1],
      ['audited nested total',q=>q.quote_data.total=1],
      ['nested remaining',q=>q.quote_data.remaining=1],
      ['audited nested VAT option',q=>q.quote_data.includeVAT=false],
      ['root subtotal',q=>q.subtotal=1],['root VAT amount',q=>q.vat_amount=1],['root total',q=>q.total_amount=1],
      ['nested VAT rate',q=>q.quote_data.vatRate=10],['nested item count',q=>q.quote_data.items=[]],
      ['nested item quantity',q=>q.quote_data.items[0].quantity=3],['nested item price',q=>q.quote_data.items[0].price=1],
      ['nested item total',q=>q.quote_data.items[0].total=1],['nested items shape',q=>q.quote_data.items={}],
    ];
    const snapshot=async()=>{
      const result={};for(const table of ['local_quotes','local_customers','local_orders'])result[table]=(await pool.query('select coalesce(jsonb_agg(to_jsonb(t) order by t.id),\'[]\'::jsonb) payload from '+table+' t')).rows[0].payload;return result;
    };
    for(const [label,mutate]of cases)for(const replay of [false,true]){
      const q=await quote({...finance,customer:{name:'test phase2 conflict '+label+' '+replay}});
      if(replay)ok(await call('/api/quotes/'+q.id+'/approve','POST',{}));
      const row=(await pool.query('select * from local_quotes where id=$1',[q.id])).rows[0];
      mutate(row);
      // Missing links would otherwise create/repair a customer/order before validation.
      row.quote_data.customerName='test unresolved phase2 '+randomUUID();
      await pool.query('update local_quotes set customer_id=null,subtotal=$2,vat_amount=$3,total_amount=$4,items=$5::jsonb,quote_data=$6::jsonb where id=$1',[q.id,row.subtotal,row.vat_amount,row.total_amount,JSON.stringify(row.items),JSON.stringify(row.quote_data)]);
      if(replay)await pool.query('update local_orders set customer_id=null where quote_id=$1',[q.id]);
      const before=await snapshot();
      const result=await call('/api/quotes/'+q.id+'/approve','POST',{});
      assert.equal(result.status,409,label+' replay='+replay+': '+JSON.stringify(result));
      assert.match(result.body.message,/sửa bản nháp|nhân bản/);
      assert.deepEqual(await snapshot(),before,label+' has no quote/customer/order writes');
    }
  });
  await check('phase2: signed and fractional planned balances accept exact and persisted canonical remainder on first approval and replay',async()=>{
    for(const [total,payment1,payment2,exact]of [[1,.7,.2,'0.1'],[1,1.2,.3,'-0.5'],[200000,50000.123456,30000.654321,'119999.222223'],[1,.1,.2,'0.7'],[1,.9,.1,'0']])for(const variant of ['canonical','string','exact']){
      const q=await quote({items:[{name:'test phase2 remaining',quantity:1,price:total}],include_vat:false,vat_rate:0,quote_data:{payment1,payment2},customer:{name:'test phase2 remaining '+randomUUID()}});
      const remaining=variant==='canonical'?q.quote_data.remaining:variant==='string'?String(q.quote_data.remaining):exact;
      await pool.query("update local_quotes set quote_data=jsonb_set(quote_data,'{remaining}',$2::jsonb) where id=$1",[q.id,JSON.stringify(remaining)]);
      const first=ok(await call('/api/quotes/'+q.id+'/approve','POST',{}));const replay=ok(await call('/api/quotes/'+q.id+'/approve','POST',{}));
      assert.equal(replay.order.id,first.order.id);assert.equal(replay.reused,true);assert.equal(replay.order.total_amount,total);
      assert.equal((await pool.query('select count(*)::int n from local_orders where quote_id=$1',[q.id])).rows[0].n,1);
    }
  });
  await check('phase2: equivalent decimal snapshots, fractional quantity, VAT zero/custom rate approve and replay one order',async()=>{
    for(const [name,items,rate]of [['fraction',[{name:'test phase2 metres',quantity:1.5,price:100.5}],8],['zero VAT',[{name:'test phase2 VAT zero',quantity:2,price:100000}],0],['custom VAT',[{name:'test phase2 custom',quantity:1,price:100000}],8.125]]){
      const q=await quote({items,include_vat:true,vat_rate:rate,customer:{name:'test phase2 valid '+name}});
      const raw=(await pool.query('select * from local_quotes where id=$1',[q.id])).rows[0];
      for(const line of [...raw.items,...raw.quote_data.items])for(const field of ['quantity','price','total'])line[field]=Number(line[field]).toFixed(3);
      for(const field of ['subtotal','vatRate','vatAmount','total','totalAmount'])raw.quote_data[field]=String(raw.quote_data[field]);
      await pool.query('update local_quotes set items=$2::jsonb,quote_data=$3::jsonb where id=$1',[q.id,JSON.stringify(raw.items),JSON.stringify(raw.quote_data)]);
      const first=ok(await call('/api/quotes/'+q.id+'/approve','POST',{}));
      const before=(await pool.query('select * from local_orders where quote_id=$1',[q.id])).rows;
      const replay=ok(await call('/api/quotes/'+q.id+'/approve','POST',{}));
      assert.equal(replay.reused,true);assert.equal(replay.order.id,first.order.id);assert.equal(replay.order.total_amount,q.total_amount);
      assert.deepEqual((await pool.query('select * from local_orders where quote_id=$1',[q.id])).rows,before,'valid replay leaves order snapshot unchanged');
      assert.equal(before.length,1);
    }
  });
`;
assert.ok(source.includes(marker), 'strict parent suite marker unchanged');
source = source.replace(marker, extra + '\n' + marker)
  .replace(/^import .*;\r?\n/gm, '')
  .replace("const repo = fileURLToPath(new URL('..', import.meta.url));", "const repo = fileURLToPath(new URL('..', " + JSON.stringify(parentUrl.href) + "));")
  .replace("await readFile(new URL('./test-quote-customer-isolated.mjs', import.meta.url), 'utf8')", "await readFile(new URL('./test-quote-customer-isolated.mjs', " + JSON.stringify(parentUrl.href) + "), 'utf8')");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
await new AsyncFunction('assert','spawn','spawnSync','once','createServer','randomBytes','randomUUID','scryptSync','readFile','fileURLToPath','pg',source)(assert,spawn,spawnSync,once,createServer,randomBytes,randomUUID,scryptSync,readFile,fileURLToPath,pg);
