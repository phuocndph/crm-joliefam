import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';
import {build} from 'vite';

export async function testZcrmFixedRoutes({repo,out,pool,base,session,actors,ids,call,must,check,order,scenarioOrders}){
  const duplicate=randomUUID(),outside=randomUUID(),mismatch=randomUUID(),tombstone=randomUUID(),missing=randomUUID();
  await pool.query("update local_orders set created_at='2020-01-01T00:00:00Z' where id=$1",[order.id]);
  for(let i=0;i<55;i++)await pool.query("insert into local_orders(id,customer_id,manager_id,tenant_id,order_number,display_order_number,status,total_amount,created_at,updated_at)values($1,$2,$3,'local-tenant',$4,$4,'pending',100,now(),now())",[randomUUID(),ids.customer,ids.manager,'QA-PAGE-'+i]);
  await pool.query("insert into local_customers(id,customer_code,name,phone,manager_id,tenant_id)values($1,'QA-DUPLICATE','Fixture money customer','0900000082',$2,'local-tenant')",[duplicate,ids.other]);
  await pool.query("insert into local_orders(id,customer_id,manager_id,tenant_id,order_number,status,total_amount)values($1,$2,$3,'other-tenant','QA-MISMATCH-TENANT','pending',100),($4,$2,$5,'local-tenant','QA-OTHER-OWNER','pending',100),($6,$2,$5,'local-tenant','QA-TOMBSTONED','pending',100)",[mismatch,ids.customer,ids.manager,outside,ids.other,tombstone]);
  await pool.query("insert into local_projection_tombstones(source_table,source_key,tombstone_kind)values('orders',$1,'LOCAL')",[tombstone]);
  await check('Deep-link detail resolves exact old order outside first50 and enforces owner/tombstone/missing',async()=>{
    assert.ok(!(await must('/api/orders?limit=50&offset=0')).some(o=>o.id===order.id));assert.equal((await must('/api/orders/'+order.id)).id,order.id);
    for(const id of [missing,tombstone])assert.equal((await call('/api/orders/'+id)).status,404);assert.equal((await call('/api/orders/'+order.id,'GET',undefined,actors.other.token)).status,404);assert.equal((await call('/api/orders/'+order.id,'GET',undefined,actors.manager.token)).status,200);
    const c=await must('/api/customers/'+ids.customer);assert.ok(c.orders.some(o=>o.id===order.id));assert.ok(!c.orders.some(o=>o.id===mismatch||o.id===tombstone));const owner=await must('/api/customers/'+ids.customer,'GET',undefined,actors.manager.token);assert.ok(!owner.orders.some(o=>o.id===outside));
  });
  await check('Explicit grant preserves legitimate ZCRM orders for legacy null-tenant customer',async()=>{
    await pool.query('update local_customers set tenant_id=null where id=$1',[ids.customer]);const c=await must('/api/customers/'+ids.customer,'GET',undefined,actors.manager.token);assert.equal(c.customer.tenant_id,null);assert.ok(c.orders.some(o=>o.id===order.id),'nonnull tenant ZCRM order remains with explicit same-connection grant');assert.ok(!c.orders.some(o=>o.id===mismatch||o.id===outside||o.id===tombstone));
    await pool.query('update local_customers set tenant_id=$2 where id=$1',[ids.customer,'local-tenant']);
  });
  let server,browser,root;
  const errors=[],requests=[];
  try{
    root=await mkdtemp(path.join(tmpdir(),'zcrm-fixes-routes-ui-'));await mkdir(out,{recursive:true});
    await build({root:repo,envDir:false,mode:'production',logLevel:'warn',define:{'import.meta.env.VITE_BACKEND_MODE':JSON.stringify('local'),'import.meta.env.VITE_LOCAL_API_URL':JSON.stringify(''),'import.meta.env.VITE_LOCAL_DEMO_AUTH':JSON.stringify('false'),'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(''),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('')},build:{outDir:root,emptyOutDir:true,sourcemap:false}});
    const app=express();app.use((req,res,next)=>{if(!req.path.startsWith('/api/'))return next();requests.push({method:req.method,url:req.originalUrl});const headers={...req.headers,host:'crm.example.com'};delete headers.origin;const forward=httpRequest(base+req.originalUrl,{method:req.method,headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});forward.on('error',()=>{if(!res.headersSent)res.status(502).json({message:'Isolated proxy failure'});else res.destroy();});req.pipe(forward);});app.use(express.static(root));app.use((_req,res)=>res.sendFile(path.join(root,'index.html')));server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
    const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());await context.addInitScript(s=>localStorage.setItem('local_user_session',JSON.stringify(s)),{...session,actor:ids.admin,role:'admin'});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const openOrder=async(alias,id=order.id)=>{await page.goto(origin+'/orders?'+alias+'='+id,{waitUntil:'domcontentloaded'});await page.getByRole('dialog').filter({hasText:'Mã đơn: '+order.code}).waitFor();};
    for(const alias of ['order_id','orderId'])await check('Actual /orders route '+alias+' opens old exact order beyond first50',async()=>{await openOrder(alias);const dialog=page.getByRole('dialog');assert.ok((await dialog.textContent()).includes(order.code));assert.ok(requests.some(r=>r.url==='/api/orders/'+order.id));assert.equal(new URL(page.url()).searchParams.has(alias),false);await dialog.screenshot({path:path.join(out,'order-deep-'+alias+'.png')});});
    await check('Actual GHN dialog initializes COD from canonical due500k after refund/reversal history',async()=>{
      // Directory/provider configuration is absent in this fixture. No hosted
      // request or shipment is made; only the actual draft's initial COD is read.
      const prior=requests.length;await page.getByRole('dialog').getByRole('button',{name:'Tạo đơn GHN',exact:true}).click();await page.locator('#ghn-cod').waitFor();assert.equal((await page.locator('#ghn-cod').inputValue()).replace(/\D/g,''),'500000');assert.ok(!requests.slice(prior).some(r=>r.method==='POST'&&/^\/api\/ghn\/orders(?:\?|$)/.test(r.url)));await page.getByRole('dialog').last().screenshot({path:path.join(out,'cod-canonical-due.png')});
    });
    await check('Actual /customers ID route selects correct duplicate-name profile and its exact source link',async()=>{
      await page.goto(origin+'/customers?customerId='+duplicate,{waitUntil:'domcontentloaded'});const dialog=page.getByRole('dialog',{name:'Hồ sơ khách hàng',exact:true});await dialog.getByText('QA-DUPLICATE · 0900000082',{exact:true}).waitFor();assert.ok(!(await dialog.textContent()).includes(order.code));await page.goto(origin+'/customers?customer_id='+ids.customer,{waitUntil:'domcontentloaded'});await dialog.getByRole('link',{name:order.code,exact:true}).waitFor();assert.ok(!(await dialog.textContent()).includes('QA-MISMATCH-TENANT'));await dialog.getByRole('link',{name:order.code,exact:true}).click();await page.getByRole('dialog').filter({hasText:'Mã đơn: '+order.code}).waitFor();
    });
    await check('Actual customer wrapper shows existing fee73k separately from due80k and never subtracts entered fee from receipt',async()=>{
      await page.goto(origin+'/customers',{waitUntil:'domcontentloaded'});const customerRow=page.getByRole('row').filter({hasText:'QA-FIX-CUSTOMER'});await customerRow.getByRole('button',{name:'Mở menu',exact:true}).click();await page.getByRole('menuitem',{name:'Xem chi tiết',exact:true}).click();const customerDialog=page.getByRole('dialog',{name:'Chi tiết khách hàng',exact:true});await customerDialog.getByRole('row').filter({hasText:(scenarioOrders.partialFeeUi||scenarioOrders.partialFee).code}).getByRole('button',{name:'Xem chi tiết',exact:true}).click();const detail=page.getByRole('dialog',{name:'Chi tiết đơn hàng',exact:true});await detail.getByRole('button',{name:'Thêm thanh toán',exact:true}).click();const payment=page.getByRole('dialog',{name:'Thêm thanh toán',exact:true}),input=payment.getByLabel('Số tiền thanh toán');await input.waitFor();assert.equal((await input.inputValue()).replace(/\D/g,''),'80000');const expenseCard=payment.getByText('Chi phí',{exact:true}).locator('..');assert.equal((await expenseCard.textContent()).replace(/\D/g,''),'73000','Existing expense card preserves real73k without conflating80k due');await payment.getByLabel('Ghi thêm chi phí do mình chịu',{exact:true}).check();const fee=payment.getByText('Số tiền chi phí',{exact:true}).locator('..').getByRole('textbox');await fee.fill('80000');assert.equal((await input.inputValue()).replace(/\D/g,''),'80000');assert.equal(await payment.getByRole('button',{name:'Thêm thanh toán',exact:true}).isEnabled(),true);await payment.screenshot({path:path.join(out,'customer-payment-fee-independent.png')});
    });
    await check('390px actual order/customer routes resolve the same old exact IDs',async()=>{
      await page.setViewportSize({width:390,height:844});await openOrder('order_id');let dialog=page.getByRole('dialog');const bounds=await dialog.boundingBox();assert.ok(bounds.width<=390);await dialog.screenshot({path:path.join(out,'order-deep-mobile.png')});await page.goto(origin+'/customers?customerId='+ids.customer,{waitUntil:'domcontentloaded'});dialog=page.getByRole('dialog',{name:'Hồ sơ khách hàng',exact:true});await dialog.getByRole('link',{name:order.code,exact:true}).waitFor();assert.ok((await dialog.boundingBox()).width<=390);await dialog.screenshot({path:path.join(out,'customer-deep-mobile.png')});
    });
    for(const [kind,id]of [['missing',missing],['tombstoned',tombstone]])await check('Actual '+kind+' order target shows bounded error without unrelated detail fallback',async()=>{
      await page.goto(origin+'/orders?order_id='+id,{waitUntil:'domcontentloaded'});await page.getByRole('alert').filter({hasText:'Không tìm thấy đơn'}).waitFor();assert.equal(await page.getByRole('dialog').count(),0);assert.ok(requests.some(r=>r.url==='/api/orders/'+id));
    });
    await check('Actual denied order and customer links reveal no protected record details',async()=>{
      const deniedContext=await browser.newContext({viewport:{width:390,height:844}});await deniedContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());await deniedContext.addInitScript(s=>localStorage.setItem('local_user_session',JSON.stringify(s)),{...actors.other,actor:ids.other,role:'manager'});const deniedPage=await deniedContext.newPage();await deniedPage.goto(origin+'/orders?order_id='+order.id,{waitUntil:'domcontentloaded'});await deniedPage.getByRole('alert').filter({hasText:'Không tìm thấy đơn'}).waitFor();assert.equal(await deniedPage.getByRole('dialog').count(),0);
      // A wholly separate owner with no order/customer access is used below.
      await deniedPage.goto(origin+'/customers?customerId='+missing,{waitUntil:'domcontentloaded'});const dialog=deniedPage.getByRole('dialog',{name:'Hồ sơ khách hàng',exact:true});await dialog.getByRole('alert').waitFor();assert.ok(!(await dialog.textContent()).includes(order.code));await deniedContext.close();
    });
    assert.deepEqual(errors,[],'No runtime errors in actual full routes');
  }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(root&&path.basename(root).startsWith('zcrm-fixes-routes-ui-'))await rm(root,{recursive:true,force:true});}
}
