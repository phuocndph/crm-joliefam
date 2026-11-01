// Independent verification: isolated NOSUPERUSER database and actual HTTP only.
// This never loads an env file or contacts a hosted database/provider.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,scryptSync,createHash} from 'node:crypto';
import {once} from 'node:events';
import {createServer,request as httpRequest} from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import pg from 'pg';
import {testZcrmFixedRoutes} from './test-zcrm-fixes-routes.mjs';

const repo=fileURLToPath(new URL('..',import.meta.url));
const out=path.resolve(repo,'../outputs/zcrm-fixes-20261029/independent');
const suffix=process.pid+'_'+Date.now(),database='zcrm_fixes_'+suffix,role='zcrm_fixes_role_'+suffix;
const password='FixtureOnly!'+randomBytes(24).toString('hex'),loginPassword='FixtureLogin!'+randomBytes(20).toString('hex');
const connectionString='postgres://'+role+':'+encodeURIComponent(password)+'@127.0.0.1:16543/'+database;
const master=randomBytes(32).toString('hex');
let child,pool,base,token,serviceToken,storage,created=false,logs='',sourceManifest,session,runStatus='failed',runError;
const passed=[],failed=[],expectedOrders=new Map(),scenarioOrders={},secrets=[password,loginPassword,master];
const actors={};
const ids={admin:randomUUID(),manager:randomUUID(),other:randomUUID(),customer:randomUUID(),product:randomUUID()};
function control(sql){const r=spawnSync('docker',['exec','crm-joliefam-local-postgres','psql','-U','crm_local','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',sql],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error('Fixture database administration failed; no production fallback.');return r.stdout;}
async function verifyManifest(){if(!sourceManifest)return;for(const item of sourceManifest)assert.equal(createHash('sha256').update(await readFile(path.join(repo,item.path))).digest('hex'),item.sha256,item.path);}
const call=(route,method='GET',body,credential=token,extraHeaders={})=>new Promise((resolve,reject)=>{const headers={host:'crm.example.com',...(credential?{authorization:'Bearer '+credential}:{}),...(body===undefined?{}:{'content-type':'application/json'}),...extraHeaders};const req=httpRequest(base+route,{method,headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{let body;try{body=JSON.parse(Buffer.concat(chunks));}catch{}resolve({status:res.statusCode,body});});});req.setTimeout(20000,()=>req.destroy(new Error('Fixture HTTP deadline')));req.on('error',reject);if(body!==undefined)req.write(JSON.stringify(body));req.end();});
const must=async(...args)=>{const r=await call(...args);assert.ok(r.status>=200&&r.status<300,args[0]+' '+JSON.stringify(r));return r.body;};
const machine=(route,method='GET',body)=>must('/api/zcrm/v1'+route,method,body,serviceToken);
const key=()=>randomUUID();
const check=async(name,fn)=>{try{await fn();passed.push(name);console.log('PASS '+name);}catch(e){failed.push({name,error:e.stack});console.log('FAIL '+name+': '+e.message);}};
const human=(route,body)=>must('/api/zcrm-admin'+route,'POST',body);

