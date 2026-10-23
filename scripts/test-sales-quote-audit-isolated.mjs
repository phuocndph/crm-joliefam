// Audit-only extension of the existing disposable customer regression harness.
// Reads test source only, starts current TypeScript API, and never reads .env.
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
  .replace("throw new Error('QA API exited')", "throw new Error('QA API exited: ' + logs.replaceAll(secret, '[fixture secret]'))");
// The isolated API process cannot issue HTTP fetches or establish a non-loopback socket.
source = source.replace('globalThis.fetch=async()=>{throw new Error("QA denies hosted requests")};',
  'import net from "node:net";const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const value=args[0];const options=typeof value==="object"?value:{host:typeof args[1]==="string"?args[1]:"localhost"};if(options.host&&!new Set(["127.0.0.1","localhost","::1"]).has(options.host))throw new Error("QA denies non-loopback sockets");return connect.apply(this,args)};globalThis.fetch=async()=>{throw new Error("QA denies hosted requests")};');

const auditExtension = String.raw`
  const observations = [];
  const observe = (name, value) => { observations.push({ name, ...value }); console.log('OBSERVATION ' + JSON.stringify({ name, ...value })); };
  const finance = { subtotal: 200000, vat_rate: 8, vat_amount: 16000, include_vat: true, total_amount: 216000,
    items: [{ id: 'qa-item', name: 'test sản phẩm', quantity: 2, price: 100000, total: 200000 }],
    quote_data: { customerName: 'test tài chính', payment1: 50000, payment2: 30000, includeVAT: true, vatRate: 8 } };
  await check('normal VAT quote saves and approves consistent total and exactly one order', async () => {
    const q = await quote({ ...finance, customer: { name: 'test normal finance', phone: '0900888000' } });
    const a = ok(await call('/api/quotes/' + q.id + '/approve', 'POST', {}));
    assert.equal(q.total_amount, 216000); assert.equal(a.order.total_amount, 216000);
    assert.equal(a.order.items[0].total, 200000);
    const orderPayload = (await pool.query('select to_jsonb(o) payload from local_orders o where id=$1', [a.order.id])).rows[0].payload;
    const snapshotFields = ['subtotal','vat_rate','vat_amount','include_vat'];
    observe('approval financial snapshot fields and response types', {
      quote: Object.fromEntries(snapshotFields.map(field => [field,{value:q[field],type:typeof q[field]}])),
      order: Object.fromEntries(snapshotFields.map(field => [field,{exists:Object.hasOwn(orderPayload,field),value:orderPayload[field]??null,type:typeof orderPayload[field]}])),
      responseTotalType:typeof q.total_amount
    });
    const rows = (await pool.query('select payment_status,total_amount from local_orders where id=$1', [a.order.id])).rows[0];
    const payments = (await pool.query('select payment_amount from local_order_payments where order_id=$1', [a.order.id])).rows;
    const transactions = (await pool.query('select amount,type from local_transactions where order_id=$1', [a.order.id])).rows;
    observe('payment1/payment2 remain quote metadata after approval', { quotePayments: q.quote_data, orderTotal: a.order.total_amount, totalPaid: a.order.total_paid, orderPaymentStatus: rows.payment_status, paymentRows: payments.length, transactionRows: transactions.length });
    const edit = await call('/api/quotes/' + q.id, 'PATCH', { subtotal: 300000, vat_amount: 24000, total_amount: 324000, items: [{ name: 'test changed', quantity: 3, price: 100000, total: 300000 }] });
    const order = (await pool.query('select total_amount,items from local_orders where id=$1', [a.order.id])).rows[0];
    observe('approved quote financial edit', { status: edit.status, quoteStatus: edit.body.status, quoteTotal: edit.body.total_amount, orderTotal: Number(order.total_amount), quoteItems: edit.body.items, orderItems: order.items });
    const replay = ok(await call('/api/quotes/' + q.id + '/approve', 'POST', {}));
    observe('reapproval after approved quote edit', { reused: replay.reused, quoteTotal: replay.quote.total_amount, orderTotal: replay.order.total_amount });
  });
  await check('financial input boundary probes recorded against stored rows', async () => {
    const cases = [
      ['forged low total', { ...finance, total_amount: 1 }],
      ['negative quantity', { ...finance, items: [{name:'test negative qty',quantity:-2,price:100000,total:-200000}], subtotal:-200000,vat_amount:-16000,total_amount:-216000 }],
      ['negative price', { ...finance, items: [{name:'test negative price',quantity:2,price:-100000,total:-200000}], subtotal:-200000,vat_amount:-16000,total_amount:-216000 }],
      ['negative total only', { ...finance, total_amount: -1 }],
      ['quantity NaN string', { ...finance, items: [{name:'test NaN',quantity:'NaN',price:100000,total:200000}] }],
      ['quantity malformed string', { ...finance, items: [{name:'test malformed qty',quantity:'abc',price:100000,total:200000}] }],
      ['items object', { ...finance, items: {name:'test non-array',quantity:2,price:100000,total:200000} }],
      ['items malformed JSON', { ...finance, items: '{bad json' }],
      ['items null', { ...finance, items: null }],
      ['items primitive string', { ...finance, items: '123' }],
      ['VAT over 100', { ...finance, vat_rate: 101, vat_amount: 202000, total_amount: 402000 }],
      ['negative VAT rate', { ...finance, vat_rate: -8, vat_amount: -16000, total_amount: 184000 }],
      ['total NaN string', { ...finance, total_amount: 'NaN' }],
      ['total Infinity string', { ...finance, total_amount: 'Infinity' }],
      ['total malformed string', { ...finance, total_amount: 'abc' }],
      ['empty line name quantity1 price0 total0', { ...finance, items: [{name:'',quantity:1,price:0,total:0}],subtotal:0,vat_amount:0,total_amount:0 }],
    ];
    for (const [name, data] of cases) {
      const result = await call('/api/quotes', 'POST', {quote_number:'test-'+randomUUID(),manager_id:manager,customer:{name:'test boundary '+name},...data});
      const saved = result.status === 201 ? (await pool.query('select total_amount::text total,subtotal::text subtotal,vat_rate::text vat_rate,items from local_quotes where id=$1', [result.body.id])).rows[0] : null;
      let approval = null;
      if (saved && ['forged low total','negative quantity','items object','total NaN string','total Infinity string'].includes(name)) {
        const result2 = await call('/api/quotes/'+result.body.id+'/approve','POST',{});
        const row = result2.body.order ? (await pool.query('select total_amount::text total,items from local_orders where id=$1',[result2.body.order.id])).rows[0] : null;
        approval = { status:result2.status, order:row };
      }
      observe(name, {status:result.status,responseTotal:result.body.total_amount,message:result.body.message,stored:saved,approval});
    }
  });
  await check('PATCH boundary and status transition probes recorded', async () => {
    const q = await quote({...finance,customer:{name:'test patch validation'}});
    const replacementNumber='test replacement '+randomUUID();
    const rename=await call('/api/quotes/'+q.id,'PATCH',{quote_number:replacementNumber});
    observe('PATCH quote_number only', {status:rename.status,requested:replacementNumber,responseNumber:rename.body.quote_number,storedNumber:(await pool.query('select quote_number from local_quotes where id=$1',[q.id])).rows[0].quote_number});
    for (const data of [{total_amount:-100,vat_rate:-5,vat_amount:-10},{items:{name:'test object'}},{items:[null,3,'test']},{total_amount:'NaN'}]) {
      const result = await call('/api/quotes/'+q.id,'PATCH',data);
      observe('PATCH '+JSON.stringify(data),{status:result.status,stored:(await pool.query('select total_amount::text total,vat_rate::text vat_rate,items from local_quotes where id=$1',[q.id])).rows[0]});
    }
    const approvedViaPost = await call('/api/quotes','POST',{...finance,manager_id:manager,quote_number:'test-'+randomUUID(),customer:{name:'test supplied approved'},status:'approved'});
    observe('create with approved status', {status:approvedViaPost.status,quoteStatus:approvedViaPost.body.status,orders:approvedViaPost.body.id?(await pool.query('select count(*)::int n from local_orders where quote_id=$1',[approvedViaPost.body.id])).rows[0].n:null});
    const q2 = await quote({...finance,customer:{name:'test status patch'}});
    const patched = await call('/api/quotes/'+q2.id,'PATCH',{status:'approved'});
    observe('PATCH draft to approved status', {status:patched.status,quoteStatus:patched.body.status,orders:(await pool.query('select count(*)::int n from local_orders where quote_id=$1',[q2.id])).rows[0].n});
  });
  await check('isolated permission and ownership probes recorded', async () => {
    const fixturePassword='QuoteScopeFixtureOnly!222',fixtureSalt=randomBytes(16).toString('hex'),fixtureHash='scrypt$'+fixtureSalt+'$'+scryptSync(fixturePassword,fixtureSalt,64).toString('hex');
    const employee=randomUUID(),denied=randomUUID();
    for (const [id,email,roleName] of [[otherManager,'other-fixture@invalid.test','manager'],[employee,'employee-fixture@invalid.test','employee'],[denied,'denied-fixture@invalid.test','employee']]) {
      await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,email,fixtureHash]);
      await pool.query('insert into local_user_roles(user_id,role,assigned_by)values($1,$2,$3)',[id,roleName,roleName==='employee'?manager:null]);
    }
    await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'quotes',true)",[employee]);
    const own=await quote({...finance,customer:{name:'test ownership'},quote_data:{private:'test fixture quote data'}}),managerToken=token;
    token=ok(await call('/api/local-auth/login','POST',{email:'denied-fixture@invalid.test',password:fixturePassword})).token;
    const deniedRead=await call('/api/quotes'); const deniedWrite=await call('/api/quotes','POST',{manager_id:manager,quote_number:'test denied',customer:{name:'test denied'}});
    assert.equal(deniedRead.status,403);assert.equal(deniedWrite.status,403);observe('employee with no quote permission',{read:deniedRead.status,write:deniedWrite.status});
    token=ok(await call('/api/local-auth/login','POST',{email:'employee-fixture@invalid.test',password:fixturePassword})).token;
    const noApproval=await call('/api/quotes/'+own.id+'/approve','POST',{});assert.equal(noApproval.status,403);observe('employee quote permission without quote_approval',{approve:noApproval.status});
    const bypass=await call('/api/quotes/'+own.id,'PATCH',{status:'approved'});
    observe('employee without quote_approval PATCH own-team draft to approved',{status:bypass.status,quoteStatus:bypass.body.status,orders:(await pool.query('select count(*)::int n from local_orders where quote_id=$1',[own.id])).rows[0].n});
    token=ok(await call('/api/local-auth/login','POST',{email:'other-fixture@invalid.test',password:fixturePassword})).token;
    const read=await call('/api/quotes?managerId='+manager),details=await call('/api/quotes/'+own.id+'/quote-data');
    const patch=await call('/api/quotes/'+own.id,'PATCH',{notes:'test modified by other manager'});
    const approve=await call('/api/quotes/'+own.id+'/approve','POST',{});
    const forged=await call('/api/quotes','POST',{...finance,manager_id:manager,customer_id:own.customer_id,quote_number:'test forged owner '+randomUUID()});
    observe('other manager accesses known quote owned by first manager',{list:read.status,listed:read.body.some(q=>q.id===own.id),quoteData:details.status,patch:patch.status,approve:approve.status,forgedCreate:forged.status,forgedOwner:forged.body.manager_id});
    await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'quote_approval',true)",[employee]);
    token=ok(await call('/api/local-auth/login','POST',{email:'employee-fixture@invalid.test',password:fixturePassword})).token;
    const foreign=await quote({...finance,manager_id:otherManager,customer:{name:'test other team'}});
    const foreignRead=await call('/api/quotes?managerId='+otherManager),foreignPatch=await call('/api/quotes/'+foreign.id,'PATCH',{notes:'test cross team employee'}),foreignApprove=await call('/api/quotes/'+foreign.id+'/approve','POST',{});
    observe('employee assigned manager1 accesses manager2 records',{list:foreignRead.status,listed:foreignRead.body.some(q=>q.id===foreign.id),patch:foreignPatch.status,approve:foreignApprove.status});
    token=managerToken;
  });
  console.log('SALES QUOTE AUDIT: '+observations.length+' observations; source server; disposable database only.');
`;
assert.ok(source.includes('console.log(`QUOTE CUSTOMER API:'), 'expected baseline insertion point');
source = source.replace('  console.log(`QUOTE CUSTOMER API:', () => auditExtension + '\n  console.log(`QUOTE CUSTOMER API:');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
await new AsyncFunction('assert','spawn','spawnSync','once','createServer','randomBytes','randomUUID','scryptSync','pg','repo','systemEnvironment',source)(assert,spawn,spawnSync,once,createServer,randomBytes,randomUUID,scryptSync,pg,repo,systemEnvironment);