async function setup(){
  await mkdir(out,{recursive:true});
  if(process.env.ZCRM_FIXES_MANIFEST){sourceManifest=JSON.parse(await readFile(path.resolve(process.env.ZCRM_FIXES_MANIFEST),'utf8'));await verifyManifest();}
  storage=await mkdtemp(path.join(tmpdir(),'zcrm-fixes-fixture-'));
  control(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${password}'`);control(`create database ${database} owner ${role}`);created=true;
  const free=createServer();free.listen(0,'127.0.0.1');await once(free,'listening');const port=free.address().port;await new Promise(resolve=>free.close(resolve));base='http://127.0.0.1:'+port;
  // Register the real service while the feature is false (worker remains off),
  // then enable dynamic request handling after module evaluation. No timers or
  // provider calls are introduced and every non-loopback socket is refused.
  const entry=path.join(storage,'fixture-api-entry.mjs');
  await writeFile(entry,`import net from 'node:net';const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...a){const o=typeof a[0]==='object'?a[0]:{host:typeof a[1]==='string'?a[1]:'127.0.0.1'};if(o.host&&!['127.0.0.1','localhost','::1'].includes(o.host))throw new Error('Fixture forbids external socket');return connect.apply(this,a)};globalThis.fetch=async()=>{throw new Error('Fixture forbids provider fetch')};await import(${JSON.stringify(pathToFileURL(path.join(repo,'server-dist/index.js')).href)});process.env.LOCAL_ZCRM_API='true';`);
  const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(env,{NODE_ENV:'production',PUBLIC_APP_URL:'https://crm.example.com',LOCAL_DATABASE_URL:connectionString,LOCAL_STORAGE_ROOT:storage,LOCAL_API_HOST:'127.0.0.1',LOCAL_API_PORT:String(port),LOCAL_ALLOWED_ORIGINS:'https://crm.example.com',LOCAL_ZCRM_API:'false',ZCRM_ENCRYPTION_KEY:master,LOCAL_SYNC_AUTO:'false',LOCAL_DEMO_AUTH:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false',LOCAL_INTEGRATION_API:'false'});
  child=spawn(process.execPath,[entry],{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
  let healthy=false;for(let i=0;i<180;i++){if(child.exitCode!==null)throw new Error('Fixture API exited');try{if((await call('/health',undefined,undefined,null)).body?.database===database){healthy=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(healthy,'fixture API health');
  pool=new pg.Pool({connectionString});assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,false);
  const salt=randomBytes(16).toString('hex'),hash='scrypt$'+salt+'$'+scryptSync(loginPassword,salt,64).toString('hex');
  for(const [name,id] of Object.entries(ids).filter(([name])=>['admin','manager','other'].includes(name))){await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,name+'@zcrm-fixes.invalid',hash]);await pool.query('insert into local_user_roles(user_id,role,assigned_by)values($1,$2,$3)',[id,name==='admin'?'admin':'manager',ids.admin]);}
  session=await must('/api/local-auth/login','POST',{email:'admin@zcrm-fixes.invalid',password:loginPassword},null);token=session.token;secrets.push(token);
  for(const name of ['manager','other']){actors[name]=await must('/api/local-auth/login','POST',{email:name+'@zcrm-fixes.invalid',password:loginPassword},null);secrets.push(actors[name].token);}
  await pool.query("insert into local_customers(id,customer_code,name,phone,commerce_kind,manager_id,tenant_id)values($1,'QA-FIX-CUSTOMER','Fixture money customer','0900000091','individual',$2,'local-tenant')",[ids.customer,ids.manager]);
  await pool.query("insert into local_products(id,sku,name,price,tenant_id,manager_id)values($1,'QA-FIX-STOCK','Fixture product',100000,'local-tenant',$2)",[ids.product,ids.manager]);
  await human('/products/'+ids.product+'/profile',{kind:'stock',unit:'cái',variant:'',requiredFields:[]});
  const configured=await human('/connections',{org_id:'fixture-fixes',tenant_id:'local-tenant',name:'Fixture fixes integration',origin:'https://zcrm.example.com',enabled:true,generate_secrets:true,actor_mappings:[{zcrm_user_id:'fixture-manager',crm_user_id:ids.manager}],customer_ids:[ids.customer],product_grants:[{product_id:ids.product,warehouse_ids:[]}]});
  serviceToken=configured.one_time_secrets.token;secrets.push(serviceToken,configured.one_time_secrets.webhook_secret);
}

async function createOrder(terms={},quantity=10){
  const {parseDraft,fingerprint}=await import(pathToFileURL(path.resolve(repo,'../outputs/zcrm-integration-20261029/reference/commerce-domain.ts')).href);
  const draft=parseDraft({customerId:ids.customer,orderedBy:'Fixture ordered by',recipient:{name:'Fixture receiver',phone:'0900000091',address:'Fixture only address'},desiredDate:'2026-11-25',notes:'TEST isolated finance, no real shipment',lines:[{productId:ids.product,name:'Fixture product',kind:'stock',quantity,unit:'cái',proposedPrice:null,specifications:{},attachments:[]}]});
  const quote=await machine('/quotes','POST',{draft,fingerprint:fingerprint(draft),actorId:ids.manager,source:'ZCRM'});
  const result=await must('/api/zcrm/v1/draft-orders','POST',{draft,quoteToken:quote.token,fingerprint:quote.fingerprint,actorId:ids.manager,source:'ZCRM',existingOrderId:null,attachments:[]},serviceToken,{'Idempotency-Key':key()});
  await human('/orders/'+result.order.id+'/review',{action:'approve',expected_revision:1,idempotency_key:key(),reason:'Fixture approved terms',vat_rate:'0',...terms});
  const order=await machine('/customers/'+ids.customer+'/orders/'+result.order.id);
  expectedOrders.set(order.id,{total:order.total,collected:0,refunded:0,credit:0});return order;
}

function assertProjection(value,e,label){
  const net=e.collected-e.refunded,due=Math.max(0,e.total-e.credit-net),status=due===0?'paid':net>0?'partial':'pending';
  for(const [field,expected] of Object.entries({total_paid:e.collected,refunded:e.refunded,return_credit:e.credit,net_collected:net,remaining_amount:due,payment_status:status}))assert.equal(value[field],expected,label+' '+field);
}
async function recordPayment(order,amount,extra={}){
  const result=await must('/api/order-payments/record','POST',{order_id:order.id,payment_amount:amount,payment_type:'installment',payment_date:new Date().toISOString(),...extra});
  const e=expectedOrders.get(order.id);e.collected+=amount;assertProjection(result.order,e,'Immediate record response');return result.payment.id;
}
async function fixtureAuthorizedQuery(sql,values){const db=await pool.connect();try{await db.query('begin');await db.query("select set_config('zcrm.authorized_write','on',true)");const r=await db.query(sql,values);await db.query('commit');return r;}catch(e){await db.query('rollback');throw e;}finally{db.release();}}

async function assertMoney(order,label){
  const e=expectedOrders.get(order.id),net=e.collected-e.refunded,due=Math.max(0,e.total-e.credit-net);
  const [rows,detail,paymentRows,zdetail,zrows,summary]=await Promise.all([
    must('/api/orders?'+new URLSearchParams({search:order.code})),must('/api/orders/'+order.id),must('/api/order-payments/summary'),
    machine('/customers/'+ids.customer+'/orders/'+order.id),machine('/customers/'+ids.customer+'/orders?'+new URLSearchParams({q:order.code})),machine('/customers/'+ids.customer+'/summary'),
  ]);
  const row=rows.find(r=>r.id===order.id),payment=paymentRows.find(r=>r.order_id===order.id),zrow=zrows.items.find(r=>r.id===order.id);assert.ok(row&&payment&&zrow,label+' all read surfaces contain order');
  for(const [name,value]of [['CRM list',row],['CRM detail',detail.order||detail],['payment summary',payment]])assertProjection(value,e,label+' '+name);
  assert.equal(zdetail.amounts.collected,e.collected,label+' ZCRM gross collected');assert.equal(zdetail.amounts.refunded,e.refunded,label+' ZCRM gross refunded');assert.equal(zdetail.amounts.due,due,label+' ZCRM due');assert.deepEqual(zrow.payment,zdetail.payment,label+' list/detail payment status');
  const expectedStatus=due===0?'paid':net>0?'partial':'pending';assert.equal(row.payment_status,expectedStatus,label+' CRM status');assert.equal(zdetail.payment.code,expectedStatus,label+' ZCRM status');
  const all=[...expectedOrders.values()];assert.equal(summary.netSales,all.reduce((s,r)=>s+r.total-r.credit,0),label+' customer sales');assert.equal(summary.collected,all.reduce((s,r)=>s+r.collected-r.refunded,0),label+' customer net paid');assert.equal(summary.due,all.reduce((s,r)=>s+Math.max(0,r.total-r.credit-r.collected+r.refunded),0),label+' customer due');
}

async function financeChecks(){
  const order=await createOrder(),e=expectedOrders.get(order.id);
  const record=amount=>recordPayment(order,amount);
  const first=await record(200000),second=await record(300000);
  await check('Multiple actual receipt mutations agree on all canonical read APIs',()=>assertMoney(order,'two receipts'));
  const refund=await human('/orders/'+order.id+'/refunds',{idempotency_key:key(),amount:100000,payment_id:first,reason:'Fixture partial refund without return credit'});e.refunded=100000;
  await check('Unlinked partial refund reopens due consistently',()=>assertMoney(order,'refund'));
  const lineId=(await pool.query('select items from local_orders where id=$1',[order.id])).rows[0].items[0].id;
  const ret=await human('/orders/'+order.id+'/returns',{idempotency_key:key(),credit_amount:200000,lines:[{line_id:lineId,quantity:2}],reason:'Fixture partial return credit'});e.credit=200000;
  await check('Partial return credit and refund are applied once',()=>assertMoney(order,'return credit'));
  await human('/orders/'+order.id+'/refunds',{idempotency_key:key(),amount:1,payment_id:first,reversal_of:refund.id,reason:'Fixture refund reversal'});e.refunded=0;
  await human('/orders/'+order.id+'/returns',{idempotency_key:key(),reversal_of:ret.id,reason:'Fixture return reversal'});e.credit=0;
  await check('Both immutable reversal ledgers restore exact due',()=>assertMoney(order,'both reversals'));
  await pool.query("insert into local_projection_tombstones(source_table,source_key,tombstone_kind)values('order_payments',$1,'LOCAL')",[second]);e.collected-=300000;
  await check('Payment tombstone changes all projections without inventing money',()=>assertMoney(order,'payment tombstone'));
  await pool.query("delete from local_projection_tombstones where source_table='order_payments' and source_key=$1",[second]);e.collected+=300000;
  await pool.query("update local_orders set status='returned' where id=$1",[order.id]);
  await check('Physical returned status retains receipts and due in customer summary',()=>assertMoney(order,'physically returned'));
  await check('Order status PATCH response retains canonical receipts/refund/credit/net/due',async()=>{const result=await must('/api/orders/'+order.id,'PATCH',{status:'pending'});assertProjection(result,e,'Immediate status PATCH');await assertMoney(order,'status patch');});
  await check('Over-refund and over-return are rejected atomically',async()=>{
    const before=(await pool.query('select (select count(*) from local_order_refunds) refunds,(select count(*) from local_order_returns) returns')).rows[0];
    assert.equal((await call('/api/zcrm-admin/orders/'+order.id+'/refunds','POST',{idempotency_key:key(),amount:200001,payment_id:first,reason:'Fixture illegal refund'})).status,422);
    assert.equal((await call('/api/zcrm-admin/orders/'+order.id+'/returns','POST',{idempotency_key:key(),credit_amount:1000001,lines:[{line_id:lineId,quantity:11}],reason:'Fixture illegal return'})).status,422);
    assert.deepEqual((await pool.query('select (select count(*) from local_order_refunds) refunds,(select count(*) from local_order_returns) returns')).rows[0],before);await assertMoney(order,'rejections');
  });
  await check('Plain receipt POST and both delete APIs recalculate persisted and response totals',async()=>{
    const clean=await createOrder(),ex=expectedOrders.get(clean.id),p=await must('/api/order-payments','POST',{order_id:clean.id,payment_amount:250000,payment_type:'installment'});assert.equal(Number(p.payment_amount),250000);ex.collected+=250000;await assertMoney(clean,'plain payment create');
    await recordPayment(clean,300000);await assertMoney(clean,'record after plain receipt');
    const deleted=await must('/api/order-payments/by-id/'+p.id,'DELETE');ex.collected-=250000;assertProjection(deleted.order,ex,'Immediate single delete');await assertMoney(clean,'single receipt delete');
    const allDeleted=await must('/api/order-payments/'+clean.id,'DELETE');ex.collected=0;assertProjection(allDeleted.order,ex,'Immediate delete all');await assertMoney(clean,'all receipts delete');
  });
  await check('Receipt 1m plus independent GHN expense80k keeps receipt/income1m, due0 and cash920k',async()=>{
    const clean=await createOrder();await recordPayment(clean,1000000,{deduction:{amount:80000,category:'shipping_fee',description:'Fixture full receipt independent fee',expense_code:'QA-FEE-FULL-'+key()}});await assertMoney(clean,'full receipt plus fee');
    const tx=await must('/api/transactions?orderId='+clean.id),income=tx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0),expense=tx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);assert.equal(income,1000000);assert.equal(expense,80000);assert.equal(income-expense,920000);assert.ok((await must('/api/expenses')).some(t=>t.description==='Fixture full receipt independent fee'&&t.amount===80000));
  });
  await check('Receipt920k plus independent GHN expense80k retains customer due80k',async()=>{
    const clean=await createOrder();scenarioOrders.partialFee=clean;await recordPayment(clean,920000,{deduction:{amount:80000,category:'shipping_fee',description:'Fixture partial receipt independent fee',expense_code:'QA-FEE-PARTIAL-'+key()}});await assertMoney(clean,'partial receipt plus fee');
    const tx=await must('/api/transactions?orderId='+clean.id);assert.equal(tx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0),920000);assert.equal(tx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0),80000);
    const before=(await pool.query('select (select count(*) from local_order_payments) receipts,(select count(*) from local_expenses) expenses,(select count(*) from local_transactions) tx')).rows[0];assert.equal((await call('/api/order-payments/record','POST',{order_id:clean.id,payment_amount:80001,deduction:{amount:1}})).status,422);assert.deepEqual((await pool.query('select (select count(*) from local_order_payments) receipts,(select count(*) from local_expenses) expenses,(select count(*) from local_transactions) tx')).rows[0],before);
  });
  await check('Actual full receipt then refund reopens due without reducing gross receipts',async()=>{
    const clean=await createOrder(),payment=await recordPayment(clean,1000000);await human('/orders/'+clean.id+'/refunds',{idempotency_key:key(),amount:500000,payment_id:payment,reason:'Fixture refund after full receipt'});expectedOrders.get(clean.id).refunded=500000;await assertMoney(clean,'fully paid refunded');
  });
  await check('Distinct existing fee73k is an expense and retains actual customer due80k',async()=>{const clean=await createOrder();scenarioOrders.partialFeeUi=clean;await recordPayment(clean,920000,{deduction:{amount:73000,category:'shipping_fee',description:'Fixture distinct existing fee for UI',expense_code:'QA-FEE-UI-'+key()}});await assertMoney(clean,'distinct UI fee');});
  return order;
}

const inv='/api/invoice-workspace';
async function invoiceChecks(){
  const company=await must(inv+'/companies','POST',{tax_code:'0100000001',legal_name:'Fixture invoice company',reason:'Isolated regression only'});
  const preview=order=>must(inv+'/sources/ORDER/'+order.id+'?company_id='+company.id);
  const detail=id=>must(inv+'/invoices/'+id);
  const draftBody=(order,source,lines)=>({company_id:company.id,request_key:key(),buyer:{company_name:'Fixture invoice buyer',tax_code:'0100000002'},currency:'VND',business_reference:'TEST-'+key(),reason:'Isolated source invoice regression',source_type:'ORDER',source_id:order.id,source_revision:source.revision,lines:lines||source.lines.map(l=>({source_line:l.source_line,quantity:l.quantity}))});
  const draft=async(order,source,lines)=>{const r=await must(inv+'/drafts','POST',draftBody(order,source,lines));return detail(r.invoice.id);};
  for(const [name,terms,net,tax,total]of [['VAT8',{vat_rate:'8'},1000000,80000,1080000],['Discount and shipping',{discount:100000,shipping:30000},930000,0,930000],['Combined terms',{discount:100000,shipping:30000,vat_rate:'8'},930000,74400,1004400]])await check('ORDER invoice preview/save preserve '+name+' exactly',async()=>{
    const order=await createOrder(terms);assert.equal(order.total,total);const source=await preview(order);assert.equal(source.lines.reduce((s,l)=>s+Number(l.subtotal),0),net);assert.equal(source.lines.reduce((s,l)=>s+Number(l.vat_amount),0),tax);assert.equal(source.lines.reduce((s,l)=>s+Number(l.total),0),total);const saved=await draft(order,source);assert.equal(Number(saved.invoice.total_amount),net);assert.equal(Number(saved.invoice.vat_amount),tax);assert.equal(Number(saved.invoice.total_with_vat),total);const sourceSnapshot=(await pool.query('select source_snapshot from local_einvoices where id=$1',[saved.invoice.id])).rows[0].source_snapshot;assert.deepEqual(sourceSnapshot.invoice_basis,(await pool.query('select commercial_snapshot from local_orders where id=$1',[order.id])).rows[0].commercial_snapshot.invoice_basis);assert.equal((await preview(order)).lines.length,0);
  });
  await check('Fractional quantity and two invoice drafts exhaust exact net/VAT/total capacities',async()=>{
    const order=await createOrder({discount:25000,vat_rate:'8'},2.5);assert.equal(order.total,243000);const source=await preview(order),line=source.lines[0],a=await draft(order,source,[{source_line:line.source_line,quantity:'1.25'}]),b=await draft(order,await preview(order));for(const[field,expected]of [['total_amount',225000],['vat_amount',18000],['total_with_vat',243000]])assert.equal(Number(a.invoice[field])+Number(b.invoice[field]),expected);assert.equal((await preview(order)).lines.length,0);assert.equal((await call(inv+'/drafts','POST',draftBody(order,source,[{source_line:line.source_line,quantity:'0.01'}]))).status,409);
  });
  await check('Concurrent partial source drafts cannot reserve above quantity/net/VAT limits',async()=>{
    const order=await createOrder({discount:100000,vat_rate:'8'}),source=await preview(order),line=source.lines[0],body=draftBody(order,source,[{source_line:line.source_line,quantity:7}]);const result=await Promise.all([call(inv+'/drafts','POST',body),call(inv+'/drafts','POST',{...body,request_key:key()})]);assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);const rest=await preview(order);assert.equal(Number(rest.lines[0].quantity),3);const b=await draft(order,rest),a=await detail(result.find(r=>r.status===201).body.invoice.id);assert.equal(Number(a.invoice.total_with_vat)+Number(b.invoice.total_with_vat),order.total);
  });
  await check('Unrepresentable last VAT fragment rejects preview/save atomically with explicit reconciliation',async()=>{
    const order=await createOrder({discount:299900,vat_rate:'8'},3);assert.equal(order.total,108);const source=await preview(order),line=source.lines[0];await draft(order,source,[{source_line:line.source_line,quantity:1}]);await draft(order,await preview(order),[{source_line:line.source_line,quantity:1}]);const before=(await pool.query('select count(*) n from local_einvoices')).rows[0].n;assert.equal((await call(inv+'/sources/ORDER/'+order.id+'?company_id='+company.id)).status,409);assert.equal((await call(inv+'/drafts','POST',draftBody(order,source,[{source_line:line.source_line,quantity:1}]))).status,409);assert.equal((await pool.query('select count(*) n from local_einvoices')).rows[0].n,before);
  });
  await check('Ambiguous legacy approval cannot silently produce VAT0 invoice',async()=>{
    const order=await createOrder({vat_rate:'8'});await fixtureAuthorizedQuery("update local_orders set commercial_snapshot=commercial_snapshot-'invoice_basis' where id=$1",[order.id]);assert.equal((await call(inv+'/sources/ORDER/'+order.id+'?company_id='+company.id)).status,409);const before=(await pool.query('select count(*) n from local_einvoices')).rows[0].n;assert.equal((await call(inv+'/drafts','POST',draftBody(order,{revision:'invalid'},[{source_line:'0',quantity:10}]))).status,409);assert.equal((await pool.query('select count(*) n from local_einvoices')).rows[0].n,before);
    const legacy=(await pool.query('select total_amount::text,approval_revision,commercial_snapshot from local_orders where id=$1',[order.id])).rows[0],body={expected_revision:legacy.approval_revision,idempotency_key:key(),reason:'Fixture confirmed original approval VAT basis',vat_rate:'8'};
    assert.equal((await call('/api/zcrm-admin/orders/'+order.id+'/invoice-basis','POST',{...body,idempotency_key:key(),vat_rate:'0'})).status,409);const restored=await human('/orders/'+order.id+'/invoice-basis',body);assert.deepEqual(await human('/orders/'+order.id+'/invoice-basis',body),restored);const after=(await pool.query('select total_amount::text,approval_revision,commercial_snapshot from local_orders where id=$1',[order.id])).rows[0];assert.equal(after.total_amount,legacy.total_amount);assert.equal(after.commercial_snapshot.tax,legacy.commercial_snapshot.tax);assert.equal(after.approval_revision,legacy.approval_revision+1);assert.equal((await pool.query("select count(*)::int n from zcrm.audit where entity_id=$1 and action='order.invoice-basis'",[order.id])).rows[0].n,1);const source=await preview(order);await draft(order,source);assert.equal((await call('/api/zcrm-admin/orders/'+order.id+'/invoice-basis','POST',{...body,idempotency_key:key(),expected_revision:after.approval_revision})).status,409);
  });
  await check('Existing approved invoice basis is immutable even when rounded total/VAT would remain equal',async()=>{
    const order=await createOrder({vat_rate:'8'},0.1);assert.equal(order.total,10800);const original=(await pool.query('select approval_revision,commercial_snapshot,total_amount::text,vat_rate::text from local_orders where id=$1',[order.id])).rows[0];assert.equal((await pool.query("select count(*)::int n from local_einvoices where source_snapshot->>'source_id'=$1",[order.id])).rows[0].n,0);const r=await call('/api/zcrm-admin/orders/'+order.id+'/invoice-basis','POST',{expected_revision:original.approval_revision,idempotency_key:key(),reason:'Fixture must not replace existing approved8 percent basis',vat_rate:'8.001'});assert.equal(r.status,409);assert.deepEqual((await pool.query('select approval_revision,commercial_snapshot,total_amount::text,vat_rate::text from local_orders where id=$1',[order.id])).rows[0],original);
  });
  await check('Issued fixture invoice source snapshot and line bytes survive order and receipt changes',async()=>{
    const order=await createOrder({discount:100000,shipping:30000,vat_rate:'8'}),source=await preview(order),saved=await draft(order,source);
    // Test-owned DB seeds an issued state without issuing to a provider. This is
    // fixture construction, not evidence of a real issued carrier/tax document.
    await pool.query("update local_einvoices set status='issued',is_draft=false,invoice_number=$2,invoice_series='C26TQA',template_code='1' where id=$1",[saved.invoice.id,'FIX-'+key()]);
    const evidence=async()=>JSON.stringify((await pool.query("select row_to_json(i) invoice,(select json_agg(l order by line_no) from local_invoice_lines l where l.invoice_id=i.id) lines from local_einvoices i where id=$1",[saved.invoice.id])).rows[0]);const before=await evidence();
    await recordPayment(order,100000);await pool.query("update local_orders set notes='Fixture later change',updated_at=now() where id=$1",[order.id]);assert.equal(await evidence(),before);assert.equal((await detail(saved.invoice.id)).invoice.status,'issued');assert.equal((await call(inv+'/drafts/'+saved.invoice.id,'PATCH',{request_key:key(),expected_revision:saved.invoice.revision,reason:'Fixture attempted issued change',lines:[]})).status,409);assert.equal(await evidence(),before);
  });
}

// Adapter deliberately accepts no fabricated financial calculations. Once the
// implementer's final HTTP projection contract is fixed, extend these fixture
// checks to assert the three returned numbers and actual COD default together.
export const acceptanceCases=[
  'Actual CRM order list/detail/payment summary agrees with ZCRM list/detail/customer summary after each actual payment mutation',
  'Multiple receipts, unlinked refund, partial return credit, both reversals and payment tombstone/restore use the same net collected and due',
  'Physical returned status retains money until actual credit/refund ledger changes it',
  'Approved VAT/discount/shipping is transferred to ORDER invoice source exactly or explicitly blocked before mutation',
  'Partial and multiple invoices exhaust only their allocated commercial terms and cannot double-reserve quantities/amounts',
  'An issued invoice and immutable source evidence remain byte-identical after later order/ledger changes',
];

async function run(){assert.ok(process.env.ZCRM_FIXES_MANIFEST,'Frozen source manifest required');await setup();await check('Disposable NOSUPERUSER database, real API, real login and service-token scopes ready',async()=>{assert.equal((await machine('/capabilities')).version,1);});const order=await financeChecks();await invoiceChecks();await testZcrmFixedRoutes({repo,out,pool,base,session,actors,ids,call,must,check,order,scenarioOrders});await verifyManifest();if(failed.length)throw new Error(failed.length+' independent acceptance groups failed; see report');runStatus='passed';}
if(process.env.ZCRM_FIXES_RUN!=='1'){console.log('PREPARED ONLY: no database/process started. Set ZCRM_FIXES_RUN=1 only after final fixed manifest is provided.');}
else try{await run();}catch(e){runError=e.stack;throw e;}finally{if(child&&child.exitCode===null){child.kill();await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(resolve,3000))]);}await pool?.end();if(created&&/^zcrm_fixes_\d+_\d+$/.test(database))control('drop database '+database+' with (force)');if(created&&/^zcrm_fixes_role_\d+_\d+$/.test(role))control('drop role if exists '+role);if(storage&&path.basename(storage).startsWith('zcrm-fixes-fixture-'))await rm(storage,{recursive:true,force:true});for(const secret of secrets)assert.ok(!logs.includes(secret));await verifyManifest();const report=JSON.stringify({passed,count:passed.length,failed,failedCount:failed.length,preparedCases:acceptanceCases,status:runStatus,error:runError,manifestCount:sourceManifest?.length,realIntegration:'not tested',issuedInvoice:'isolated seeded issued state, no provider issuance'},null,2);await writeFile(path.join(out,'finance-http-report.json'),report);await writeFile(path.join(out,'finance-http-report-'+suffix+'.json'),report);console.log('CLEANUP only disposable API/database/role/storage.');}
